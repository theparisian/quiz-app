import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { AuthUser } from '../../shared/auth/middleware.js';

/**
 * Rapport de session pour l'interface super-admin (case study commercial).
 * Toutes les valeurs sont sérialisables (BigInt → string) : le service renvoie
 * directement l'objet destiné à la réponse JSON.
 */

const TERMINAL_STATES = ['ended', 'aborted'] as const;
type TerminalState = (typeof TERMINAL_STATES)[number];

/** `null` = super_admin (pas de restriction). Sinon filtre sur un cinéma. */
export type CinemaScope = bigint | null;

/** Valide le rôle et retourne le scope cinéma (ou null pour super_admin). */
export function resolveReportScope(user: AuthUser): CinemaScope {
  if (user.role === 'super_admin') return null;
  if (user.role === 'cinema_admin' && user.cinemaId !== null) return user.cinemaId;
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

/** Vérifie qu'un utilisateur peut consulter le cinéma ciblé. */
export function assertCinemaAccess(user: AuthUser, cinemaId: bigint): void {
  const scope = resolveReportScope(user);
  if (scope !== null && scope !== cinemaId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
}

interface AnswerOptionReport {
  answerId: string;
  position: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
  count: number;
}

interface QuestionReport {
  id: string;
  position: number;
  text: string;
  imageUrl: string | null;
  eligible: number;
  respondents: number;
  participationRate: number | null;
  correctCount: number;
  correctRate: number | null;
  avgResponseTimeMs: number | null;
  options: AnswerOptionReport[];
}

interface PodiumEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  score: number;
  rank: number;
}

export interface SessionReport {
  session: {
    id: string;
    slugShort: string;
    state: TerminalState;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
    quizTitle: string;
    quizSlug: string;
    cinemaName: string;
    cinemaSlug: string;
    screenName: string;
    sponsor: { name: string; logoUrl: string | null } | null;
  };
  players: {
    total: number;
    lobbyJoined: number;
    lateJoined: number;
    active: number;
  };
  completionRate: number | null;
  avgResponseTimeMs: number | null;
  questions: QuestionReport[];
  retention: Array<{ position: number; respondents: number }>;
  synthesis: {
    easiestQuestion: { position: number; text: string; correctRate: number } | null;
    hardestQuestion: { position: number; text: string; correctRate: number } | null;
    avgResponseTimeMs: number | null;
  };
  podium: PodiumEntry[];
  prizes: {
    total: number;
    consolationCount: number;
    byType: Array<{ type: string; count: number }>;
    emailProvidedCount: number;
    emailSentCount: number;
    redeemedCount: number;
    emailOptInRate: number | null;
    redemptionRate: number | null;
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / values.length);
}

/** Un joueur est « éligible » à une question s'il était présent à ce moment. */
function isEligibleForPosition(joinedQuestionPosition: number | null, position: number): boolean {
  if (joinedQuestionPosition === null) return true; // arrivé au lobby → toutes les questions
  return joinedQuestionPosition <= position;
}

/**
 * Charge et calcule le rapport complet d'une session terminée (ended ou aborted).
 */
export async function buildSessionReport(sessionId: bigint): Promise<SessionReport> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        select: {
          id: true,
          slug: true,
          title: true,
          sponsor: { select: { name: true, logoUrl: true } },
          questions: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              position: true,
              text: true,
              imageUrl: true,
              answers: {
                orderBy: { position: 'asc' },
                select: { id: true, position: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
      screen: {
        select: { name: true, cinema: { select: { name: true, slug: true } } },
      },
      players: {
        where: { status: { not: 'kicked' } },
        select: {
          id: true,
          pseudo: true,
          scoreTotal: true,
          rankFinal: true,
          joinedQuestionPosition: true,
          emailForPrize: true,
          avatar: { select: { imageUrl: true } },
        },
      },
      prizes: {
        select: {
          type: true,
          isConsolation: true,
          emailSentAt: true,
          redeemedAt: true,
          player: { select: { emailForPrize: true } },
        },
      },
    },
  });

  if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  if (!TERMINAL_STATES.includes(session.state as TerminalState)) {
    throw new AppError('Session is not terminated', 409, 'SESSION_NOT_TERMINATED');
  }

  const playerIds = session.players.map((p) => p.id);

  const answers =
    playerIds.length > 0
      ? await prisma.playerAnswer.findMany({
          where: { playerId: { in: playerIds }, chosenAnswerId: { not: null } },
          select: {
            playerId: true,
            questionId: true,
            chosenAnswerId: true,
            isCorrect: true,
            timeToAnswerMs: true,
          },
        })
      : [];

  // Index des réponses par question
  const answersByQuestion = new Map<string, typeof answers>();
  const answeredPlayerIds = new Set<string>();
  for (const a of answers) {
    answeredPlayerIds.add(a.playerId.toString());
    const key = a.questionId.toString();
    const bucket = answersByQuestion.get(key);
    if (bucket) bucket.push(a);
    else answersByQuestion.set(key, [a]);
  }

  // ── Joueurs ────────────────────────────────────────────────────────────────
  const total = session.players.length;
  const lateJoined = session.players.filter((p) => p.joinedQuestionPosition !== null).length;
  const lobbyJoined = total - lateJoined;
  const active = answeredPlayerIds.size;

  // ── Par question + rétention ─────────────────────────────────────────────────
  const questions: QuestionReport[] = [];
  const retention: Array<{ position: number; respondents: number }> = [];
  const allResponseTimes: number[] = [];

  for (const q of session.quiz.questions) {
    const qAnswers = answersByQuestion.get(q.id.toString()) ?? [];
    const respondents = qAnswers.length;
    const correctCount = qAnswers.filter((a) => a.isCorrect).length;
    const times = qAnswers
      .map((a) => a.timeToAnswerMs)
      .filter((t): t is number => t !== null && t !== undefined);
    for (const t of times) allResponseTimes.push(t);

    const eligible = session.players.filter((p) =>
      isEligibleForPosition(p.joinedQuestionPosition, q.position),
    ).length;

    const countByAnswerId = new Map<string, number>();
    for (const a of qAnswers) {
      if (a.chosenAnswerId === null) continue;
      const key = a.chosenAnswerId.toString();
      countByAnswerId.set(key, (countByAnswerId.get(key) ?? 0) + 1);
    }

    questions.push({
      id: q.id.toString(),
      position: q.position,
      text: q.text,
      imageUrl: q.imageUrl,
      eligible,
      respondents,
      participationRate: ratio(respondents, eligible),
      correctCount,
      correctRate: ratio(correctCount, respondents),
      avgResponseTimeMs: mean(times),
      options: q.answers.map((ans) => ({
        answerId: ans.id.toString(),
        position: ans.position,
        text: ans.text,
        isCorrect: ans.isCorrect,
        count: countByAnswerId.get(ans.id.toString()) ?? 0,
      })),
    });

    retention.push({ position: q.position, respondents });
  }

  // ── Taux de complétion (dernière question réellement jouée) ──────────────────
  let completionRate: number | null = null;
  const playedQuestions = questions.filter((q) => q.respondents > 0);
  const lastPlayed = playedQuestions[playedQuestions.length - 1];
  if (lastPlayed && active > 0) {
    completionRate = ratio(lastPlayed.respondents, active);
  }

  // ── Synthèse ─────────────────────────────────────────────────────────────────
  const ranked = questions
    .filter((q) => q.correctRate !== null)
    .map((q) => ({ position: q.position, text: q.text, correctRate: q.correctRate as number }));
  let easiestQuestion: SessionReport['synthesis']['easiestQuestion'] = null;
  let hardestQuestion: SessionReport['synthesis']['hardestQuestion'] = null;
  if (ranked.length > 0) {
    easiestQuestion = ranked.reduce((best, q) => (q.correctRate > best.correctRate ? q : best));
    hardestQuestion = ranked.reduce((worst, q) => (q.correctRate < worst.correctRate ? q : worst));
  }

  // ── Podium (top 3 par score) ─────────────────────────────────────────────────
  const podium: PodiumEntry[] = [...session.players]
    .sort((a, b) => b.scoreTotal - a.scoreTotal)
    .slice(0, 3)
    .map((p, i) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      avatarUrl: p.avatar?.imageUrl ?? null,
      score: p.scoreTotal,
      rank: p.rankFinal ?? i + 1,
    }));

  // ── Lots ─────────────────────────────────────────────────────────────────────
  const prizeTotal = session.prizes.length;
  const consolationCount = session.prizes.filter((p) => p.isConsolation).length;
  const byTypeMap = new Map<string, number>();
  for (const p of session.prizes) {
    byTypeMap.set(p.type, (byTypeMap.get(p.type) ?? 0) + 1);
  }
  const emailProvidedCount = session.prizes.filter(
    (p) => p.player.emailForPrize !== null && p.player.emailForPrize !== '',
  ).length;
  const emailSentCount = session.prizes.filter((p) => p.emailSentAt !== null).length;
  const redeemedCount = session.prizes.filter((p) => p.redeemedAt !== null).length;

  return {
    session: {
      id: session.id.toString(),
      slugShort: session.slugShort,
      state: session.state as TerminalState,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      quizTitle: session.quiz.title,
      quizSlug: session.quiz.slug,
      cinemaName: session.screen.cinema.name,
      cinemaSlug: session.screen.cinema.slug,
      screenName: session.screen.name,
      sponsor: session.quiz.sponsor
        ? { name: session.quiz.sponsor.name, logoUrl: session.quiz.sponsor.logoUrl }
        : null,
    },
    players: { total, lobbyJoined, lateJoined, active },
    completionRate,
    avgResponseTimeMs: mean(allResponseTimes),
    questions,
    retention,
    synthesis: {
      easiestQuestion,
      hardestQuestion,
      avgResponseTimeMs: mean(allResponseTimes),
    },
    podium,
    prizes: {
      total: prizeTotal,
      consolationCount,
      byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
      emailProvidedCount,
      emailSentCount,
      redeemedCount,
      emailOptInRate: ratio(emailProvidedCount, prizeTotal),
      redemptionRate: ratio(redeemedCount, emailSentCount),
    },
  };
}

