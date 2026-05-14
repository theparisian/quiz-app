import { nanoid } from 'nanoid';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { containsBadWord } from '../../shared/moderation/bad-words.js';

function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export const playersService = {
  async join(input: { sessionSlugShort: string; pseudo: string; userId?: bigint }) {
    const session = await prisma.session.findFirst({
      where: { slugShort: input.sessionSlugShort },
      orderBy: { createdAt: 'desc' },
      include: { screen: { select: { cinemaId: true } } },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    if (session.state !== 'lobby') {
      throw new AppError('Session is not in lobby', 409, 'SESSION_NOT_IN_LOBBY');
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

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        userId: input.userId ?? null,
        pseudo,
        resumeToken,
        status: 'active',
        scoreTotal: 0,
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { totalPlayers: { increment: 1 } },
    });

    logger.info(
      { playerId: player.id.toString(), sessionId: session.id.toString(), pseudo },
      'Player joined session',
    );

    logEvent({
      level: 'info',
      eventType: 'player.joined',
      sessionId: session.id,
      cinemaId: session.screen.cinemaId,
      payload: { playerId: player.id.toString(), pseudo: player.pseudo },
    });

    return {
      playerId: player.id,
      resumeToken,
      pseudo: player.pseudo,
      sessionId: session.id,
      sessionState: session.state,
      scoreTotal: 0,
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
