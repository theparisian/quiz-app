import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { joinSessionSchema, updateEmailSchema } from './players.schemas.js';
import { playersService } from './players.service.js';
import { prisma } from '../../shared/db/index.js';

const router = Router();

router.post('/join', async (req, res, next) => {
  try {
    const data = validate(joinSessionSchema, req.body);
    const result = await playersService.join({
      sessionSlugShort: data.sessionSlugShort,
      pseudo: data.pseudo,
    });
    res.status(201).json({
      player: {
        id: result.playerId.toString(),
        pseudo: result.pseudo,
        scoreTotal: result.scoreTotal,
        sessionId: result.sessionId.toString(),
        sessionState: result.sessionState,
      },
      resumeToken: result.resumeToken,
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
      await playersService.kick(playerId);
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

    const session = await prisma.session.findUnique({ where: { id: player.sessionId } });
    if (!session || session.state !== 'ended') {
      throw new AppError('Session is not ended', 409, 'SESSION_NOT_ENDED');
    }

    if (!player.rankFinal || player.rankFinal > 3) {
      throw new AppError('Player not in top 3', 403, 'PLAYER_NOT_ELIGIBLE');
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { emailForPrize: data.email },
    });

    res.json({ ok: true });
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
