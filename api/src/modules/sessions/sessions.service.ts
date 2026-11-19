import { nanoid } from 'nanoid';
import type { Game, Prisma, Quiz } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { drawSuperPrizeForSession } from '../prizes/prize-catalog.service.js';
import { QUIZ_ENGINE_KEY } from '../games/games.schemas.js';
import { ensureGameForQuiz, gamesService } from '../games/games.service.js';
import { hasEngine } from '../games/engine-registry.js';
import { FIRST_ROUND_SELECT, resolveLobbyQuiz } from './session-content.service.js';
import {
  ensureActiveSessionCodeIsUnique,
  findSessionIdByCode,
  generateUniqueSessionCode,
} from './session-code.service.js';
import { startLobbyTimer } from './lobby-timer.service.js';
import { assertTransition, isActive } from './session-state.service.js';
import type { CreateSessionInput, ListSessionsQuery } from './sessions.schemas.js';

/**
 * Résout le contenu d'une séance : par quizSlug (historique, une manche) ou par gameSlugs
 * (1 à 5 jeux, une manche chacun, dans l'ordre donné). `quizId` est le quiz de la première
 * manche de moteur quiz, null s'il n'y en a pas.
 */
async function resolveSessionContent(
  input: CreateSessionInput,
): Promise<{ games: Game[] | null; quiz: Quiz | null }> {
  if (input.gameSlugs !== undefined) {
    if (new Set(input.gameSlugs).size !== input.gameSlugs.length) {
      throw new AppError('The same game cannot be played twice', 400, 'DUPLICATE_GAME');
    }
    const games: Game[] = [];
    let firstQuiz: Quiz | null = null;
    for (const slug of input.gameSlugs) {
      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
      if (!hasEngine(game.engineKey)) {
        throw new AppError('Game engine not supported', 400, 'GAME_NOT_SUPPORTED_YET');
      }
      if (game.status !== 'published') {
        throw new AppError('Game must be published', 400, 'GAME_NOT_PUBLISHED');
      }
      if (game.engineKey === QUIZ_ENGINE_KEY) {
        if (game.quizId === null) {
          throw new AppError('Quiz game has no quiz', 400, 'GAME_NOT_SUPPORTED_YET');
        }
        const quiz = await prisma.quiz.findUnique({ where: { id: game.quizId } });
        if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
        if (quiz.status !== 'published') {
          throw new AppError('Quiz must be published', 400, 'QUIZ_NOT_PUBLISHED');
        }
        firstQuiz ??= quiz;
      }
      games.push(game);
    }
    return { games, quiz: firstQuiz };
  }

  const quiz = await prisma.quiz.findUnique({ where: { slug: input.quizSlug! } });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  if (quiz.status !== 'published') {
    throw new AppError('Quiz must be published', 400, 'QUIZ_NOT_PUBLISHED');
  }
  return { games: null, quiz };
}

/**
 * C1 : chaque jeu de la séance doit être disponible pour le cinéma de la salle (règle unique
 * `gamesService.isAvailableForCinema`), sauf pour super_admin. Séance par quizSlug : le jeu du
 * quiz (absent = non disponible).
 */
async function assertGamesAvailable(
  content: { games: Game[] | null; quiz: Quiz | null },
  cinemaId: bigint,
): Promise<void> {
  let gameIds: bigint[];
  if (content.games) {
    gameIds = content.games.map((g) => g.id);
  } else {
    const game = await prisma.game.findUnique({
      where: { quizId: content.quiz!.id },
      select: { id: true },
    });
    if (!game) throw new AppError('Game not available for this cinema', 403, 'GAME_NOT_AVAILABLE');
    gameIds = [game.id];
  }
  for (const gameId of gameIds) {
    if (!(await gamesService.isAvailableForCinema(gameId, cinemaId))) {
      throw new AppError('Game not available for this cinema', 403, 'GAME_NOT_AVAILABLE');
    }
  }
}

