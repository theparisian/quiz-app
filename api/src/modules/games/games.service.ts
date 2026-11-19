import { Prisma, type Game, type PrismaClient, type QuizType } from '@prisma/client';
import {
  BURGER_ENGINE_KEY,
  POLL_ENGINE_KEY,
  burgerConfigSchema,
  burgerDurationEstimateSeconds,
  pollConfigSchema,
  pollDurationEstimateSeconds,
  type CreateGameBody,
  type ListGamesQuery,
  type UpdateGameBody,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import type { StorageProvider } from '../../shared/storage/storage-provider.js';
import { extractKeyFromPublicUrl } from '../../shared/storage/storage-url.js';
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
 * Chemins de l'admin sous `/games/` qui ne sont pas des slugs (`/games/new-poll`,
 * `/games/new-burger`) : refusés comme slug de jeu pour ne pas masquer une page.
 */
const RESERVED_GAME_SLUGS = new Set(['new-poll', 'new-burger']);

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
  const base = slugify(title) || 'jeu';
  let candidate = base;
  for (let suffix = 2; !(await isSlugFree(candidate)); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/** Contenu d'un jeu validé par le schéma de son moteur, avec sa durée estimée. */
interface ParsedGameConfig {
  config: unknown;
  durationEstimateSeconds: number;
}

/** Moteurs dont le contenu (`configJson`) est créé et modifié par /api/games. */
const CONFIG_PARSERS: Record<string, (json: unknown) => ParsedGameConfig> = {
  // 400 POLL_CONFIG_INVALID si le sondage est invalide.
  [POLL_ENGINE_KEY]: (json) => {
    const parsed = pollConfigSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new AppError(`Invalid poll configuration: ${message}`, 400, 'POLL_CONFIG_INVALID');
    }
    return {
      config: parsed.data,
      durationEstimateSeconds: pollDurationEstimateSeconds(parsed.data),
    };
  },
  // 400 BURGER_CONFIG_INVALID ; un contenu absent prend les réglages par défaut.
  [BURGER_ENGINE_KEY]: (json) => {
    const parsed = burgerConfigSchema.safeParse(json ?? {});
    if (!parsed.success) {
      const message = parsed.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new AppError(`Invalid burger configuration: ${message}`, 400, 'BURGER_CONFIG_INVALID');
    }
    return {
      config: parsed.data,
      durationEstimateSeconds: burgerDurationEstimateSeconds(parsed.data),
    };
  },
};

function parseGameConfig(engineKey: string, json: unknown): ParsedGameConfig {
  const parse = CONFIG_PARSERS[engineKey];
  if (!parse) throw new AppError(`Unsupported engine: ${engineKey}`, 400, 'GAME_NOT_SUPPORTED_YET');
  return parse(json);
}

/** Seuls les jeux hors quiz à contenu `configJson` (sondage, burger) passent par /api/games. */
function assertEditableEngine(engineKey: string): void {
  if (engineKey === QUIZ_ENGINE_KEY) {
    throw new AppError('Quiz games are managed by the quiz editor', 400, 'GAME_MANAGED_BY_QUIZ');
  }
  if (!CONFIG_PARSERS[engineKey]) {
    throw new AppError(`Unsupported engine: ${engineKey}`, 400, 'GAME_NOT_SUPPORTED_YET');
  }
}

async function getGameOrThrow(slug: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { slug } });
  if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
  return game;
}

