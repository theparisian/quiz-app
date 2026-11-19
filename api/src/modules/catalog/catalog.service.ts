import type { Prisma } from '@prisma/client';
import {
  POLL_ENGINE_KEY,
  pollConfigSchema,
  type CatalogContentSummary,
  type CatalogGame,
  type CatalogGameDetail,
  type CatalogQuery,
  type CatalogRevenue,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertCanAccessCinema, type TenantScopeUser } from '../../shared/auth/tenant-scope.js';
import { QUIZ_ENGINE_KEY } from '../games/games.schemas.js';
import { gamesService } from '../games/games.service.js';
import { campaignsService } from '../campaigns/campaigns.service.js';

/**
 * Catalogue vu par un cinéma (C1) : jeux disponibles selon `gamesService.availableWhere`.
 * Jamais de `configJson` brut ni de bonne réponse.
 */

const SAMPLE_QUESTIONS = 3;

const CATALOG_INCLUDE = {
  sponsor: { select: { name: true, logoUrl: true } },
} satisfies Prisma.GameInclude;

const CATALOG_DETAIL_INCLUDE = {
  ...CATALOG_INCLUDE,
  quiz: {
    select: {
      _count: { select: { questions: true } },
      questions: {
        select: { text: true },
        orderBy: { position: 'asc' },
        take: SAMPLE_QUESTIONS,
      },
    },
  },
} satisfies Prisma.GameInclude;

type CatalogRow = Prisma.GameGetPayload<{ include: typeof CATALOG_INCLUDE }>;
type CatalogDetailRow = Prisma.GameGetPayload<{ include: typeof CATALOG_DETAIL_INCLUDE }>;

/** Cinéma visé par `cinemaSlug`, après contrôle d'accès (tenant-scope). */
async function resolveCinema(user: TenantScopeUser, cinemaSlug: string): Promise<bigint> {
  const cinema = await prisma.cinema.findUnique({
    where: { slug: cinemaSlug },
    select: { id: true, deletedAt: true },
  });
  if (!cinema || cinema.deletedAt) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }
  await assertCanAccessCinema(user, cinema.id);
  return cinema.id;
}

function readTags(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((t): t is string => typeof t === 'string') : [];
}

/**
 * `revenue` : part du cinéma pour un jeu sous campagne active aujourd'hui (C3), sinon null.
 */
function shapeCatalogGame(game: CatalogRow, revenue: CatalogRevenue | null): CatalogGame {
  return {
    slug: game.slug,
    title: game.title,
    tagline: game.tagline,
    coverImageUrl: game.coverImageUrl,
    engineKey: game.engineKey,
    kind: game.kind,
    // Le sponsor n'est montré au cinéma que pour un jeu sponsorisé.
    sponsor:
      game.kind === 'sponsored' && game.sponsor
        ? { name: game.sponsor.name, logoUrl: game.sponsor.logoUrl }
        : null,
    durationEstimateSeconds: game.durationEstimateSeconds,
    tags: readTags(game.tags),
    revenue,
  };
}

/** Aperçu du contenu selon le moteur : texte des questions seulement. */
function contentSummary(game: CatalogDetailRow): CatalogContentSummary | null {
  if (game.engineKey === QUIZ_ENGINE_KEY) {
    if (!game.quiz) return null;
    return {
      questionsCount: game.quiz._count.questions,
      sampleQuestions: game.quiz.questions.map((q) => q.text),
    };
  }
  if (game.engineKey === POLL_ENGINE_KEY) {
    const parsed = pollConfigSchema.safeParse(game.configJson);
    if (!parsed.success) return null;
    return {
      questionsCount: parsed.data.questions.length,
      sampleQuestions: parsed.data.questions.slice(0, SAMPLE_QUESTIONS).map((q) => q.text),
    };
  }
  return null;
}

async function list(user: TenantScopeUser, query: CatalogQuery): Promise<CatalogGame[]> {
  const cinemaId = await resolveCinema(user, query.cinemaSlug);
  const filters: Prisma.GameWhereInput = {};
  if (query.kind) filters.kind = query.kind;
  if (query.engineKey) filters.engineKey = query.engineKey;
  if (query.search) {
    filters.OR = [{ title: { contains: query.search } }, { tagline: { contains: query.search } }];
  }
  const games = await prisma.game.findMany({
    where: { AND: [gamesService.availableWhere(cinemaId), filters] },
    include: CATALOG_INCLUDE,
    orderBy: { title: 'asc' },
  });
  const revenue = await campaignsService.revenueByGame(games.map((g) => g.id));
  return games.map((g) => shapeCatalogGame(g, revenue.get(g.id.toString()) ?? null));
}

/** Fiche d'un jeu ; 404 GAME_NOT_FOUND s'il n'est pas disponible pour ce cinéma. */
async function detail(
  user: TenantScopeUser,
  slug: string,
  cinemaSlug: string,
): Promise<CatalogGameDetail> {
  const cinemaId = await resolveCinema(user, cinemaSlug);
  const game = await prisma.game.findFirst({
    where: { AND: [{ slug }, gamesService.availableWhere(cinemaId)] },
    include: CATALOG_DETAIL_INCLUDE,
  });
  if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
  const revenue = await campaignsService.revenueByGame([game.id]);
  return {
    ...shapeCatalogGame(game, revenue.get(game.id.toString()) ?? null),
    description: game.description,
    rulesText: game.rulesText,
    minPlayers: game.minPlayers,
    contentSummary: contentSummary(game),
  };
}

export const catalogService = { list, detail };
