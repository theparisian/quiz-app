import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { joinSessionSchema, updateEmailSchema } from './players.schemas.js';
import { playersService } from './players.service.js';
import { prizesService } from '../prizes/prizes.service.js';
import {
  broadcastPlayerJoined,
  broadcastPlayerLeft,
} from '../../shared/sockets/session-broadcast.js';

const router = Router();

router.post('/join', async (req, res, next) => {
  try {
    const data = validate(joinSessionSchema, req.body);
    const result = await playersService.join({
      sessionSlugShort: data.sessionSlugShort,
      pseudo: data.pseudo,
    });

    const io = req.app.get('io') as import('socket.io').Server | undefined;
    if (io) {
      broadcastPlayerJoined(io, result.sessionId, {
        playerId: result.playerId.toString(),
        pseudo: result.pseudo,
      });
    }

    res.status(201).json({
      player: {
        id: result.playerId.toString(),
        pseudo: result.pseudo,
        scoreTotal: result.scoreTotal,
        sessionId: result.sessionId.toString(),
        sessionState: result.sessionState,
        joinedQuestionPosition: result.joinedQuestionPosition,
      },
      resumeToken: result.resumeToken,
      stateSnapshot: result.stateSnapshot,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    const playerId = BigInt(param(req, 'id'));
    const token = req.headers['x-player-token'] as string | undefined;
    if (!token) {
      throw new AppError('Player token required', 401, 'PLAYER_TOKEN_REQUIRED');
    }
    const player = await playersService.getByResumeToken(token);
    if (player.id !== playerId) {
      throw new AppError('Token mismatch', 403, 'FORBIDDEN');
    }
    await playersService.leave(playerId);

    const io = req.app.get('io') as import('socket.io').Server | undefined;
    if (io) {
      broadcastPlayerLeft(io, player.sessionId, playerId.toString());
    }

    res.json({ message: 'Player left' });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/kick',
  requireAuth(['super_admin', 'cinema_admin', 'projectionist']),
  async (req, res, next) => {
    try {
      const playerId = BigInt(param(req, 'id'));
      const player = await playersService.kick(playerId);

      const io = req.app.get('io') as import('socket.io').Server | undefined;
      if (io) {
        broadcastPlayerLeft(io, player.sessionId, playerId.toString());
      }

      res.json({ message: 'Player kicked' });
    } catch (error) {
      next(error);
    }
  },
);

router.patch('/:id/email', async (req, res, next) => {
  try {
    const playerId = BigInt(param(req, 'id'));
    const token = req.headers['x-player-token'] as string | undefined;
    if (!token) {
      throw new AppError('Player token required', 401, 'PLAYER_TOKEN_REQUIRED');
    }

    const player = await playersService.getByResumeToken(token);
    if (player.id !== playerId) {
      throw new AppError('Token mismatch', 403, 'FORBIDDEN');
    }

    const data = validate(updateEmailSchema, req.body);

    const result = await prizesService.createForPlayer(playerId, data.email);

    res.json({ ok: true, emailSent: result.emailSent, prizeId: result.prizeId });
  } catch (error) {
    next(error);
  }
});

export { router as playersRouter };

export const playersPublicRouter = Router();

playersPublicRouter.get('/sessions/:id/players', async (req, res, next) => {
  try {
    const sessionId = BigInt(param(req, 'id'));
    const players = await playersService.listBySession(sessionId);
    res.json(
      players.map((p) => ({
        id: p.id.toString(),
        pseudo: p.pseudo,
        status: p.status,
        scoreTotal: p.scoreTotal,
        rankFinal: p.rankFinal,
        joinedAt: p.joinedAt.toISOString(),
      })),
    );
  } catch (error) {
    next(error);
  }
});
