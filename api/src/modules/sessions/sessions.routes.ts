import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { pseudoSuggestionsResponseSchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import {
  assertCanAccessCinema,
  assertCanAccessScreen,
  assertCanAccessSession,
} from '../../shared/auth/tenant-scope.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { generateSuggestions } from '../../shared/pseudo-generator.js';
import {
  checkPseudoSuggestionsRateLimit,
  clientKeyFromRequest,
} from '../../shared/rate-limit/pseudo-suggestions.rate-limit.js';
import { failureRateLimitMiddleware, ipKey } from '../../shared/rate-limit/sliding-window.js';
import { sessionCodeFailureLimiter } from '../../shared/rate-limit/limiters.js';
import { PSEUDO_MAX_LENGTH } from '../players/players.schemas.js';
import {
  createSessionSchema,
  listSessionsQuerySchema,
  abortSessionSchema,
} from './sessions.schemas.js';
import { SESSION_DETAIL_INCLUDE, sessionsService } from './sessions.service.js';
import { resolveLobbyQuiz, sessionTitle } from './session-content.service.js';
import { getSessionRuntime } from './session-runtime.service.js';
import { clearLobbyTimer } from './lobby-timer.service.js';
import {
  buildSessionReport,
  listReportableSessions,
  buildCinemaSessionsCsv,
  resolveReportScope,
  assertCinemaAccess,
} from './session-report.service.js';

const router = Router();

// Routes publiques par code / jeton : seules les réponses 404 (code inconnu) comptent,
// 10 échecs par minute par IP, puis 429 pendant la fenêtre.
const unknownCodeLimit = failureRateLimitMiddleware(sessionCodeFailureLimiter, ipKey);
router.use('/by-code', unknownCodeLimit);
router.use('/by-token', unknownCodeLimit);

const ADMIN_ROLES = ['super_admin', 'cinema_admin', 'projectionist'] as const;
const REPORT_ROLES = ['super_admin', 'cinema_admin'] as const;

type SessionDetailRow = Prisma.SessionGetPayload<{ include: typeof SESSION_DETAIL_INCLUDE }>;
type QuizWithQuestions = NonNullable<SessionDetailRow['quiz']>;

function shapeSessionDetail(s: SessionDetailRow) {
  const title = sessionTitle(s);
  // Questions de toutes les manches quiz (séance sans manche : quiz de la séance).
  const totalQuestions =
    s.rounds.length > 0
      ? s.rounds.reduce((acc, r) => acc + (r.game.quiz?.questions.length ?? 0), 0)
      : (s.quiz?.questions.length ?? 0);
  return {
    id: s.id.toString(),
    slugShort: s.slugShort,
    state: s.state,
    currentQuestionPosition: s.currentQuestionPosition,
    totalPlayers: s.totalPlayers,
    winnerPlayerId: s.winnerPlayerId?.toString() ?? null,
    totalQuestions,
    quizTitle: title.title,
    quizSlug: title.slug,
    totalRounds: s.rounds.length,
    rounds: s.rounds.map((r) => ({
      roundId: r.id.toString(),
      position: r.position,
      state: r.state,
      game: {
        slug: r.game.slug,
        title: r.game.title,
        engineKey: r.game.engineKey,
        kind: r.game.kind,
        durationEstimateSeconds: r.game.durationEstimateSeconds,
      },
    })),
    screenId: s.screen.id.toString(),
    screenName: s.screen.name,
    cinemaName: s.screen.cinema.name,
    cinemaSlug: s.screen.cinema.slug,
    backgroundMusicUrl: s.screen.cinema.backgroundMusicUrl ?? null,
    createdAt: s.createdAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
  };
}

/** Contenu console d'un quiz, bonnes réponses comprises (routes authentifiées seulement). */
function shapeQuizContent(quiz: QuizWithQuestions) {
  return {
    id: quiz.id.toString(),
    slug: quiz.slug,
    title: quiz.title,
    coverImageUrl: quiz.coverImageUrl,
    questions: quiz.questions.map((q) => ({
      id: q.id.toString(),
      position: q.position,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitSeconds: q.timeLimitSeconds,
      pointsMax: q.pointsMax,
      pointsFloor: q.pointsFloor,
      explanation: q.explanation,
      answers: q.answers.map((a) => ({
        id: a.id.toString(),
        position: a.position,
        text: a.text,
        isCorrect: a.isCorrect,
      })),
    })),
  };
}

router.post('/', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const data = validate(createSessionSchema, req.body);
    await assertCanAccessScreen(req.user!, BigInt(data.screenId));
    const session = await sessionsService.create(data, req.user!.id, req.user!.role);

    const io = req.app.get('io') as import('socket.io').Server | undefined;
    if (io) {
      const payload = {
        sessionId: session.id.toString(),
        slugShort: session.slugShort,
        joinToken: session.joinToken,
      };
      const playerNsp = io.of('/player');
      playerNsp.to(`screen:${session.screen.id}`).emit('screen:session_started', payload);
      const nucs = await prisma.nuc.findMany({
        where: { screenId: session.screen.id },
        select: { id: true },
      });
      for (const nuc of nucs) {
        playerNsp.to(`nuc:${nuc.id}`).emit('screen:session_started', payload);
      }
    }

    res.status(201).json(shapeSessionDetail(session));
  } catch (error) {
    next(error);
  }
});

