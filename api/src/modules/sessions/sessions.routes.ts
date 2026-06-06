import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { prisma } from '../../shared/db/index.js';
import {
  createSessionSchema,
  listSessionsQuerySchema,
  abortSessionSchema,
} from './sessions.schemas.js';
import { sessionsService } from './sessions.service.js';
import { getOrchestrator } from './session-orchestrator.service.js';

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
    res.json({
      ...shapeSessionDetail(session),
      projectionistUserId: session.projectionistUserId?.toString() ?? null,
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

router.post('/:id/start', requireAuth([...ADMIN_ROLES]), async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
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
