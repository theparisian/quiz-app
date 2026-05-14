import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { endOfTodayParisExclusive, startOfTodayParis } from '../../shared/time/paris-calendar.js';

/** `null` = pas de restriction (super_admin). Sinon filtre tenant. */
export type CinemaScope = bigint | null;

function cinemaScope(user: AuthUser): CinemaScope {
  if (user.role === 'super_admin') return null;
  if (user.role !== 'cinema_admin' || user.cinemaId === null) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  return user.cinemaId;
}

function screenScopedWhere(cinemaId: CinemaScope): Prisma.ScreenWhereInput | undefined {
  if (cinemaId === null) return undefined;
  return { cinemaId };
}

function nucScopedWhere(cinemaId: CinemaScope): Prisma.NucWhereInput {
  const sw = screenScopedWhere(cinemaId);
  if (sw === undefined) return {};
  return { screen: sw };
}

function sessionScopedWhere(cinemaId: CinemaScope): Prisma.SessionWhereInput {
  const sw = screenScopedWhere(cinemaId);
  if (sw === undefined) return {};
  return { screen: sw };
}

function eventLogScopedWhere(cinemaId: CinemaScope): Prisma.EventLogWhereInput {
  if (cinemaId === null) return {};
  return {
    OR: [{ cinemaId }, { session: { screen: { cinemaId } } }, { nuc: { screen: { cinemaId } } }],
  };
}

export const dashboardService = {
  /** Valide rôles et retourne le scope cinéma (ou null). */
  resolveScope(user: AuthUser): CinemaScope {
    return cinemaScope(user);
  },

  async getHealth(cinemaId: CinemaScope) {
    const nucWhere = nucScopedWhere(cinemaId);
    const sessionWhere = sessionScopedWhere(cinemaId);
    const dayStart = startOfTodayParis();
    const dayEnd = endOfTodayParisExclusive();

    const [
      nucOnline,
      nucOffline,
      nucError,
      nucTotal,
      sessLobby,
      sessRunning,
      sessPaused,
      abortedToday,
    ] = await Promise.all([
      prisma.nuc.count({ where: { ...nucWhere, status: 'online' } }),
      prisma.nuc.count({ where: { ...nucWhere, status: 'offline' } }),
      prisma.nuc.count({ where: { ...nucWhere, status: 'error' } }),
      prisma.nuc.count({ where: nucWhere }),
      prisma.session.count({ where: { ...sessionWhere, state: 'lobby' } }),
      prisma.session.count({ where: { ...sessionWhere, state: 'running' } }),
      prisma.session.count({ where: { ...sessionWhere, state: 'paused' } }),
      prisma.session.count({
        where: {
          ...sessionWhere,
          state: 'aborted',
          endedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
    ]);

    const offlineNucs = await prisma.nuc.findMany({
      where: { ...nucWhere, status: 'offline' },
      select: {
        id: true,
        lastHeartbeatAt: true,
        updatedAt: true,
        screen: {
          select: {
            name: true,
            cinema: { select: { name: true } },
          },
        },
      },
      orderBy: [{ lastHeartbeatAt: 'asc' }],
      take: 100,
    });

    return {
      nucs: {
        online: nucOnline,
        offline: nucOffline,
        error: nucError,
        total: nucTotal,
      },
      sessions: {
        running: sessRunning,
        paused: sessPaused,
        lobby: sessLobby,
      },
      abortedToday,
      offlineNucs: offlineNucs.map((n) => ({
        nucId: n.id.toString(),
        cinemaName: n.screen.cinema.name,
        screenName: n.screen.name,
        offlineSince: (n.lastHeartbeatAt ?? n.updatedAt).toISOString(),
      })),
    };
  },

  async getToday(cinemaId: CinemaScope) {
    const dayStart = startOfTodayParis();
    const dayEnd = endOfTodayParisExclusive();

    const sessionDayFilter = { createdAt: { gte: dayStart, lt: dayEnd } };

    const sessionsWhere: Prisma.SessionWhereInput =
      cinemaId === null ? sessionDayFilter : { screen: { cinemaId }, ...sessionDayFilter };

    const [sessionsCount, playersCount, prizesSentCount] = await Promise.all([
      prisma.session.count({ where: sessionsWhere }),
      prisma.player.count({
        where:
          cinemaId === null
            ? { joinedAt: { gte: dayStart, lt: dayEnd } }
            : {
                joinedAt: { gte: dayStart, lt: dayEnd },
                session: { screen: { cinemaId } },
              },
      }),
      prisma.prize.count({
        where:
          cinemaId === null
            ? { emailSentAt: { gte: dayStart, lt: dayEnd } }
            : {
                emailSentAt: { gte: dayStart, lt: dayEnd },
                session: { screen: { cinemaId } },
              },
      }),
    ]);

    return { sessionsCount, playersCount, prizesSentCount };
  },

  async getRecentErrors(cinemaId: CinemaScope) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const scope = eventLogScopedWhere(cinemaId);

    const rows = await prisma.eventLog.findMany({
      where: {
        level: { in: ['error', 'critical'] },
        createdAt: { gte: since },
        ...scope,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        level: true,
        eventType: true,
        payloadJson: true,
        createdAt: true,
        cinemaId: true,
        sessionId: true,
        nucId: true,
      },
    });

    return {
      errors: rows.map((r) => ({
        id: r.id.toString(),
        level: r.level,
        eventType: r.eventType,
        payload: r.payloadJson,
        createdAt: r.createdAt.toISOString(),
        cinemaId: r.cinemaId?.toString() ?? null,
        sessionId: r.sessionId?.toString() ?? null,
        nucId: r.nucId?.toString() ?? null,
      })),
    };
  },

  async getRecentSessions(cinemaId: CinemaScope) {
    const dayStart = startOfTodayParis();
    const dayEnd = endOfTodayParisExclusive();

    const rows = await prisma.session.findMany({
      where:
        cinemaId === null
          ? { createdAt: { gte: dayStart, lt: dayEnd } }
          : {
              screen: { cinemaId },
              createdAt: { gte: dayStart, lt: dayEnd },
            },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        state: true,
        totalPlayers: true,
        createdAt: true,
        winnerPlayerId: true,
        quiz: { select: { title: true } },
        screen: {
          select: {
            name: true,
            cinema: { select: { name: true } },
          },
        },
      },
    });

    const winnerIds = rows.map((r) => r.winnerPlayerId).filter((id): id is bigint => id !== null);
    const winners =
      winnerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: winnerIds } },
            select: { id: true, pseudo: true },
          })
        : [];
    const pseudoById = new Map(winners.map((w) => [w.id.toString(), w.pseudo]));

    return {
      sessions: rows.map((r) => ({
        id: r.id.toString(),
        cinemaName: r.screen.cinema.name,
        screenName: r.screen.name,
        quizTitle: r.quiz.title,
        totalPlayers: r.totalPlayers,
        state: r.state,
        createdAt: r.createdAt.toISOString(),
        winnerPseudo:
          r.winnerPlayerId !== null ? (pseudoById.get(r.winnerPlayerId.toString()) ?? null) : null,
      })),
    };
  },
};