export interface ReportableSessionRow {
  id: string;
  slugShort: string;
  state: TerminalState;
  createdAt: string;
  endedAt: string | null;
  quizTitle: string;
  quizSlug: string;
  cinemaName: string;
  cinemaSlug: string;
  screenName: string;
  sponsorName: string | null;
  players: number;
  lateJoined: number;
  completionRate: number | null;
  prizesCount: number;
}

/**
 * Liste des sessions terminées consultables (scopées cinéma), triées par date
 * décroissante. Le taux de complétion est calculé en lot pour la liste.
 */
export async function listReportableSessions(scope: CinemaScope): Promise<ReportableSessionRow[]> {
  const sessions = await prisma.session.findMany({
    where: {
      state: { in: [...TERMINAL_STATES] },
      ...(scope === null ? {} : { screen: { cinemaId: scope } }),
    },
    orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      slugShort: true,
      state: true,
      createdAt: true,
      endedAt: true,
      quiz: { select: { title: true, slug: true, sponsor: { select: { name: true } } } },
      screen: { select: { name: true, cinema: { select: { name: true, slug: true } } } },
      players: {
        where: { status: { not: 'kicked' } },
        select: { id: true, joinedQuestionPosition: true },
      },
    },
  });

  const sessionIds = sessions.map((s) => s.id);
  const allPlayerIds = sessions.flatMap((s) => s.players.map((p) => p.id));

  const answers =
    allPlayerIds.length > 0
      ? await prisma.playerAnswer.findMany({
          where: { playerId: { in: allPlayerIds }, chosenAnswerId: { not: null } },
          select: {
            playerId: true,
            question: { select: { position: true } },
            player: { select: { sessionId: true } },
          },
        })
      : [];

  const prizeCounts = await prisma.prize.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessionIds.length > 0 ? sessionIds : [BigInt(-1)] } },
    _count: { _all: true },
  });
  const prizeCountBySession = new Map<string, number>();
  for (const p of prizeCounts) {
    prizeCountBySession.set(p.sessionId.toString(), p._count._all);
  }

  // Agrégation des réponses par session : joueurs actifs + répondants par position
  interface SessionAgg {
    activePlayers: Set<string>;
    respondentsByPosition: Map<number, Set<string>>;
  }
  const aggBySession = new Map<string, SessionAgg>();
  for (const a of answers) {
    const sid = a.player.sessionId.toString();
    let agg = aggBySession.get(sid);
    if (!agg) {
      agg = { activePlayers: new Set(), respondentsByPosition: new Map() };
      aggBySession.set(sid, agg);
    }
    const pid = a.playerId.toString();
    agg.activePlayers.add(pid);
    const pos = a.question.position;
    const set = agg.respondentsByPosition.get(pos);
    if (set) set.add(pid);
    else agg.respondentsByPosition.set(pos, new Set([pid]));
  }

  return sessions.map((s) => {
    const agg = aggBySession.get(s.id.toString());
    let completionRate: number | null = null;
    if (agg && agg.activePlayers.size > 0 && agg.respondentsByPosition.size > 0) {
      const lastPos = Math.max(...agg.respondentsByPosition.keys());
      const respondentsLast = agg.respondentsByPosition.get(lastPos)?.size ?? 0;
      completionRate = respondentsLast / agg.activePlayers.size;
    }

    return {
      id: s.id.toString(),
      slugShort: s.slugShort,
      state: s.state as TerminalState,
      createdAt: s.createdAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      quizTitle: s.quiz.title,
      quizSlug: s.quiz.slug,
      cinemaName: s.screen.cinema.name,
      cinemaSlug: s.screen.cinema.slug,
      screenName: s.screen.name,
      sponsorName: s.quiz.sponsor?.name ?? null,
      players: s.players.length,
      lateJoined: s.players.filter((p) => p.joinedQuestionPosition !== null).length,
      completionRate,
      prizesCount: prizeCountBySession.get(s.id.toString()) ?? 0,
    };
  });
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export CSV : une ligne par session terminée d'un cinéma. Utile pour l'analyse
 * externe (l'interface visuelle reste la priorité).
 */
export async function buildCinemaSessionsCsv(cinemaId: bigint): Promise<string> {
  const rows = await listReportableSessions(cinemaId);

  const header = [
    'date',
    'salle',
    'quiz',
    'sponsor',
    'joueurs',
    'late_joins',
    'completion_pct',
    'lots_emis',
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    const date = r.endedAt ?? r.createdAt;
    const completionPct = r.completionRate === null ? null : Math.round(r.completionRate * 100);
    lines.push(
      [
        csvCell(date),
        csvCell(r.screenName),
        csvCell(r.quizTitle),
        csvCell(r.sponsorName),
        csvCell(r.players),
        csvCell(r.lateJoined),
        csvCell(completionPct),
        csvCell(r.prizesCount),
      ].join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