/** POST /api/games : jeu hors quiz (sondage, burger) en brouillon. Slug donné : 409 SLUG_TAKEN s'il est pris. */
async function createGame(input: CreateGameBody): Promise<Game> {
  assertEditableEngine(input.engineKey);
  const { config, durationEstimateSeconds } = parseGameConfig(input.engineKey, input.configJson);
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
        durationEstimateSeconds,
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

/** Champs d'un jeu quiz pilotés par son quiz (`syncGameFromQuiz`) : refusés par PATCH. */
const QUIZ_MANAGED_FIELDS = [
  'title',
  'description',
  'configJson',
  'kind',
  'sponsorId',
  'durationEstimateSeconds',
] as const;

function assertNotQuizManaged(game: Game, input: UpdateGameBody): void {
  if (game.engineKey !== QUIZ_ENGINE_KEY) return;
  const managed = QUIZ_MANAGED_FIELDS.filter((field) => input[field] !== undefined);
  if (managed.length > 0) {
    throw new AppError(
      `Managed by the quiz editor: ${managed.join(', ')}`,
      400,
      'GAME_MANAGED_BY_QUIZ',
    );
  }
}

/** Cinémas existants (non supprimés) ; 404 CINEMA_NOT_FOUND si l'un manque. */
async function resolveCinemaIds(ids: string[]): Promise<bigint[]> {
  const unique = [...new Set(ids)].map((id) => BigInt(id));
  if (unique.length === 0) return [];
  const found = await prisma.cinema.count({ where: { id: { in: unique }, deletedAt: null } });
  if (found !== unique.length) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  return unique;
}

/**
 * PATCH /api/games/:slug (convention 6). B6 : titre, description, contenu ; le contenu d'un jeu
 * programmé ou en cours de jeu (manche `pending` ou `running`) ne change pas : 409 GAME_IN_USE.
 * C1 : champs du catalogue. Jeu quiz : seuls les champs propres au catalogue (accroche, règles,
 * audience, cinémas, tags, joueurs minimum) sont modifiables ici, le reste vient du quiz.
 * `kind = sponsored` exige un sponsor (400 SPONSOR_REQUIRED).
 */
async function updateGame(slug: string, input: UpdateGameBody): Promise<Game> {
  const game = await getGameOrThrow(slug);
  assertNotQuizManaged(game, input);
  const data: Prisma.GameUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.configJson !== undefined) {
    assertEditableEngine(game.engineKey);
    const { config, durationEstimateSeconds } = parseGameConfig(game.engineKey, input.configJson);
    const inUse = await prisma.sessionRound.count({
      where: { gameId: game.id, state: { in: ['pending', 'running'] } },
    });
    if (inUse > 0) {
      throw new AppError('Game is scheduled or being played', 409, 'GAME_IN_USE');
    }
    data.configJson = config as unknown as Prisma.InputJsonValue;
    data.durationEstimateSeconds = durationEstimateSeconds;
  } else if (input.durationEstimateSeconds !== undefined) {
    data.durationEstimateSeconds = input.durationEstimateSeconds;
  }
  if (input.tagline !== undefined) data.tagline = input.tagline || null;
  if (input.rulesText !== undefined) data.rulesText = input.rulesText || null;
  if (input.minPlayers !== undefined) data.minPlayers = input.minPlayers;
  if (input.audience !== undefined) data.audience = input.audience;
  if (input.tags !== undefined) {
    data.tags = input.tags === null ? Prisma.DbNull : [...new Set(input.tags)];
  }

  if (input.kind !== undefined || input.sponsorId !== undefined) {
    const kind = input.kind ?? game.kind;
    const sponsorId =
      input.sponsorId !== undefined
        ? input.sponsorId === null
          ? null
          : BigInt(input.sponsorId)
        : game.sponsorId;
    if (kind === 'sponsored' && sponsorId === null) {
      throw new AppError('A sponsored game needs a sponsor', 400, 'SPONSOR_REQUIRED');
    }
    if (input.sponsorId != null) {
      const sponsor = await prisma.sponsor.findUnique({ where: { id: sponsorId! } });
      if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    }
    data.kind = kind;
    data.sponsor = sponsorId === null ? { disconnect: true } : { connect: { id: sponsorId } };
  }

  const cinemaIds =
    input.cinemaIds !== undefined ? await resolveCinemaIds(input.cinemaIds) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.game.update({ where: { id: game.id }, data });
    if (cinemaIds !== undefined) {
      await tx.gameCinemaAccess.deleteMany({ where: { gameId: game.id } });
      if (cinemaIds.length > 0) {
        await tx.gameCinemaAccess.createMany({
          data: cinemaIds.map((cinemaId) => ({ gameId: game.id, cinemaId })),
        });
      }
    }
    return row;
  });
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
  parseGameConfig(game.engineKey, game.configJson);
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

