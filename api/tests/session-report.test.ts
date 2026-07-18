import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import type { AuthUser } from '../src/shared/auth/middleware.js';
import { AppError } from '../src/shared/errors/app-error.js';
import {
  buildSessionReport,
  listReportableSessions,
  buildCinemaSessionsCsv,
  resolveReportScope,
  assertCinemaAccess,
} from '../src/modules/sessions/session-report.service.js';
import {
  createSuperAdminUser,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

let slugCounter = 0;
function uniqueSlugShort(): string {
  slugCounter += 1;
  return String(1000 + (slugCounter % 9000));
}

/** Quiz publié à 3 questions, chacune A(correcte)/B/C/D. */
async function seedQuiz(userId: bigint) {
  const quiz = await prisma.quiz.create({
    data: {
      slug: `rep-${Date.now()}-${slugCounter++}`,
      title: 'Quiz Rapport',
      status: 'published',
      createdByUserId: userId,
    },
  });

  const questions = [];
  for (let pos = 1; pos <= 3; pos++) {
    const q = await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: pos,
        text: `Question ${pos}`,
        timeLimitSeconds: 20,
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
            { position: 'C', text: 'C', isCorrect: false },
            { position: 'D', text: 'D', isCorrect: false },
          ],
        },
      },
      include: { answers: { orderBy: { position: 'asc' } } },
    });
    questions.push(q);
  }
  return { quiz, questions };
}

let tokenSeq = 0;
async function createPlayer(
  sessionId: bigint,
  pseudo: string,
  opts: {
    scoreTotal?: number;
    joinedQuestionPosition?: number | null;
    emailForPrize?: string;
  } = {},
) {
  tokenSeq += 1;
  return prisma.player.create({
    data: {
      sessionId,
      pseudo,
      resumeToken: `rt-${Date.now()}-${tokenSeq}-${Math.random().toString(36).slice(2, 10)}`,
      status: 'active',
      scoreTotal: opts.scoreTotal ?? 0,
      joinedQuestionPosition: opts.joinedQuestionPosition ?? null,
      ...(opts.emailForPrize ? { emailForPrize: opts.emailForPrize } : {}),
    },
  });
}

async function answer(
  playerId: bigint,
  question: { id: bigint; answers: { id: bigint; isCorrect: boolean }[] },
  correct: boolean,
  timeMs: number,
) {
  const chosen = question.answers.find((a) => a.isCorrect === correct) ?? question.answers[0]!;
  await prisma.playerAnswer.create({
    data: {
      playerId,
      questionId: question.id,
      chosenAnswerId: chosen.id,
      isCorrect: correct,
      timeToAnswerMs: timeMs,
      pointsAwarded: correct ? 1000 : 0,
      answeredAtServer: new Date(),
    },
  });
}