const QUESTIONS_WITH_ANSWERS = {
  questions: {
    include: { answers: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.QuizInclude;

/**
 * Détail d'une séance : manches (dans l'ordre) avec leur jeu et, pour un jeu quiz, ses questions
 * et bonnes réponses (contenu console, réservé aux routes authentifiées).
 */
export const SESSION_DETAIL_INCLUDE = {
  quiz: { include: QUESTIONS_WITH_ANSWERS },
  screen: { include: { cinema: true } },
  rounds: {
    orderBy: { position: 'asc' },
    include: { game: { include: { quiz: { include: QUESTIONS_WITH_ANSWERS } } } },
  },
} satisfies Prisma.SessionInclude;

/** Champs exposés par les routes publiques by-code / by-token. */
const PUBLIC_QUIZ_SELECT = {
  title: true,
  type: true,
  brandingJson: true,
  coverImageUrl: true,
  sponsor: { select: { name: true, logoUrl: true } },
} satisfies Prisma.QuizSelect;

/** Habillage du lobby : quiz du jeu de la première manche (sinon quiz de la séance, B5). */
const PUBLIC_SESSION_INCLUDE = {
  quiz: { select: PUBLIC_QUIZ_SELECT },
  rounds: {
    where: { position: 1 },
    take: 1,
    select: {
      game: {
        select: {
          title: true,
          kind: true,
          coverImageUrl: true,
          sponsor: { select: { name: true, logoUrl: true } },
          quiz: { select: PUBLIC_QUIZ_SELECT },
        },
      },
    },
  },
  screen: {
    include: {
      cinema: { select: { name: true, slug: true, logoUrl: true } },
    },
  },
} satisfies Prisma.SessionInclude;

export const sessionsService = {
  async create(input: CreateSessionInput, projectionistUserId: bigint, actorRole: string) {
    const { quiz, games } = await resolveSessionContent(input);

    const screenId = BigInt(input.screenId);
    const screen = await prisma.screen.findUnique({
      where: { id: screenId },
      include: { cinema: true },
    });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');
    if (screen.status !== 'active') {
      throw new AppError('Screen is not active', 400, 'SCREEN_NOT_ACTIVE');
    }
    if (actorRole !== 'super_admin') {
      await assertGamesAvailable({ games, quiz }, screen.cinemaId);
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

    const drawnCode = await generateUniqueSessionCode();
    // Jeton long encodé dans le QR code (le code à 4 chiffres reste le secours).
    const joinToken = nanoid(20);

    const { session: created, gameIds } = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          slugShort: drawnCode,
          joinToken,
          quizId: quiz?.id ?? null,
          screenId,
          projectionistUserId: projectionistUserId,
          state: 'lobby',
          totalPlayers: 0,
        },
      });
      // Une manche par jeu, en attente, positions 1..n.
      const roundGames = games ?? [await ensureGameForQuiz(quiz!.id, tx)];
      await tx.sessionRound.createMany({
        data: roundGames.map((g, i) => ({ sessionId: created.id, position: i + 1, gameId: g.id })),
      });
      const full = await tx.session.findUniqueOrThrow({
        where: { id: created.id },
        include: SESSION_DETAIL_INCLUDE,
      });
      return { session: full, gameIds: roundGames.map((g) => g.id) };
    });

    // Deux créations simultanées peuvent avoir tiré le même code : la plus récente en change.
    const slugShort = await ensureActiveSessionCodeIsUnique(created.id, drawnCode);
    const session =
      slugShort === drawnCode
        ? created
        : await prisma.session.findUniqueOrThrow({
            where: { id: created.id },
            include: SESSION_DETAIL_INCLUDE,
          });

    logger.info(
      {
        sessionId: session.id.toString(),
        slugShort,
        quizSlug: quiz?.slug ?? null,
        gameIds: gameIds.map((id) => id.toString()),
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
        quizId: quiz?.id.toString() ?? null,
        gameIds: gameIds.map((id) => id.toString()),
        screenId: screenId.toString(),
        slugShort,
      },
    });

    await drawSuperPrizeForSession(session.id, session.screen.cinema.id);

    // Timer de lobby : configuration du jeu de la première manche.
    const lobbyQuiz = await resolveLobbyQuiz(session.id);
    startLobbyTimer({
      sessionId: session.id,
      brandingJson: lobbyQuiz?.brandingJson ?? null,
      createdAt: session.createdAt,
      currentPlayers: 0,
    });

    return session;
  },

  async getById(id: bigint) {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        ...SESSION_DETAIL_INCLUDE,
        players: {
          orderBy: { joinedAt: 'asc' },
          include: { avatar: { select: { imageUrl: true } } },
        },
      },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    return session;
  },

  /** Séance active portant ce code, sinon la plus récente (écran final d'une séance terminée). */
  async getBySlugShort(slug: string) {
    const id = await findSessionIdByCode(slug);
    const session =
      id == null
        ? null
        : await prisma.session.findUnique({ where: { id }, include: PUBLIC_SESSION_INCLUDE });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    return session;
  },

  async getByJoinToken(joinToken: string) {
    const session = await prisma.session.findUnique({
      where: { joinToken },
      include: PUBLIC_SESSION_INCLUDE,
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
          rounds: FIRST_ROUND_SELECT,
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

    const [updated] = await prisma.$transaction([
      prisma.session.update({
        where: { id },
        data: {
          state: 'aborted',
          endedAt: new Date(),
        },
      }),
      prisma.sessionRound.updateMany({
        where: { sessionId: id, state: { in: ['pending', 'running'] } },
        data: { state: 'skipped' },
      }),
    ]);

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
