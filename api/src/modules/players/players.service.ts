import { nanoid } from 'nanoid';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { containsBadWord } from '../../shared/moderation/bad-words.js';
import { getSessionRuntime } from '../sessions/session-runtime.service.js';
import { notifyLobbyPlayerJoined } from '../sessions/lobby-timer.service.js';
import { buildPlayerJoinSnapshot } from '../sessions/session-resume.service.js';
import { resolveLobbyQuiz } from '../sessions/session-content.service.js';
import type { JoinSessionInput } from './players.schemas.js';

function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Assigne un avatar au joueur si les avatars sont activés sur le quiz.
 * Choix optionnel : si l'avatar demandé est invalide/absent, on tire un avatar
 * aléatoire de la bibliothèque (les doublons sont autorisés).
 */
async function resolveAvatarForJoin(
  avatarsEnabled: boolean,
  avatarLibraryId: bigint | null,
  requestedAvatarId: string | undefined,
): Promise<{ avatarId: bigint | null; avatarUrl: string | null }> {
  if (!avatarsEnabled || avatarLibraryId == null) {
    return { avatarId: null, avatarUrl: null };
  }

  if (requestedAvatarId) {
    try {
      const reqId = BigInt(requestedAvatarId);
      const requested = await prisma.avatar.findFirst({
        where: { id: reqId, libraryId: avatarLibraryId },
        select: { id: true, imageUrl: true },
      });
      if (requested) return { avatarId: requested.id, avatarUrl: requested.imageUrl };
    } catch {
      // id invalide → fallback aléatoire
    }
  }

  const all = await prisma.avatar.findMany({
    where: { libraryId: avatarLibraryId },
    select: { id: true, imageUrl: true },
  });
  if (all.length === 0) return { avatarId: null, avatarUrl: null };
  const picked = all[Math.floor(Math.random() * all.length)]!;
  return { avatarId: picked.id, avatarUrl: picked.imageUrl };
}

function resolveJoinedQuestionPositionAtJoin(
  session: { currentQuestionPosition: number | null },
  sessionId: bigint,
): number {
  const dbPos = session.currentQuestionPosition ?? 0;
  if (dbPos > 0) return dbPos;
  return getSessionRuntime().getProgress(sessionId) ?? 0;
}

/**
 * Plafond de joueurs (non kickés) d'une session : max(50, ceil(capacité × 1,5)),
 * ou 400 si la capacité de la salle n'est pas renseignée.
 */
export function maxPlayersForCapacity(capacity: number | null): number {
  if (capacity == null || capacity <= 0) return 400;
  return Math.max(50, Math.ceil(capacity * 1.5));
}

const JOIN_SESSION_INCLUDE = {
  screen: { select: { cinemaId: true, capacity: true } },
} as const;

