import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { shapeQuizBackgroundPayload } from '../quizzes/quiz-background.js';
import { resolveQuizAudioPayload } from '../quizzes/quiz-audio.js';
import { getSessionRuntime } from './session-runtime.service.js';
import { getLobbyTimerRemainingMs } from './lobby-timer.service.js';
import {
  resolvePrizeConfig,
  resolveEligiblePrizeForPlayer,
} from '../prizes/prize-config.service.js';
import { resolvePrizesPayload } from '../prizes/prize-display.service.js';

/**
 * Snapshots `session:state_snapshot` (règle 5 du protocole) : champs de plateforme, plus
 * `round` (même forme que `round:started`, ou null), `gameView` (`round.snapshot(audience,
 * playerId)`, ou null) et `gameSeq`. Aucune logique de moteur ici.
 */

type PlayerRow = {
  id: bigint;
  pseudo: string;
  scoreTotal: number;
  joinedAt: Date;
  avatar: { imageUrl: string } | null;
};

const PLAYER_SELECT = {
  id: true,
  pseudo: true,
  scoreTotal: true,
  joinedAt: true,
  avatar: { select: { imageUrl: true } },
} as const;

/** Joueurs actifs, classés (score décroissant, puis ordre d'arrivée). */
function activePlayersRanked(sessionId: bigint): Promise<PlayerRow[]> {
  return prisma.player.findMany({
    where: { sessionId, status: 'active' },
    orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
    select: PLAYER_SELECT,
  });
}

function boardEntry(p: PlayerRow) {
  return {
    playerId: p.id.toString(),
    pseudo: p.pseudo,
    avatarUrl: p.avatar?.imageUrl ?? null,
    scoreTotal: p.scoreTotal,
  };
}

function rankedBoard(players: PlayerRow[]) {
  return players.map((p, i) => ({ ...boardEntry(p), rank: i + 1 }));
}

function playerListEntry(p: PlayerRow) {
  return { ...boardEntry(p), joinedAt: p.joinedAt.toISOString() };
}

async function prizeAvailabilityByRank(sessionId: bigint): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const rank of [1, 2, 3] as const) {
    out[`rank${rank}`] = (await resolvePrizeConfig(sessionId, rank)) !== null;
  }
  return out;
}

async function loadSession(sessionId: bigint) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { quiz: true },
  });
  if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  return session;
}

function lobbyTimerField(sessionId: bigint, state: string) {
  if (state !== 'lobby') return {};
  const remaining = getLobbyTimerRemainingMs(sessionId);
  return remaining !== null ? { lobbyTimerRemainingMs: remaining } : {};
}

/** Snapshot joint à la réponse d'un join pendant la partie (retardataire). */
export async function buildPlayerJoinSnapshot(
  sessionId: bigint,
  playerId: bigint,
): Promise<Record<string, unknown>> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { state: true },
  });
  if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  return {
    sessionState: session.state,
    ...getSessionRuntime().roundSnapshot(sessionId, 'mobile', playerId),
  };
}

/** `player:resume` : snapshot d'un joueur (mobile). */
export async function buildMobilePlayerStateSnapshot(
  playerId: bigint,
  sessionId: bigint,
): Promise<Record<string, unknown>> {
  const session = await loadSession(sessionId);
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { avatar: { select: { imageUrl: true } } },
  });
  if (!player || player.sessionId !== sessionId) {
    throw new AppError('Session mismatch', 403, 'SESSION_MISMATCH');
  }

  const ranked = await activePlayersRanked(sessionId);
  const rankIdx = ranked.findIndex((p) => p.id === playerId);
  const inGame = session.state === 'running' || session.state === 'paused';

  const out: Record<string, unknown> = {
    player: {
      playerId: player.id.toString(),
      pseudo: player.pseudo,
      avatarUrl: player.avatar?.imageUrl ?? null,
      scoreTotal: player.scoreTotal,
      currentRank: inGame && rankIdx >= 0 ? rankIdx + 1 : null,
      // Plateforme : arrivé pendant la partie (libellé de l'écran final après un rechargement).
      joinedLate: player.joinedQuestionPosition != null,
    },
    session: {
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      state: session.state,
      totalPlayers: ranked.length,
      audioMuted: session.audioMuted,
    },
    ...getSessionRuntime().roundSnapshot(sessionId, 'mobile', playerId),
  };

  if (session.state === 'ended') {
    const rank = player.rankFinal ?? rankIdx + 1;
    out.finalResults = {
      rank,
      finalScoreboard: rankedBoard(ranked),
      eligibleForPrize: (await resolveEligiblePrizeForPlayer(sessionId, rank)) !== null,
    };
    out.prizeAvailabilityByRank = await prizeAvailabilityByRank(sessionId);
  }
  if (session.state === 'lobby' || session.state === 'ended') {
    const prizes = await resolvePrizesPayload(sessionId);
    if (prizes) out.prizes = prizes;
  }
  return out;
}

