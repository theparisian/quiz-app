import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { playersService } from '../../../modules/players/players.service.js';
import { getOrchestrator } from '../../../modules/sessions/session-orchestrator.service.js';
import { pseudoRegex } from '../../../modules/players/players.schemas.js';
import type { SocketPlayerData } from '../socket-auth.js';

const playerJoinSchema = z.object({
  pseudo: z.string().min(2).max(30).regex(pseudoRegex),
  sessionSlugShort: z.string().regex(/^\d{4}$/),
});

const submitAnswerSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().min(1),
});

const rejoinRoomSchema = z.object({
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
  resumeToken: z.string().min(1),
});

const DISCONNECT_GRACE_MS = 10_000;

export function setupMobileHandlers(io: Server): void {
  const nsp = io.of('/mobile');

  nsp.on('connection', (socket: Socket) => {
    socket.on('player:join', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = playerJoinSchema.safeParse(data);
      if (!parsed.success) {
        const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        socket.emit('error', { code: 'VALIDATION_ERROR', message: msg });
        return;
      }

      try {
        const result = await playersService.join({
          sessionSlugShort: parsed.data.sessionSlugShort,
          pseudo: parsed.data.pseudo,
        });

        const socketData: SocketPlayerData = {
          type: 'player',
          playerId: result.playerId,
          sessionId: result.sessionId,
          pseudo: result.pseudo,
        };
        socket.data = socketData;

        await socket.join(`session:${result.sessionId}`);

        const response = {
          playerId: result.playerId.toString(),
          resumeToken: result.resumeToken,
          pseudo: result.pseudo,
          sessionId: result.sessionId.toString(),
          scoreTotal: result.scoreTotal,
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('player:join_success', response);
        }

        io.of('/player').to(`session:${result.sessionId}`).emit('player:joined', {
          playerId: result.playerId.toString(),
          pseudo: result.pseudo,
          joinedAt: new Date().toISOString(),
        });
        io.of('/console').to(`session:${result.sessionId}`).emit('player:joined', {
          playerId: result.playerId.toString(),
          pseudo: result.pseudo,
          joinedAt: new Date().toISOString(),
        });
        nsp.to(`session:${result.sessionId}`).emit('player:joined', {
          playerId: result.playerId.toString(),
          pseudo: result.pseudo,
          joinedAt: new Date().toISOString(),
        });

        logger.info(
          { playerId: result.playerId.toString(), socketId: socket.id },
          'Player joined via socket',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string; statusCode?: number };
        socket.emit('error', {
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message ?? 'Failed to join',
        });
      }
    });

    socket.on('player:rejoin_room', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = rejoinRoomSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid rejoin payload' });
        return;
      }

      try {
        const player = await prisma.player.findUnique({
          where: { resumeToken: parsed.data.resumeToken },
        });
        if (!player || player.id.toString() !== parsed.data.playerId) {
          socket.emit('error', { code: 'INVALID_TOKEN', message: 'Invalid resume token' });
          return;
        }

        const sessionId = BigInt(parsed.data.sessionId);
        if (player.sessionId !== sessionId) {
          socket.emit('error', { code: 'SESSION_MISMATCH', message: 'Player not in this session' });
          return;
        }

        const socketData: SocketPlayerData = {
          type: 'player',
          playerId: player.id,
          sessionId,
          pseudo: player.pseudo,
        };
        socket.data = socketData;

        await socket.join(`session:${sessionId}`);

        const response = {
          playerId: player.id.toString(),
          pseudo: player.pseudo,
          sessionId: sessionId.toString(),
          scoreTotal: player.scoreTotal,
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('player:rejoin_room_success', response);
        }

        logger.info(
          { playerId: player.id.toString(), sessionId: sessionId.toString() },
          'Player rejoined room',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'REJOIN_ERROR',
          message: error.message ?? 'Failed to rejoin',
        });
      }
    });

    socket.on('player:submit_answer', (data: unknown) => {
      const parsed = submitAnswerSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid answer payload' });
        return;
      }

      const playerData = socket.data as SocketPlayerData | undefined;
      if (!playerData || playerData.type !== 'player') {
        socket.emit('error', { code: 'NOT_JOINED', message: 'Join a session first' });
        return;
      }

      void (async () => {
        try {
          await getOrchestrator().submitAnswer({
            sessionId: playerData.sessionId,
            playerId: playerData.playerId,
            questionId: BigInt(parsed.data.questionId),
            answerId: BigInt(parsed.data.answerId),
          });
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          socket.emit('error', {
            code: error.code ?? 'SUBMIT_ERROR',
            message: error.message ?? 'Failed to submit answer',
          });
        }
      })();
    });

    socket.on('player:leave', async () => {
      const playerData = socket.data as SocketPlayerData | undefined;
      if (!playerData || playerData.type !== 'player') return;

      try {
        await playersService.leave(playerData.playerId);

        io.of('/player').to(`session:${playerData.sessionId}`).emit('player:left', {
          playerId: playerData.playerId.toString(),
        });
        io.of('/console').to(`session:${playerData.sessionId}`).emit('player:left', {
          playerId: playerData.playerId.toString(),
        });
        nsp.to(`session:${playerData.sessionId}`).emit('player:left', {
          playerId: playerData.playerId.toString(),
        });
      } catch {
        // ignore
      }
    });

    socket.on('player:resume', (_data: unknown, callback?: (res: unknown) => void) => {
      if (typeof callback === 'function') {
        callback({ error: { code: 'NOT_IMPLEMENTED', message: 'Resume not available yet (PR6)' } });
      } else {
        socket.emit('error', {
          code: 'NOT_IMPLEMENTED',
          message: 'Resume not available yet (PR6)',
        });
      }
    });

    socket.on('disconnect', () => {
      const playerData = socket.data as SocketPlayerData | undefined;
      if (!playerData || playerData.type !== 'player') return;

      setTimeout(() => {
        void playersService.leave(playerData.playerId).catch(() => {});
      }, DISCONNECT_GRACE_MS);
    });
  });
}