export const playersService = {
  async join(input: JoinSessionInput & { userId?: bigint }) {
    // Par jeton du QR (prioritaire) ou par code court à 4 chiffres.
    const session = input.joinToken
      ? await prisma.session.findUnique({
          where: { joinToken: input.joinToken },
          include: JOIN_SESSION_INCLUDE,
        })
      : input.sessionSlugShort
        ? await prisma.session.findFirst({
            where: { slugShort: input.sessionSlugShort },
            orderBy: { createdAt: 'desc' },
            include: JOIN_SESSION_INCLUDE,
          })
        : null;
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

    if (session.state === 'ended' || session.state === 'aborted') {
      throw new AppError('Session is finished', 409, 'SESSION_FINISHED');
    }

    const pseudo = normalizePseudo(input.pseudo);

    if (containsBadWord(pseudo)) {
      logEvent({
        level: 'warn',
        eventType: 'player.bad_word_attempted',
        sessionId: session.id,
        cinemaId: session.screen.cinemaId,
        payload: { pseudoAttempted: pseudo },
      });
      throw new AppError('Pseudo contains inappropriate words', 400, 'PSEUDO_BAD_WORD');
    }

    const existingPlayers = await prisma.player.findMany({
      where: {
        sessionId: session.id,
        status: { not: 'kicked' },
      },
      select: { pseudo: true },
    });
    if (existingPlayers.length >= maxPlayersForCapacity(session.screen.capacity)) {
      throw new AppError('Session is full', 409, 'SESSION_FULL');
    }
    const duplicate = existingPlayers.some((p) => p.pseudo.toLowerCase() === pseudo.toLowerCase());
    if (duplicate)
      throw new AppError('Pseudo already taken in this session', 409, 'PSEUDO_DUPLICATE');

    const resumeToken = nanoid(32);
    const isLateJoin = session.state === 'running' || session.state === 'paused';
    const joinedQuestionPosition = isLateJoin
      ? resolveJoinedQuestionPositionAtJoin(session, session.id)
      : null;

    // Avatars : configuration du jeu de la première manche (lobby, B5).
    const lobbyQuiz = await resolveLobbyQuiz(session.id);
    const { avatarId, avatarUrl } = await resolveAvatarForJoin(
      lobbyQuiz?.avatarsEnabled ?? false,
      lobbyQuiz?.avatarLibraryId ?? null,
      input.avatarId,
    );

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        userId: input.userId ?? null,
        pseudo,
        avatarId,
        resumeToken,
        status: 'active',
        scoreTotal: 0,
        joinedQuestionPosition,
        pseudoSource: input.pseudoSource ?? 'CUSTOM',
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { totalPlayers: { increment: 1 } },
    });

    if (isLateJoin) {
      getSessionRuntime().addPlayer(
        session.id,
        player.id,
        { pseudo: player.pseudo, avatarUrl },
        { rejoin: false },
      );
      logEvent({
        level: 'info',
        eventType: 'player_late_joined',
        sessionId: session.id,
        cinemaId: session.screen.cinemaId,
        payload: {
          playerId: player.id.toString(),
          joinedQuestionPosition,
        },
      });
    } else {
      const activePlayers = await prisma.player.count({
        where: { sessionId: session.id, status: 'active' },
      });
      notifyLobbyPlayerJoined(session.id, activePlayers);
    }

    logger.info(
      { playerId: player.id.toString(), sessionId: session.id.toString(), pseudo, isLateJoin },
      'Player joined session',
    );

    logEvent({
      level: 'info',
      eventType: 'player.joined',
      sessionId: session.id,
      cinemaId: session.screen.cinemaId,
      payload: { playerId: player.id.toString(), pseudo: player.pseudo },
    });

    const stateSnapshot = isLateJoin ? await buildPlayerJoinSnapshot(session.id, player.id) : null;

    return {
      playerId: player.id,
      resumeToken,
      pseudo: player.pseudo,
      avatarId,
      avatarUrl,
      sessionId: session.id,
      sessionState: session.state,
      scoreTotal: 0,
      joinedQuestionPosition,
      stateSnapshot,
    };
  },

  async leave(playerId: bigint) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { session: { include: { screen: { select: { cinemaId: true } } } } },
    });
    if (!player) throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');

    await prisma.player.update({
      where: { id: playerId },
      data: { status: 'disconnected' },
    });
    // Un joueur parti ne peut plus agir pendant la manche (il y revient par player:resume).
    getSessionRuntime().removePlayer(player.sessionId, playerId);

    logger.info({ playerId: playerId.toString() }, 'Player left');

    logEvent({
      level: 'info',
      eventType: 'player.left',
      sessionId: player.sessionId,
      cinemaId: player.session.screen.cinemaId,
      payload: { playerId: playerId.toString() },
    });

    return player;
  },

  async kick(playerId: bigint) {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');

    await prisma.player.update({
      where: { id: playerId },
      data: { status: 'kicked' },
    });
    getSessionRuntime().removePlayer(player.sessionId, playerId);

    logger.info({ playerId: playerId.toString() }, 'Player kicked');
    return player;
  },

  async listBySession(sessionId: bigint) {
    return prisma.player.findMany({
      where: { sessionId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        pseudo: true,
        status: true,
        scoreTotal: true,
        rankFinal: true,
        joinedAt: true,
        avatar: { select: { imageUrl: true } },
      },
    });
  },

  async getByResumeToken(resumeToken: string) {
    const player = await prisma.player.findUnique({ where: { resumeToken } });
    if (!player) throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');
    return player;
  },
};
