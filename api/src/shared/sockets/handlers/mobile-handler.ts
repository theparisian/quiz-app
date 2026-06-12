import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { playerResumePayloadSchema, playerJoinPayloadSchema } from '@quiz-app/validation';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { AppError } from '../../errors/app-error.js';
import { playersService } from '../../../modules/players/players.service.js';
import { getOrchestrator } from '../../../modules/sessions/session-orchestrator.service.js';
import { buildMobilePlayerStateSnapshot } from '../../../modules/sessions/session-resume.service.js';
import type { SocketPlayerData } from '../socket-auth.js';
import { broadcastPlayerJoined, broadcastPlayerLeft } from '../session-broadcast.js';

const playerJoinSchema = playerJoinPayloadSchema;

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
        if (typeof callback === 'function') {
          callback({ ok: false, code: 'VALIDATION_ERROR', message: msg });
        } else {
          socket.emit('error', { code: 'VALIDATION_ERROR', message: msg });
        }
        return;
      }

      try {
        const result = await playersService.join({
          sessionSlugShort: parsed.data.sessionSlugShort,
          pseudo: parsed.data.pseudo,
          pseudoSource: parsed.data.pseudoSource,
        });

        const socketData: SocketPlayerData = {
          type: 'player',
          playerId: result.playerId,
          sessionId: result.sessionId,
          pseudo: result.pseudo,
        };
        socket.data = socketData;

        await socket.join(`session:${result.sessionId}`);
        await socket.join(`session:${result.sessionId}:players`);

        const response = {
          ok: true,
          playerId: result.playerId.toString(),
          resumeToken: result.resumeToken,
          pseudo: result.pseudo,
          sessionId: result.sessionId.toString(),
          scoreTotal: result.scoreTotal,
          joinedQuestionPosition: result.joinedQuestionPosition,
          stateSnapshot: result.stateSnapshot,
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('player:join_success', response);
        }

        broadcastPlayerJoined(io, result.sessionId, {
          playerId: result.playerId.toString(),
          pseudo: result.pseudo,
        });

        logger.info(
          { playerId: result.playerId.toString(), socketId: socket.id },
          'Player joined via socket',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string; statusCode?: number };
        const payload = {
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message ?? 'Failed to join',
        };
        if (typeof callback === 'function') {
          callback({ ok: false, ...payload });
        } else {
          socket.emit('error', payload);
        }
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
        await socket.join(`session:${sessionId}:players`);

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

        broadcastPlayerLeft(io, playerData.sessionId, playerData.playerId.toString());
      } catch {
        // ignore
      }
    });

    socket.on('player:resume', async (data: unknown) => {
      const parsed = playerResumePayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid player resume payload',
        });
        return;
      }

      try {
        const sessionId = BigInt(parsed.data.sessionId);
        const player = await prisma.player.findUnique({
          where: { resumeToken: parsed.data.resumeToken },
        });
        if (!player) {
          socket.emit('error', {
            code: 'INVALID_RESUME_TOKEN',
            message: 'Invalid or unknown resume token',
          });
          return;
        }
        if (player.sessionId !== sessionId) {
          socket.emit('error', {
            code: 'SESSION_MISMATCH',
            message: 'Player is not in this session',
          });
          return;
        }

        await prisma.player.update({
          where: { id: player.id },
          data: { status: 'active' },
        });

        const socketData: SocketPlayerData = {
          type: 'player',
          playerId: player.id,
          sessionId,
          pseudo: player.pseudo,
        };
        socket.data = socketData;

        await socket.join(`session:${sessionId}`);
        await socket.join(`session:${sessionId}:players`);

        const snapshot = await buildMobilePlayerStateSnapshot(player.id, sessionId);
        socket.emit('session:state_snapshot', snapshot);

        logger.info(
          { playerId: player.id.toString(), sessionId: sessionId.toString() },
          'Player resumed',
        );
      } catch (err: unknown) {
        if (err instanceof AppError) {
          socket.emit('error', { code: err.code, message: err.message });
          return;
        }
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'RESUME_ERROR',
          message: error.message ?? 'Failed to resume',
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
