import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../../logger/index.js';
import { authenticateJwtFromCookie, type SocketConsoleData } from '../socket-auth.js';
import { getOrchestrator } from '../../../modules/sessions/session-orchestrator.service.js';

const consoleJoinSchema = z.object({
  sessionId: z.string().min(1),
});

const abortSchema = z.object({
  reason: z.string().max(500).optional(),
});

const CONSOLE_ROLES = new Set(['super_admin', 'cinema_admin', 'projectionist']);

export function setupConsoleHandlers(io: Server): void {
  const nsp = io.of('/console');

  nsp.on('connection', (socket: Socket) => {
    socket.on('console:join', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = consoleJoinSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid console join payload' });
        return;
      }

      try {
        const auth = await authenticateJwtFromCookie(socket);
        if (!auth || !CONSOLE_ROLES.has(auth.role)) {
          socket.emit('error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
          return;
        }

        const sessionId = BigInt(parsed.data.sessionId);

        const socketData: SocketConsoleData = {
          type: 'console',
          userId: auth.userId,
          sessionId,
          role: auth.role,
        };
        socket.data = socketData;

        await socket.join(`session:${sessionId}`);

        const response = {
          sessionId: sessionId.toString(),
          userId: auth.userId.toString(),
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('console:join_success', response);
        }

        logger.info(
          { userId: auth.userId.toString(), sessionId: sessionId.toString(), socketId: socket.id },
          'Console joined session',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'CONSOLE_JOIN_ERROR',
          message: error.message ?? 'Failed to join',
        });
      }
    });

    socket.on('console:start', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') {
        socket.emit('error', { code: 'NOT_JOINED', message: 'Join a session first' });
        return;
      }
      try {
        await getOrchestrator().start(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'START_ERROR',
          message: error.message ?? 'Failed to start',
        });
      }
    });

    socket.on('console:pause', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getOrchestrator().pauseSession(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'PAUSE_ERROR',
          message: error.message ?? 'Failed to pause',
        });
      }
    });

    socket.on('console:resume', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getOrchestrator().resumeSession(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'RESUME_ERROR',
          message: error.message ?? 'Failed to resume',
        });
      }
    });

    socket.on('console:force_end_question', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getOrchestrator().forceEndQuestion(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'FORCE_END_ERROR',
          message: error.message ?? 'Failed',
        });
      }
    });

    socket.on('console:abort', async (data: unknown) => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;

      const parsed = abortSchema.safeParse(data ?? {});
      try {
        await getOrchestrator().abortSession(
          cd.sessionId,
          parsed.success ? parsed.data.reason : undefined,
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'ABORT_ERROR',
          message: error.message ?? 'Failed to abort',
        });
      }
    });

    socket.on('console:toggle_mute', () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      void (async () => {
        try {
          await getOrchestrator().toggleMute(cd.sessionId);
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          socket.emit('error', {
            code: error.code ?? 'MUTE_ERROR',
            message: error.message ?? 'Failed to toggle mute',
          });
        }
      })();
    });

    socket.on('console:resume_session', (_data: unknown, callback?: (res: unknown) => void) => {
      if (typeof callback === 'function') {
        callback({
          error: { code: 'NOT_IMPLEMENTED', message: 'Console resume not available yet (PR6)' },
        });
      } else {
        socket.emit('error', {
          code: 'NOT_IMPLEMENTED',
          message: 'Console resume not available yet (PR6)',
        });
      }
    });

    socket.on('disconnect', () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (cd?.type === 'console') {
        logger.info({ userId: cd.userId.toString(), socketId: socket.id }, 'Console disconnected');
      }
    });
  });
}
