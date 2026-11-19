import type { Prisma } from '@prisma/client';
import type { ScreenProgram, ScreenProgramBody } from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import {
  assertCanAccessCinema,
  assertCanAccessScreen,
  type TenantScopeUser,
} from '../../shared/auth/tenant-scope.js';
import { gamesService } from '../games/games.service.js';
import { sessionsService } from '../sessions/sessions.service.js';

/**
 * Programmation des salles (C2) : jeux associés à chaque salle, dans l'ordre, 5 au plus.
 * La disponibilité d'un jeu suit la règle unique `gamesService.availableWhere` (C1).
 */

const ACTIVE_SESSION_STATES = ['lobby', 'running', 'paused'] as const;

const PROGRAM_SCREEN_INCLUDE = {
  nucs: {
    select: { status: true, lastSeenAt: true },
    // Boîtier vu le plus récemment (une salle a en pratique un seul NUC).
    orderBy: { lastSeenAt: 'desc' },
    take: 1,
  },
  sessions: {
    where: { state: { in: [...ACTIVE_SESSION_STATES] } },
    select: { id: true, state: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  programItems: {
    orderBy: { position: 'asc' },
    include: { game: { include: { sponsor: { select: { name: true } } } } },
  },
} satisfies Prisma.ScreenInclude;

type ProgramScreenRow = Prisma.ScreenGetPayload<{ include: typeof PROGRAM_SCREEN_INCLUDE }>;

/** Identifiants, parmi `gameIds`, des jeux disponibles pour ce cinéma. */
async function availableGameIds(gameIds: bigint[], cinemaId: bigint): Promise<Set<bigint>> {
  if (gameIds.length === 0) return new Set();
  const rows = await prisma.game.findMany({
    where: { AND: [{ id: { in: gameIds } }, gamesService.availableWhere(cinemaId)] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

function shapeProgram(screen: ProgramScreenRow, available: Set<bigint>): ScreenProgram {
  const nuc = screen.nucs[0];
  const session = screen.sessions[0];
  return {
    screenId: screen.id.toString(),
    name: screen.name,
    capacity: screen.capacity,
    status: screen.status,
    nuc: nuc ? { status: nuc.status, lastSeenAt: nuc.lastSeenAt?.toISOString() ?? null } : null,
    activeSession: session ? { id: session.id.toString(), state: session.state } : null,
    items: screen.programItems.map(({ game }) => ({
      gameSlug: game.slug,
      title: game.title,
      tagline: game.tagline,
      coverImageUrl: game.coverImageUrl,
      engineKey: game.engineKey,
      kind: game.kind,
      // Le sponsor n'est montré au cinéma que pour un jeu sponsorisé (comme le catalogue).
      sponsorName: game.kind === 'sponsored' ? (game.sponsor?.name ?? null) : null,
      durationEstimateSeconds: game.durationEstimateSeconds,
      available: available.has(game.id),
    })),
  };
}

async function loadScreenOrThrow(screenId: bigint) {
  const screen = await prisma.screen.findUnique({
    where: { id: screenId },
    select: { id: true, cinemaId: true },
  });
  if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');
  return screen;
}

async function screenProgram(screenId: bigint, cinemaId: bigint): Promise<ScreenProgram> {
  const screen = await prisma.screen.findUniqueOrThrow({
    where: { id: screenId },
    include: PROGRAM_SCREEN_INCLUDE,
  });
  const available = await availableGameIds(
    screen.programItems.map((i) => i.gameId),
    cinemaId,
  );
  return shapeProgram(screen, available);
}

/** GET /api/cinemas/:slug/programs : chaque salle du cinéma et son programme. */
async function listForCinema(user: TenantScopeUser, cinemaSlug: string): Promise<ScreenProgram[]> {
  const cinema = await prisma.cinema.findUnique({
    where: { slug: cinemaSlug },
    select: { id: true, deletedAt: true },
  });
  if (!cinema || cinema.deletedAt) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }
  await assertCanAccessCinema(user, cinema.id);

  const screens = await prisma.screen.findMany({
    where: { cinemaId: cinema.id },
    include: PROGRAM_SCREEN_INCLUDE,
    orderBy: { name: 'asc' },
  });
  const available = await availableGameIds(
    screens.flatMap((s) => s.programItems.map((i) => i.gameId)),
    cinema.id,
  );
  return screens.map((s) => shapeProgram(s, available));
}

/**
 * PUT /api/screens/:id/program : remplace le programme dans une transaction. Un jeu ajouté doit
 * être disponible pour le cinéma (403 GAME_NOT_AVAILABLE) ; un jeu déjà au programme et retiré
 * du catalogue depuis peut y rester (affiché « Retiré du catalogue » jusqu'à son retrait), pour
 * que réordonner ou retirer un autre jeu reste possible.
 */
async function replace(
  user: TenantScopeUser,
  screenId: bigint,
  body: ScreenProgramBody,
): Promise<ScreenProgram> {
  await assertCanAccessScreen(user, screenId);
  const screen = await loadScreenOrThrow(screenId);

  const slugs = body.gameSlugs;
  if (new Set(slugs).size !== slugs.length) {
    throw new AppError('The same game cannot be programmed twice', 400, 'DUPLICATE_GAME');
  }
  const games = await prisma.game.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(games.map((g) => [g.slug, g.id]));
  const missing = slugs.find((slug) => !idBySlug.has(slug));
  if (missing !== undefined) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');

  const current = await prisma.screenProgramItem.findMany({
    where: { screenId },
    select: { gameId: true },
  });
  const kept = new Set(current.map((i) => i.gameId));
  const added = games.filter((g) => !kept.has(g.id)).map((g) => g.id);
  const availableAdded = await availableGameIds(added, screen.cinemaId);
  if (added.some((id) => !availableAdded.has(id))) {
    throw new AppError('Game not available for this cinema', 403, 'GAME_NOT_AVAILABLE');
  }

  await prisma.$transaction(async (tx) => {
    await tx.screenProgramItem.deleteMany({ where: { screenId } });
    if (slugs.length > 0) {
      await tx.screenProgramItem.createMany({
        data: slugs.map((slug, i) => ({ screenId, gameId: idBySlug.get(slug)!, position: i + 1 })),
      });
    }
  });

  logger.info({ screenId: screenId.toString(), gameSlugs: slugs }, 'Screen program updated');
  logEvent({
    level: 'info',
    eventType: 'screen.program_updated',
    cinemaId: screen.cinemaId,
    payload: { screenId: screenId.toString(), gameSlugs: slugs },
  });

  return screenProgram(screenId, screen.cinemaId);
}

/**
 * POST /api/screens/:id/program/launch : crée une séance avec les jeux du programme encore
 * disponibles, dans l'ordre, par le même chemin que POST /api/sessions (`sessionsService.create`
 * avec `gameSlugs`). 400 PROGRAM_EMPTY s'il n'y a rien à lancer.
 */
async function launch(user: TenantScopeUser & { id: bigint }, screenId: bigint) {
  await assertCanAccessScreen(user, screenId);
  const screen = await loadScreenOrThrow(screenId);

  const items = await prisma.screenProgramItem.findMany({
    where: { screenId },
    orderBy: { position: 'asc' },
    select: { gameId: true, game: { select: { slug: true } } },
  });
  const available = await availableGameIds(
    items.map((i) => i.gameId),
    screen.cinemaId,
  );
  const gameSlugs = items.filter((i) => available.has(i.gameId)).map((i) => i.game.slug);
  if (gameSlugs.length === 0) {
    throw new AppError('Nothing to launch in this screen program', 400, 'PROGRAM_EMPTY');
  }

  return sessionsService.create({ gameSlugs, screenId: screenId.toString() }, user.id, user.role);
}

export const programsService = { listForCinema, replace, launch };