router.get('/reports', requireAuth([...REPORT_ROLES]), async (req, res, next) => {
  try {
    const scope = resolveReportScope(req.user!);
    const items = await listReportableSessions(scope);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/report', requireAuth([...REPORT_ROLES]), async (req, res, next) => {
  try {
    const id = BigInt(param(req, 'id'));
    const session = await prisma.session.findUnique({
      where: { id },
      select: { screen: { select: { cinemaId: true } } },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    assertCinemaAccess(req.user!, session.screen.cinemaId);

    const report = await buildSessionReport(id);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    const session = await sessionsService.getById(sessionId);
    res.json(shapeSessionDetail(session));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/full', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    const session = await sessionsService.getById(sessionId);
    const prizes = await prisma.prize.findMany({
      where: { sessionId: session.id },
      include: { player: { select: { id: true, emailForPrize: true } } },
      orderBy: { rank: 'asc' },
    });
    const top3Prizes = prizes
      .filter((p) => !p.isConsolation && p.rank <= 3)
      .map((p) => ({
        prizeId: p.id.toString(),
        playerId: p.playerId.toString(),
        rank: p.rank,
        label: p.label,
        shortCode: p.shortCode,
        emailSentAt: p.emailSentAt?.toISOString() ?? null,
        redeemedAt: p.redeemedAt?.toISOString() ?? null,
        hasPlayerEmail: !!p.player.emailForPrize,
      }));
    const consolationPrizesClaimed = prizes.filter((p) => p.isConsolation).length;
    const lobbyQuiz =
      session.rounds.length > 0 ? (session.rounds[0]!.game.quiz ?? null) : session.quiz;
    res.json({
      ...shapeSessionDetail(session),
      projectionistUserId: session.projectionistUserId?.toString() ?? null,
      top3Prizes,
      consolationPrizesClaimed,
      // Quiz de la première manche (en-tête de la console) ; contenu de chaque manche dans
      // `rounds[].content` (la console utilise celui de la manche active, B5).
      quiz: lobbyQuiz ? shapeQuizContent(lobbyQuiz) : null,
      rounds: session.rounds.map((r) => ({
        roundId: r.id.toString(),
        position: r.position,
        state: r.state,
        game: {
          slug: r.game.slug,
          title: r.game.title,
          engineKey: r.game.engineKey,
          kind: r.game.kind,
        },
        content: r.game.quiz ? shapeQuizContent(r.game.quiz) : null,
      })),
      players: session.players.map((p) => ({
        id: p.id.toString(),
        pseudo: p.pseudo,
        avatarUrl: (p as { avatar?: { imageUrl: string } | null }).avatar?.imageUrl ?? null,
        scoreTotal: p.scoreTotal,
        status: p.status,
        joinedAt: p.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/** Réponse publique commune à by-code et by-token (sans questions ni réponses). */
function shapePublicSession(session: Awaited<ReturnType<typeof sessionsService.getBySlugShort>>) {
  // Lobby : jeu de la première manche (son quiz pour l'habillage), sinon quiz de la séance.
  const firstGame = session.rounds[0]?.game ?? null;
  const quiz = firstGame ? firstGame.quiz : session.quiz;
  const sponsor = firstGame ? firstGame.sponsor : (session.quiz?.sponsor ?? null);
  return {
    sessionId: session.id.toString(),
    slugShort: session.slugShort,
    state: session.state,
    cinema: {
      name: session.screen.cinema.name,
      logoUrl: session.screen.cinema.logoUrl ?? null,
    },
    quiz: {
      title: firstGame?.title ?? quiz?.title ?? '',
      type: quiz?.type ?? (firstGame?.kind === 'sponsored' ? 'sponsored' : 'standard'),
      brandingJson: (quiz?.brandingJson as Record<string, unknown> | null | undefined) ?? null,
      coverImageUrl: firstGame?.coverImageUrl ?? quiz?.coverImageUrl ?? null,
      sponsor: sponsor ? { name: sponsor.name, logoUrl: sponsor.logoUrl } : null,
    },
    totalPlayers: session.totalPlayers,
  };
}

router.get('/by-code/:slugShort', async (req, res, next) => {
  try {
    const session = await sessionsService.getBySlugShort(param(req, 'slugShort'));
    res.json(shapePublicSession(session));
  } catch (error) {
    next(error);
  }
});

router.get('/by-token/:joinToken', async (req, res, next) => {
  try {
    const session = await sessionsService.getByJoinToken(param(req, 'joinToken'));
    res.json(shapePublicSession(session));
  } catch (error) {
    next(error);
  }
});

router.get('/by-code/:slugShort/avatars', async (req, res, next) => {
  try {
    const slugShort = param(req, 'slugShort');
    const session = await prisma.session.findFirst({
      where: { slugShort },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

    // Avatars : configuration du jeu de la première manche (lobby).
    const lobbyQuiz = await resolveLobbyQuiz(session.id);
    if (!lobbyQuiz?.avatarsEnabled || lobbyQuiz.avatarLibraryId == null) {
      res.json({ enabled: false, avatars: [] });
      return;
    }

    const avatars = await prisma.avatar.findMany({
      where: { libraryId: lobbyQuiz.avatarLibraryId },
      orderBy: { position: 'asc' },
      select: { id: true, imageUrl: true, label: true },
    });
    res.json({
      enabled: true,
      avatars: avatars.map((a) => ({ id: a.id.toString(), imageUrl: a.imageUrl, label: a.label })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/by-code/:slugShort/pseudo-suggestions', async (req, res, next) => {
  try {
    const clientKey = clientKeyFromRequest(req.ip);
    const rate = checkPseudoSuggestionsRateLimit(clientKey);
    if (!rate.allowed) {
      throw new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const slugShort = param(req, 'slugShort');
    const session = await prisma.session.findFirst({
      where: { slugShort },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        state: true,
        players: {
          where: { status: { not: 'kicked' } },
          select: { pseudo: true },
        },
      },
    });

    if (!session || session.state === 'ended' || session.state === 'aborted') {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    const suggestions = generateSuggestions({
      excluded: session.players.map((p) => p.pseudo),
      count: 3,
      maxLength: PSEUDO_MAX_LENGTH,
    });

    while (suggestions.length < 3) {
      const extra = generateSuggestions({
        excluded: [...session.players.map((p) => p.pseudo), ...suggestions],
        count: 1,
        maxLength: PSEUDO_MAX_LENGTH,
      });
      if (extra.length === 0) break;
      suggestions.push(extra[0]!);
    }

    if (suggestions.length < 3) {
      throw new AppError('Unable to generate suggestions', 503, 'SUGGESTIONS_UNAVAILABLE');
    }

    const payload = pseudoSuggestionsResponseSchema.parse({
      suggestions: [suggestions[0], suggestions[1], suggestions[2]],
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    clearLobbyTimer(sessionId);
    await getSessionRuntime().start(sessionId);
    res.json({ message: 'Session started' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    await getSessionRuntime().pauseSession(sessionId);
    res.json({ message: 'Session paused' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resume', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    await getSessionRuntime().resumeSession(sessionId);
    res.json({ message: 'Session resumed' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/force-advance', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    await getSessionRuntime().forceAdvance(sessionId);
    res.json({ message: 'Round advanced' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/skip-round', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    await getSessionRuntime().skipRound(sessionId);
    res.json({ message: 'Round skipped' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/abort', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    const body = validate(abortSessionSchema, req.body);
    clearLobbyTimer(sessionId);
    await getSessionRuntime().abortSession(sessionId, body.reason);
    res.json({ message: 'Session aborted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/toggle-mute', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await assertCanAccessSession(req.user!, sessionId);
    const muted = await getSessionRuntime().toggleMute(sessionId);
    res.json({ muted });
  } catch (error) {
    next(error);
  }
});

export { router as sessionsRouter };

export const sessionsNestedRouter = Router();

sessionsNestedRouter.get(
  '/screens/:screenId/sessions',
  requireAuth([...ADMIN_ROLES]),
  async (req, res, next) => {
    try {
      const screenId = BigInt(param(req, 'screenId'));
      await assertCanAccessScreen(req.user!, screenId);
      const query = validate(listSessionsQuerySchema, req.query);
      const result = await sessionsService.listByScreen(screenId, query);
      res.json({
        items: result.items.map((s) => ({
          id: s.id.toString(),
          slugShort: s.slugShort,
          state: s.state,
          totalPlayers: s.totalPlayers,
          quizTitle: sessionTitle(s).title,
          quizSlug: sessionTitle(s).slug,
          playersCount: s._count.players,
          createdAt: s.createdAt.toISOString(),
          startedAt: s.startedAt?.toISOString() ?? null,
          endedAt: s.endedAt?.toISOString() ?? null,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  },
);

sessionsNestedRouter.get(
  '/cinemas/:slug/sessions/report.csv',
  requireAuth([...REPORT_ROLES]),
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      const cinema = await prisma.cinema.findUnique({
        where: { slug },
        select: { id: true, slug: true },
      });
      if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
      assertCinemaAccess(req.user!, cinema.id);

      const csv = await buildCinemaSessionsCsv(cinema.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sessions-${cinema.slug}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

sessionsNestedRouter.get(
  '/cinemas/:slug/sessions',
  requireAuth([...ADMIN_ROLES]),
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      const cinema = await prisma.cinema.findUnique({ where: { slug }, select: { id: true } });
      if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
      await assertCanAccessCinema(req.user!, cinema.id);
      const query = validate(listSessionsQuerySchema, req.query);
      const result = await sessionsService.listByCinema(slug, query);
      res.json({
        items: result.items.map((s) => ({
          id: s.id.toString(),
          slugShort: s.slugShort,
          state: s.state,
          totalPlayers: s.totalPlayers,
          quizTitle: sessionTitle(s).title,
          quizSlug: sessionTitle(s).slug,
          screenId: (s as unknown as { screen: { id: bigint; name: string } }).screen.id.toString(),
          screenName: (s as unknown as { screen: { id: bigint; name: string } }).screen.name,
          playersCount: s._count.players,
          createdAt: s.createdAt.toISOString(),
          startedAt: s.startedAt?.toISOString() ?? null,
          endedAt: s.endedAt?.toISOString() ?? null,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  },
);
