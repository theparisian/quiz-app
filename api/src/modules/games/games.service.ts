import { Prisma, type Game, type PrismaClient, type QuizType } from '@prisma/client';
import {
  POLL_ENGINE_KEY,
  pollConfigSchema,
  pollDurationEstimateSeconds,
  type CreateGameBody,
  type ListGamesQuery,
  type PollConfig,
  type UpdateGameBody,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { QUIZ_ENGINE_KEY } from './games.schemas.js';

type Db = PrismaClient | Prisma.TransactionClient;

function gameKindFromQuizType(type: QuizType): 'internal' | 'sponsored' {
  return type === 'sponsored' ? 'sponsored' : 'internal';
}

/**
 * Crée ou met à jour le jeu lié à un quiz (mêmes règles que la reprise de la migration 0020).
 * Le jeu reprend le slug du quiz ; refuse (409 SLUG_TAKEN) si ce slug est déjà pris par un
 * autre jeu, non lié à ce quiz.
 */
export async function syncGameFromQuiz(quizId: bigint, tx?: Prisma.TransactionClient) {
  const db: Db = tx ?? prisma;
  const quiz = await db.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');

  const sameSlug = await db.game.findUnique({ where: { slug: quiz.slug } });
  if (sameSlug && sameSlug.quizId !== quiz.id) {
    throw new AppError('Slug already used by another game', 409, 'SLUG_TAKEN');
  }

  const data = {
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    engineKey: QUIZ_ENGINE_KEY,
    kind: gameKindFromQuizType(quiz.type),
    sponsorId: quiz.sponsorId,
    status: quiz.status,
    coverImageUrl: quiz.coverImageUrl,
    durationEstimateSeconds: quiz.durationEstimateSeconds,
  };

  return db.game.upsert({
    where: { quizId: quiz.id },
    create: { ...data, quizId: quiz.id },
    update: data,
  });
}

/**
 * À appeler avant la suppression d'un quiz : supprime son jeu s'il n'a jamais été joué,
 * sinon l'archive et le détache du quiz (l'historique des manches reste lisible).
 */
export async function releaseGameOfDeletedQuiz(
  quizId: bigint,
  tx: Prisma.TransactionClient,
): Promise<'deleted' | 'archived' | 'none'> {
  const game = await tx.game.findUnique({
    where: { quizId },
    include: { _count: { select: { rounds: true } } },
  });
  if (!game) return 'none';
  if (game._count.rounds === 0) {
    await tx.game.delete({ where: { id: game.id } });
    return 'deleted';
  }
  await tx.game.update({ where: { id: game.id }, data: { status: 'archived', quizId: null } });
  logger.info({ gameSlug: game.slug }, 'Game archived after quiz deletion');
  return 'archived';
}

/** Jeu à utiliser pour une séance créée par quizSlug ; le crée s'il manque. */
export async function ensureGameForQuiz(
  quizId: bigint,
  tx: Prisma.TransactionClient,
): Promise<Game> {
  const existing = await tx.game.findUnique({ where: { quizId } });
  if (existing) return existing;
  return syncGameFromQuiz(quizId, tx);
}

// ─── Jeux hors quiz (B6 : sondage), super_admin ─────────

/**
 * Chemins de l'admin sous `/games/` qui ne sont pas des slugs (`/games/new-poll`) : refusés
 * comme slug de jeu pour ne pas masquer une page.
 */
const RESERVED_GAME_SLUGS = new Set(['new-poll']);

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90)
    .replace(/-$/, '');
}