/** Jeu tel que le renvoient GET /api/games et GET /api/games/:slug (sponsor, cinémas). */
export const GAME_ADMIN_INCLUDE = {
  sponsor: { select: { id: true, name: true, logoUrl: true } },
  cinemaAccess: {
    select: { cinema: { select: { id: true, slug: true, name: true } } },
    orderBy: { cinemaId: 'asc' },
  },
} satisfies Prisma.GameInclude;
export type GameWithAdminInclude = Prisma.GameGetPayload<{ include: typeof GAME_ADMIN_INCLUDE }>;

async function getGameAdminDetail(slug: string): Promise<GameWithAdminInclude> {
  const game = await prisma.game.findUnique({ where: { slug }, include: GAME_ADMIN_INCLUDE });
  if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
  return game;
}

async function listGames(
  query: ListGamesQuery,
): Promise<{ items: GameWithAdminInclude[]; total: number }> {
  const where: Prisma.GameWhereInput = {};
  if (query.engineKey) where.engineKey = query.engineKey;
  if (query.kind) where.kind = query.kind;
  if (query.status) where.status = query.status;
  if (query.catalogEnabled !== undefined) where.catalogEnabled = query.catalogEnabled;
  if (query.search) {
    where.OR = [{ title: { contains: query.search } }, { slug: { contains: query.search } }];
  }
  const [items, total] = await Promise.all([
    prisma.game.findMany({
      where,
      include: GAME_ADMIN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.game.count({ where }),
  ]);
  return { items, total };
}

// ─── Catalogue (C1) ──────────────────────────────────────

/**
 * Règle de disponibilité d'un jeu pour un cinéma, écrite UNE fois (C1) : publié, dans le
 * catalogue, et ouvert à tous les cinémas ou à ce cinéma (`game_cinema_access`).
 * À réutiliser partout (catalogue, création de séance, programmation…).
 */
function availableWhere(cinemaId: bigint): Prisma.GameWhereInput {
  return {
    status: 'published',
    catalogEnabled: true,
    OR: [{ audience: 'all_cinemas' }, { cinemaAccess: { some: { cinemaId } } }],
  };
}

async function isAvailableForCinema(gameId: bigint, cinemaId: bigint, db: Db = prisma) {
  const count = await db.game.count({ where: { AND: [{ id: gameId }, availableWhere(cinemaId)] } });
  return count > 0;
}

/** POST /api/games/:slug/enable et /disable : présence dans le catalogue. */
async function setCatalogEnabled(slug: string, enabled: boolean): Promise<Game> {
  const game = await getGameOrThrow(slug);
  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { catalogEnabled: enabled },
  });
  logger.info({ gameSlug: slug, catalogEnabled: enabled }, 'Game catalog visibility changed');
  logEvent({
    level: 'info',
    eventType: enabled ? 'game.catalog_enabled' : 'game.catalog_disabled',
    payload: { gameSlug: slug },
  });
  return updated;
}

function storagePublicBase(): string {
  return (process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3000/uploads').replace(/\/+$/, '');
}

/** Couverture d'un jeu hors quiz (celle d'un jeu quiz vient du quiz). */
async function getCoverEditableGame(slug: string): Promise<Game> {
  const game = await getGameOrThrow(slug);
  if (game.engineKey === QUIZ_ENGINE_KEY) {
    throw new AppError('Managed by the quiz editor: cover', 400, 'GAME_MANAGED_BY_QUIZ');
  }
  return game;
}

async function setCoverImage(slug: string, url: string): Promise<Game> {
  const game = await getCoverEditableGame(slug);
  return prisma.game.update({ where: { id: game.id }, data: { coverImageUrl: url } });
}

async function removeCoverImage(slug: string, storage: StorageProvider): Promise<Game> {
  const game = await getCoverEditableGame(slug);
  const key = extractKeyFromPublicUrl(game.coverImageUrl, storagePublicBase());
  if (key) await storage.delete(key);
  return prisma.game.update({ where: { id: game.id }, data: { coverImageUrl: null } });
}

export const gamesService = {
  syncGameFromQuiz,
  releaseGameOfDeletedQuiz,
  ensureGameForQuiz,
  createGame,
  updateGame,
  publishGame,
  getGameBySlug,
  getCoverEditableGame,
  getGameAdminDetail,
  listGames,
  availableWhere,
  isAvailableForCinema,
  setCatalogEnabled,
  setCoverImage,
  removeCoverImage,
};
