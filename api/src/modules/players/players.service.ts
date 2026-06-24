import { nanoid } from 'nanoid';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { containsBadWord } from '../../shared/moderation/bad-words.js';
import { getOrchestrator } from '../sessions/session-orchestrator.service.js';
import { notifyLobbyPlayerJoined } from '../sessions/lobby-timer.service.js';
import { buildPlayerJoinSnapshot } from '../sessions/session-resume.service.js';
import type { JoinSessionInput } from './players.schemas.js';

function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function resolveJoinedQuestionPositionAtJoin(
  session: { currentQuestionPosition: number | null },
  sessionId: bigint,
): number {
  const dbPos = session.currentQuestionPosition ?? 0;
  if (dbPos > 0) return dbPos;

  const mem = getOrchestrator().getRunningState(sessionId);
  if (mem && mem.currentQuestionIndex >= 0 && mem.currentQuestionIndex < mem.questions.length) {
    return mem.questions[mem.currentQuestionIndex]!.position;
  }
  return 0;
}

export const playersService = {
  async join(input: JoinSessionInput & { userId?: bigint }) {
    const session = await prisma.session.findFirst({
      where: { slugShort: input.sessionSlugShort },
      orderBy: { createdAt: 'desc' },
      include: { screen: { select: { cinemaId: true } } },
    });
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
    const duplicate = existingPlayers.some((p) => p.pseudo.toLowerCase() === pseudo.toLowerCase());
    if (duplicate)
      throw new AppError('Pseudo already taken in this session', 409, 'PSEUDO_DUPLICATE');

    const resumeToken = nanoid(32);
    const isLateJoin = session.state === 'running' || session.state === 'paused';
    const joinedQuestionPosition = isLateJoin
      ? resolveJoinedQuestionPositionAtJoin(session, session.id)
      : null;

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        userId: input.userId ?? null,
        pseudo,
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
      getOrchestrator().addPlayerToSession(session.id, player.id);
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
      },
    });
  },

  async getByResumeToken(resumeToken: string) {
    const player = await prisma.player.findUnique({ where: { resumeToken } });
    if (!player) throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');
    return player;
  },
};