/** `nuc:resume` : snapshot de l'écran cinéma (avec ou sans séance). */
export async function buildNucStateSnapshot(params: {
  nucId: bigint;
  screenId: bigint;
  sessionId: bigint | null;
}): Promise<Record<string, unknown>> {
  const nuc = await prisma.nuc.findUnique({
    where: { id: params.nucId },
    include: { screen: { include: { cinema: true } } },
  });
  if (!nuc) throw new AppError('NUC not found', 404, 'NUC_NOT_FOUND');

  const cinema = nuc.screen.cinema;
  const nucBlock = {
    nucId: nuc.id.toString(),
    screenId: nuc.screenId.toString(),
    cinemaSlug: cinema.slug,
    cinemaName: cinema.name,
    cinemaLogoUrl: cinema.logoUrl,
    backgroundMusicUrl: cinema.backgroundMusicUrl,
  };
  if (!params.sessionId) return { nuc: nucBlock, session: null, audioMuted: false };

  const session = await loadSession(params.sessionId);
  if (session.screenId !== params.screenId) {
    throw new AppError('Session not on this screen', 403, 'SESSION_SCREEN_MISMATCH');
  }

  const ranked = await activePlayersRanked(session.id);
  const byArrival = [...ranked].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const out: Record<string, unknown> = {
    nuc: nucBlock,
    session: {
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      joinToken: session.joinToken,
      state: session.state,
      totalPlayers: ranked.length,
      audioMuted: session.audioMuted,
    },
    audioMuted: session.audioMuted,
    // Habillage et sons de la séance (plateforme : lobby, musique, fin).
    quiz: shapeQuizBackgroundPayload(session.quiz),
    audio: await resolveQuizAudioPayload(session.quiz),
    players: byArrival.map(playerListEntry),
    scoreboard: ranked.slice(0, session.state === 'ended' ? 3 : 5).map(boardEntry),
    ...lobbyTimerField(session.id, session.state),
    ...getSessionRuntime().roundSnapshot(session.id, 'screen'),
  };

  if (session.state === 'ended') out.finalScoreboard = rankedBoard(ranked);
  if (session.state === 'lobby' || session.state === 'ended') {
    const prizes = await resolvePrizesPayload(session.id);
    if (prizes) out.prizes = prizes;
  }
  return out;
}

/** `console:resume` : snapshot de la console du cinéma. */
export async function buildConsoleStateSnapshot(
  sessionId: bigint,
): Promise<Record<string, unknown>> {
  const session = await loadSession(sessionId);
  const ranked = await activePlayersRanked(sessionId);

  const out: Record<string, unknown> = {
    session: {
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      joinToken: session.joinToken,
      state: session.state,
      totalPlayers: ranked.length,
      audioMuted: session.audioMuted,
    },
    players: ranked.map(playerListEntry),
    scoreboard: ranked.slice(0, 5).map(boardEntry),
    ...lobbyTimerField(session.id, session.state),
    ...getSessionRuntime().roundSnapshot(sessionId, 'console'),
  };

  if (session.state === 'ended') out.finalScoreboard = rankedBoard(ranked);
  const prizes = await resolvePrizesPayload(sessionId);
  if (prizes) out.prizes = prizes;
  return out;
}