describe('session-report.service — buildSessionReport', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('calcule joueurs, complétion, par question, rétention et synthèse', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz, questions } = await seedQuiz(user.id);
    const [q1, q2, q3] = questions as [
      (typeof questions)[0],
      (typeof questions)[0],
      (typeof questions)[0],
    ];

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    // P1 lobby : répond aux 3 questions correctement
    const p1 = await createPlayer(session.id, 'P1', { scoreTotal: 3000 });
    await answer(p1.id, q1, true, 1000);
    await answer(p1.id, q2, true, 2000);
    await answer(p1.id, q3, true, 1500);

    // P2 lobby : Q1 correct, Q2 faux, abandonne avant Q3
    const p2 = await createPlayer(session.id, 'P2', { scoreTotal: 1500 });
    await answer(p2.id, q1, true, 3000);
    await answer(p2.id, q2, false, 4000);

    // P3 late-join à la Q2 : Q2 correct, Q3 faux
    const p3 = await createPlayer(session.id, 'P3', {
      scoreTotal: 800,
      joinedQuestionPosition: 2,
    });
    await answer(p3.id, q2, true, 2500);
    await answer(p3.id, q3, false, 3500);

    // P4 lobby : ne répond jamais (inactif)
    await createPlayer(session.id, 'P4', { scoreTotal: 0 });

    const report = await buildSessionReport(session.id);

    // Joueurs
    expect(report.players.total).toBe(4);
    expect(report.players.lobbyJoined).toBe(3);
    expect(report.players.lateJoined).toBe(1);
    expect(report.players.active).toBe(3);

    // Q1 : éligibles = 3 (P3 pas encore arrivé), répondants = 2, 100% corrects
    const rq1 = report.questions[0]!;
    expect(rq1.eligible).toBe(3);
    expect(rq1.respondents).toBe(2);
    expect(rq1.participationRate).toBeCloseTo(2 / 3, 5);
    expect(rq1.correctRate).toBe(1);
    const optA1 = rq1.options.find((o) => o.position === 'A')!;
    expect(optA1.count).toBe(2);
    expect(optA1.isCorrect).toBe(true);

    // Q2 : éligibles = 4, répondants = 3, 2/3 corrects
    const rq2 = report.questions[1]!;
    expect(rq2.eligible).toBe(4);
    expect(rq2.respondents).toBe(3);
    expect(rq2.correctRate).toBeCloseTo(2 / 3, 5);

    // Q3 : répondants = 2 (P1, P3), 1/2 corrects
    const rq3 = report.questions[2]!;
    expect(rq3.respondents).toBe(2);
    expect(rq3.correctRate).toBe(0.5);

    // Rétention
    expect(report.retention).toEqual([
      { position: 1, respondents: 2 },
      { position: 2, respondents: 3 },
      { position: 3, respondents: 2 },
    ]);

    // Complétion : dernière question jouée = Q3 → 2 répondants / 3 actifs
    expect(report.completionRate).toBeCloseTo(2 / 3, 5);

    // Synthèse
    expect(report.synthesis.easiestQuestion?.position).toBe(1);
    expect(report.synthesis.hardestQuestion?.position).toBe(3);
    expect(report.synthesis.avgResponseTimeMs).not.toBeNull();

    // Podium
    expect(report.podium.map((p) => p.pseudo)).toEqual(['P1', 'P2', 'P3']);
    expect(report.podium[0]!.score).toBe(3000);

    // Pas de lots
    expect(report.prizes.total).toBe(0);
    expect(report.prizes.emailOptInRate).toBeNull();
    expect(report.prizes.redemptionRate).toBeNull();
  });

  it('session sans réponse : complétion et taux null, actifs = 0', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz } = await seedQuiz(user.id);

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });
    await createPlayer(session.id, 'Solo');

    const report = await buildSessionReport(session.id);
    expect(report.players.active).toBe(0);
    expect(report.completionRate).toBeNull();
    expect(report.avgResponseTimeMs).toBeNull();
    expect(report.retention).toEqual([
      { position: 1, respondents: 0 },
      { position: 2, respondents: 0 },
      { position: 3, respondents: 0 },
    ]);
    expect(report.synthesis.easiestQuestion).toBeNull();
  });

  it('session aborted : rapport calculé avec mention de l’état', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz, questions } = await seedQuiz(user.id);
    const q1 = questions[0]!;

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'aborted',
        endedAt: new Date(),
      },
    });
    const p1 = await createPlayer(session.id, 'A1', { scoreTotal: 1000 });
    await answer(p1.id, q1, true, 1200);

    const report = await buildSessionReport(session.id);
    expect(report.session.state).toBe('aborted');
    expect(report.questions[0]!.respondents).toBe(1);
    expect(report.completionRate).toBe(1);
  });

  it('refuse une session non terminée', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz } = await seedQuiz(user.id);
    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'running',
        startedAt: new Date(),
      },
    });

    await expect(buildSessionReport(session.id)).rejects.toMatchObject({
      code: 'SESSION_NOT_TERMINATED',
    });
  });

  it('calcule opt-in email et taux de redemption avec lots', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz, questions } = await seedQuiz(user.id);
    const q1 = questions[0]!;

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const winner = await createPlayer(session.id, 'W', {
      scoreTotal: 5000,
      emailForPrize: 'w@test.local',
    });
    await answer(winner.id, q1, true, 900);
    const runnerUp = await createPlayer(session.id, 'R', { scoreTotal: 2000 });
    await answer(runnerUp.id, q1, false, 1500);

    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: winner.id,
        redeemCode: `rc-${Date.now()}-1`.slice(0, 16),
        signature: 'a'.repeat(64),
        shortCode: 'AAA-111',
        rank: 1,
        label: 'Podium',
        type: 'discount_qr',
        emailSentAt: new Date(),
        redeemedAt: new Date(),
      },
    });
    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: runnerUp.id,
        redeemCode: `rc-${Date.now()}-2`.slice(0, 16),
        signature: 'b'.repeat(64),
        shortCode: 'BBB-222',
        rank: 4,
        isConsolation: true,
        label: 'Consolation',
        type: 'discount_qr',
      },
    });

    const report = await buildSessionReport(session.id);
    expect(report.prizes.total).toBe(2);
    expect(report.prizes.consolationCount).toBe(1);
    expect(report.prizes.byType).toEqual([{ type: 'discount_qr', count: 2 }]);
    expect(report.prizes.emailProvidedCount).toBe(1);
    expect(report.prizes.emailOptInRate).toBe(0.5);
    // 1 émis (emailSentAt) et 1 redeemed → 100%
    expect(report.prizes.emailSentCount).toBe(1);
    expect(report.prizes.redeemedCount).toBe(1);
    expect(report.prizes.redemptionRate).toBe(1);
  });
});

