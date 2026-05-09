import type { Server, Socket } from 'socket.io';
import {
  consoleAbortPayloadSchema,
  consoleJoinPayloadSchema,
  consoleResumePayloadSchema,
} from '@quiz-app/validation/socket-events';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { AppError } from '../../errors/app-error.js';
import { authenticateJwtFromCookie, type SocketConsoleData } from '../socket-auth.js';
import { getOrchestrator } from '../../../modules/sessions/session-orchestrator.service.js';
import { buildConsoleStateSnapshot } from '../../../modules/sessions/session-resume.service.js';

const CONSOLE_ROLES = new Set(['super_admin', 'cinema_admin', 'projectionist']);

export function setupConsoleHandlers(io: Server): void {
  const nsp = io.of('/console');

  nsp.on('connection', (socket: Socket) => {
    socket.on('console:join', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = consoleJoinPayloadSchema.safeParse(data);
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

        const sessionRow = await prisma.session.findUnique({
          where: { id: sessionId },
          select: { screenId: true },
        });
        if (!sessionRow) {
          socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
          return;
        }

        const socketData: SocketConsoleData = {
          type: 'console',
          userId: auth.userId,
          sessionId,
          role: auth.role,
        };
        socket.data = socketData;

        await socket.join(`session:${sessionId}`);
        await socket.join(`session:${sessionId}:projectionist`);
        await socket.join(`screen:${sessionRow.screenId}`);

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

    socket.on('console:unpause', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getOrchestrator().resumeSession(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'UNPAUSE_ERROR',
          message: error.message ?? 'Failed to unpause',
        });
      }
    });

    socket.on('console:resume', async (data: unknown) => {
      const parsed = consoleResumePayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid console resume payload',
        });
        return;
      }

      try {
        const auth = await authenticateJwtFromCookie(socket);
        if (!auth || !CONSOLE_ROLES.has(auth.role)) {
          socket.emit('error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
          return;
        }

        const sessionId = BigInt(parsed.data.sessionId);
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: { screen: true },
        });
        if (!session) {
          socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
          return;
        }

        if (auth.role !== 'super_admin') {
          if (!auth.cinemaId || session.screen.cinemaId !== auth.cinemaId) {
            socket.emit('error', { code: 'FORBIDDEN', message: 'No access to this session' });
            return;
          }
        }

        const socketData: SocketConsoleData = {
          type: 'console',
          userId: auth.userId,
          sessionId,
          role: auth.role,
        };
        socket.data = socketData;

        await socket.join(`session:${sessionId}`);
        await socket.join(`session:${sessionId}:projectionist`);
        await socket.join(`screen:${session.screenId}`);

        const snapshot = await buildConsoleStateSnapshot(sessionId);
        socket.emit('session:state_snapshot', snapshot);

        logger.info(
          { userId: auth.userId.toString(), sessionId: sessionId.toString(), socketId: socket.id },
          'Console state resume',
        );
      } catch (err: unknown) {
        if (err instanceof AppError) {
          socket.emit('error', { code: err.code, message: err.message });
          return;
        }
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'CONSOLE_RESUME_ERROR',
          message: error.message ?? 'Failed to resume console state',
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

      const parsed = consoleAbortPayloadSchema.safeParse(data ?? {});
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

    socket.on('disconnect', () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (cd?.type === 'console') {
        logger.info({ userId: cd.userId.toString(), socketId: socket.id }, 'Console disconnected');
      }
    });
  });
}
