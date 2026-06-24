import { Router } from 'express';
import { pseudoSuggestionsResponseSchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { generateSuggestions } from '../../shared/pseudo-generator.js';
import {
  checkPseudoSuggestionsRateLimit,
  clientKeyFromRequest,
} from '../../shared/rate-limit/pseudo-suggestions.rate-limit.js';
import { PSEUDO_MAX_LENGTH } from '../players/players.schemas.js';
import {
  createSessionSchema,
  listSessionsQuerySchema,
  abortSessionSchema,
} from './sessions.schemas.js';
import { sessionsService } from './sessions.service.js';
import { getOrchestrator } from './session-orchestrator.service.js';
import { clearLobbyTimer } from './lobby-timer.service.js';

const router = Router();

const ADMIN_ROLES = ['super_admin', 'cinema_admin', 'projectionist'] as const;

function shapeSessionDetail(s: {
  id: bigint;
  slugShort: string;
  state: string;
  currentQuestionPosition: number | null;
  totalPlayers: number;
  winnerPlayerId: bigint | null;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  quiz: { id: bigint; title: string; slug: string; questions: unknown[] };
  screen: {
    id: bigint;
    name: string;
    cinema: { name: string; slug: string; backgroundMusicUrl?: string | null };
  };
}) {
  return {
    id: s.id.toString(),
    slugShort: s.slugShort,
    state: s.state,
    currentQuestionPosition: s.currentQuestionPosition,
    totalPlayers: s.totalPlayers,
    winnerPlayerId: s.winnerPlayerId?.toString() ?? null,
    totalQuestions: s.quiz.questions.length,
    quizTitle: s.quiz.title,
    quizSlug: s.quiz.slug,
    screenId: s.screen.id.toString(),
    screenName: s.screen.name,
    cinemaName: s.screen.cinema.name,
    cinemaSlug: s.screen.cinema.slug,
    backgroundMusicUrl:
      ((s.screen.cinema as Record<string, unknown>).backgroundMusicUrl as string | null) ?? null,
    createdAt: s.createdAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
  };
}

router.post('/', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const data = validate(createSessionSchema, req.body);
    const session = await sessionsService.create(data, req.user!.id);

    const io = req.app.get('io') as import('socket.io').Server | undefined;
    if (io) {
      const payload = {
        sessionId: session.id.toString(),
        slugShort: session.slugShort,
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

router.get('/:id', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const session = await sessionsService.getById(BigInt(param(req, 'id')));
    res.json(shapeSessionDetail(session));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/full', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const session = await sessionsService.getById(BigInt(param(req, 'id')));
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
    res.json({
      ...shapeSessionDetail(session),
      projectionistUserId: session.projectionistUserId?.toString() ?? null,
      top3Prizes,
      consolationPrizesClaimed,
      quiz: {
        id: session.quiz.id.toString(),
        slug: session.quiz.slug,
        title: session.quiz.title,
        questions: session.quiz.questions.map((q) => ({
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
      },
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

router.get('/by-code/:slugShort', async (req, res, next) => {
  try {
    const session = await sessionsService.getBySlugShort(param(req, 'slugShort'));
    const quiz = session.quiz as {
      title: string;
      type: string;
      brandingJson: Record<string, unknown> | null;
      coverImageUrl: string | null;
      sponsor: { name: string; logoUrl: string | null } | null;
    };
    res.json({
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      state: session.state,
      cinema: {
        name: session.screen.cinema.name,
        logoUrl: (session.screen.cinema as { logoUrl?: string | null }).logoUrl ?? null,
      },
      quiz: {
        title: quiz.title,
        type: quiz.type,
        brandingJson: quiz.brandingJson,
        coverImageUrl: quiz.coverImageUrl,
        sponsor: quiz.sponsor ? { name: quiz.sponsor.name, logoUrl: quiz.sponsor.logoUrl } : null,
      },
      totalPlayers: session.totalPlayers,
    });
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
      select: { quiz: { select: { avatarsEnabled: true, avatarLibraryId: true } } },
    });
    if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

    if (!session.quiz.avatarsEnabled || session.quiz.avatarLibraryId == null) {
      res.json({ enabled: false, avatars: [] });
      return;
    }

    const avatars = await prisma.avatar.findMany({
      where: { libraryId: session.quiz.avatarLibraryId },
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
    clearLobbyTimer(sessionId);
    await getOrchestrator().start(sessionId);
    res.json({ message: 'Session started' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await getOrchestrator().pauseSession(sessionId);
    res.json({ message: 'Session paused' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resume', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await getOrchestrator().resumeSession(sessionId);
    res.json({ message: 'Session resumed' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/force-end-question', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    await getOrchestrator().forceEndQuestion(sessionId);
    res.json({ message: 'Question ended' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/abort', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    const body = validate(abortSessionSchema, req.body);
    clearLobbyTimer(sessionId);
    const orchestrator = getOrchestrator();
    if (orchestrator.isRunning(sessionId)) {
      await orchestrator.abortSession(sessionId, body.reason);
    } else {
      await sessionsService.abort(sessionId, body.reason);
    }
    res.json({ message: 'Session aborted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/toggle-mute', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    const muted = await getOrchestrator().toggleMute(sessionId);
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
      const query = validate(listSessionsQuerySchema, req.query);
      const result = await sessionsService.listByScreen(screenId, query);
      res.json({
        items: result.items.map((s) => ({
          id: s.id.toString(),
          slugShort: s.slugShort,
          state: s.state,
          totalPlayers: s.totalPlayers,
          quizTitle: s.quiz.title,
          quizSlug: s.quiz.slug,
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
  '/cinemas/:slug/sessions',
  requireAuth([...ADMIN_ROLES]),
  async (req, res, next) => {
    try {
      const query = validate(listSessionsQuerySchema, req.query);
      const result = await sessionsService.listByCinema(param(req, 'slug'), query);
      res.json({
        items: result.items.map((s) => ({
          id: s.id.toString(),
          slugShort: s.slugShort,
          state: s.state,
          totalPlayers: s.totalPlayers,
          quizTitle: s.quiz.title,
          quizSlug: s.quiz.slug,
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