/** Slug libre dans les deux tables : un jeu quiz reprend le slug de son quiz (convention 5). */
async function isSlugFree(slug: string): Promise<boolean> {
  if (RESERVED_GAME_SLUGS.has(slug)) return false;
  const [quiz, game] = await Promise.all([
    prisma.quiz.findUnique({ where: { slug }, select: { id: true } }),
    prisma.game.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return !quiz && !game;
}

async function allocateGameSlug(title: string): Promise<string> {
  const base = slugify(title) || 'sondage';
  let candidate = base;
  for (let suffix = 2; !(await isSlugFree(candidate)); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/** Contenu d'un sondage validé par le schéma du moteur (400 POLL_CONFIG_INVALID sinon). */
function parsePollConfig(json: unknown): PollConfig {
  const parsed = pollConfigSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new AppError(`Invalid poll configuration: ${message}`, 400, 'POLL_CONFIG_INVALID');
  }
  return parsed.data;
}

/** Seuls les jeux de moteur `poll` sont créés et modifiés par /api/games (B6). */
function assertEditableEngine(engineKey: string): void {
  if (engineKey === QUIZ_ENGINE_KEY) {
    throw new AppError('Quiz games are managed by the quiz editor', 400, 'GAME_MANAGED_BY_QUIZ');
  }
  if (engineKey !== POLL_ENGINE_KEY) {
    throw new AppError(`Unsupported engine: ${engineKey}`, 400, 'GAME_NOT_SUPPORTED_YET');
  }
}

async function getGameOrThrow(slug: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { slug } });
  if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
  return game;
}

/** POST /api/games : sondage en brouillon. Slug donné : 409 SLUG_TAKEN s'il est pris. */
async function createGame(input: CreateGameBody): Promise<Game> {
  assertEditableEngine(input.engineKey);
  const config = parsePollConfig(input.configJson);
  let slug: string;
  if (input.slug !== undefined) {
    if (!(await isSlugFree(input.slug))) {
      throw new AppError('Slug already used by a quiz or a game', 409, 'SLUG_TAKEN');
    }
    slug = input.slug;
  } else {
    slug = await allocateGameSlug(input.title);
  }
  try {
    const game = await prisma.game.create({
      data: {
        slug,
        title: input.title,
        description: input.description ?? null,
        engineKey: input.engineKey,
        configJson: config as unknown as Prisma.InputJsonValue,
        kind: 'internal',
        status: 'draft',
        durationEstimateSeconds: pollDurationEstimateSeconds(config),
      },
    });
    logger.info({ gameSlug: slug, engineKey: input.engineKey }, 'Game created');
    return game;
  } catch (err) {
    // Création concurrente du même slug.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Slug already used by a quiz or a game', 409, 'SLUG_TAKEN');
    }
    throw err;
  }
}

/**
 * PATCH /api/games/:slug (convention 6, étendue en C1). Le contenu d'un jeu programmé ou en
 * cours de jeu (manche `pending` ou `running`) ne change pas : 409 GAME_IN_USE.
 */
async function updateGame(slug: string, input: UpdateGameBody): Promise<Game> {
  const game = await getGameOrThrow(slug);
  assertEditableEngine(game.engineKey);
  const data: Prisma.GameUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.configJson !== undefined) {
    const config = parsePollConfig(input.configJson);
    const inUse = await prisma.sessionRound.count({
      where: { gameId: game.id, state: { in: ['pending', 'running'] } },
    });
    if (inUse > 0) {
      throw new AppError('Game is scheduled or being played', 409, 'GAME_IN_USE');
    }
    data.configJson = config as unknown as Prisma.InputJsonValue;
    data.durationEstimateSeconds = pollDurationEstimateSeconds(config);
  }
  const updated = await prisma.game.update({ where: { id: game.id }, data });
  logger.info({ gameSlug: slug }, 'Game updated');
  return updated;
}

/** POST /api/games/:slug/publish : brouillon → publié (contenu revalidé). */
async function publishGame(slug: string): Promise<Game> {
  const game = await getGameOrThrow(slug);
  assertEditableEngine(game.engineKey);
  if (game.status !== 'draft') {
    throw new AppError('Invalid status transition', 403, 'GAME_INVALID_TRANSITION');
  }
  parsePollConfig(game.configJson);
  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { status: 'published' },
  });
  logger.info({ gameSlug: slug }, 'Game published');
  logEvent({
    level: 'info',
    eventType: 'game.published',
    payload: { gameSlug: slug, engineKey: game.engineKey },
  });
  return updated;
}

async function getGameBySlug(slug: string): Promise<Game> {
  return getGameOrThrow(slug);
}

async function listGames(query: ListGamesQuery): Promise<{ items: Game[]; total: number }> {
  const where: Prisma.GameWhereInput = query.engineKey ? { engineKey: query.engineKey } : {};
  const [items, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.game.count({ where }),
  ]);
  return { items, total };
}

export const gamesService = {
  syncGameFromQuiz,
  releaseGameOfDeletedQuiz,
  ensureGameForQuiz,
  createGame,
  updateGame,
  publishGame,
  getGameBySlug,
  listGames,
};