describe('session-report.service — liste & CSV & scope', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('listReportableSessions renvoie les sessions terminées avec complétion', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const { quiz, questions } = await seedQuiz(user.id);
    const q1 = questions[0]!;

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });
    const p1 = await createPlayer(session.id, 'P1');
    await answer(p1.id, q1, true, 1000);
    await createPlayer(session.id, 'P2'); // inactif

    // Session en cours : ne doit pas apparaître
    await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'lobby',
      },
    });

    const rows = await listReportableSessions(null);
    const row = rows.find((r) => r.id === session.id.toString());
    expect(row).toBeDefined();
    expect(row!.players).toBe(2);
    expect(row!.completionRate).toBe(1); // 1 répondant Q1 / 1 actif
    expect(rows.every((r) => r.state === 'ended' || r.state === 'aborted')).toBe(true);
  });

  it('buildCinemaSessionsCsv produit un en-tête et une ligne par session', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const cinema = await prisma.screen.findUniqueOrThrow({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    const { quiz } = await seedQuiz(user.id);
    await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const csv = await buildCinemaSessionsCsv(cinema.cinemaId);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('date,salle,quiz,sponsor,joueurs,late_joins,completion_pct,lots_emis');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('Quiz Rapport');
  });

  it('resolveReportScope et assertCinemaAccess respectent le scope cinéma', () => {
    const superAdmin: AuthUser = {
      id: 1n,
      email: 'a@b.c',
      displayName: null,
      role: 'super_admin',
      cinemaId: null,
    };
    expect(resolveReportScope(superAdmin)).toBeNull();
    expect(() => assertCinemaAccess(superAdmin, 42n)).not.toThrow();

    const cinemaAdmin: AuthUser = {
      id: 2n,
      email: 'c@d.e',
      displayName: null,
      role: 'cinema_admin',
      cinemaId: 42n,
    };
    expect(resolveReportScope(cinemaAdmin)).toBe(42n);
    expect(() => assertCinemaAccess(cinemaAdmin, 42n)).not.toThrow();
    expect(() => assertCinemaAccess(cinemaAdmin, 99n)).toThrow(AppError);

    const projectionist: AuthUser = {
      id: 3n,
      email: 'p@q.r',
      displayName: null,
      role: 'projectionist',
      cinemaId: 42n,
    };
    expect(() => resolveReportScope(projectionist)).toThrow(AppError);
  });
});
