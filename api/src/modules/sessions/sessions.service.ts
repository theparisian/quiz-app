import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { generateUniqueSessionCode } from './session-code.service.js';
import { assertTransition, isActive } from './session-state.service.js';
import type { CreateSessionInput, ListSessionsQuery } from './sessions.schemas.js';

export const sessionsService = {
  async create(input: CreateSessionInput, projectionistUserId: bigint) {
    const quiz = await prisma.quiz.findUnique({ where: { slug: input.quizSlug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status !== 'published') {
      throw new AppError('Quiz must be published', 400, 'QUIZ_NOT_PUBLISHED');
    }

    const screenId = BigInt(input.screenId);
    const screen = await prisma.screen.findUnique({
      where: { id: screenId },
      include: { cinema: true },
    });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');
    if (screen.status !== 'active') {
      throw new AppError('Screen is not active', 400, 'SCREEN_NOT_ACTIVE');
    }

    const activeSession = await prisma.session.findFirst({
      where: {
        screenId,
        state: { in: ['lobby', 'running', 'paused'] },
      },
    });
    if (activeSession) {
      throw new AppError('Screen already has an active session', 409, 'SCREEN_HAS_ACTIVE_SESSION');
    }

    const slugShort = await generateUniqueSessionCode();

    const session = await prisma.session.create({
      data: {
        slugShort,
        quizId: quiz.id,
        screenId,
        projectionistUserId: projectionistUserId,
        state: 'lobby',
        totalPlayers: 0,
      },
      include: {
        quiz: {
          include: {
            questions: {
              include: { answers: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        screen: { include: { cinema: true } },
      },
    });

    logger.info(
      {
        sessionId: session.id.toString(),
        slugShort,
        quizSlug: input.quizSlug,
        screenId: screenId.toString(),
      },
      'Session created',
    );

    logEvent({
      level: 'info',
      eventType: 'session.created',
      sessionId: session.id,
      cinemaId: session.screen.cinema.id,
      payload: {
        quizId: quiz.id.toString(),
        screenId: screenId.toString(),
        slugShort,
      },
    });

    return session;
  },

  async getById(id: bigint) {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        quiz: {
          include: {
            questions: {
              include: { answers: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        screen: { include: { cinema: true } },
        players: { orderBy: { joinedAt: 'asc' } },
      },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    return session;
  },

  async getBySlugShort(slug: string) {
    const session = await prisma.session.findFirst({
      where: { slugShort: slug },
      include: {
        quiz: {
          select: {
            title: true,
            type: true,
            brandingJson: true,
            coverImageUrl: true,
            sponsor: { select: { name: true, logoUrl: true } },
          },
        },
        screen: {
          include: {
            cinema: { select: { name: true, slug: true, logoUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    return session;
  },

  async listByScreen(screenId: bigint, query: ListSessionsQuery) {
    const where: Record<string, unknown> = { screenId };
    if (query.status) where.state = query.status;

    const [items, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          quiz: { select: { title: true, slug: true } },
          _count: { select: { players: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  },

  async listByCinema(cinemaSlug: string, query: ListSessionsQuery) {
    const cinema = await prisma.cinema.findUnique({ where: { slug: cinemaSlug } });
    if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    const where: Record<string, unknown> = {
      screen: { cinemaId: cinema.id },
    };
    if (query.status) where.state = query.status;

    const [items, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          quiz: { select: { title: true, slug: true } },
          screen: { select: { id: true, name: true } },
          _count: { select: { players: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  },

  async abort(id: bigint, reason?: string) {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

    assertTransition(session.state, 'aborted');

    const updated = await prisma.session.update({
      where: { id },
      data: {
        state: 'aborted',
        endedAt: new Date(),
      },
    });

    logger.info({ sessionId: id.toString(), reason: reason ?? null }, 'Session aborted');

    return updated;
  },

  async updateState(
    id: bigint,
    newState: 'running' | 'paused' | 'ended' | 'aborted',
    extra?: Record<string, unknown>,
  ) {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

    assertTransition(session.state, newState);

    const data: Record<string, unknown> = { state: newState, ...extra };
    return prisma.session.update({ where: { id }, data });
  },

  isActive,
};
