import type { Server, Socket } from 'socket.io';
import {
  consoleAbortPayloadSchema,
  consoleJoinPayloadSchema,
  consoleResumePayloadSchema,
} from '@quiz-app/validation';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { AppError } from '../../errors/app-error.js';
import { authenticateJwtFromCookie, type SocketConsoleData } from '../socket-auth.js';
import { assertCanAccessSession } from '../../auth/tenant-scope.js';
import { getSessionRuntime } from '../../../modules/sessions/session-runtime.service.js';
import { clearLobbyTimer } from '../../../modules/sessions/lobby-timer.service.js';
import { buildConsoleStateSnapshot } from '../../../modules/sessions/session-resume.service.js';

const CONSOLE_ROLES = new Set(['super_admin', 'cinema_admin', 'projectionist']);

/**
 * Vérifie l'accès au cinéma de la session. En cas de refus, émet l'erreur socket
 * et renvoie false : l'appelant doit retourner sans rejoindre aucune room.
 */
async function checkConsoleSessionAccess(
  socket: Socket,
  auth: { role: string; cinemaId: bigint | null },
  sessionId: bigint,
): Promise<boolean> {
  try {
    await assertCanAccessSession({ role: auth.role, cinemaId: auth.cinemaId }, sessionId);
    return true;
  } catch (err: unknown) {
    if (err instanceof AppError && err.code === 'FORBIDDEN') {
      socket.emit('error', { code: 'FORBIDDEN', message: 'Not allowed for this session' });
      return false;
    }
    if (err instanceof AppError) {
      socket.emit('error', { code: err.code, message: err.message });
      return false;
    }
    throw err;
  }
}

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
        if (!(await checkConsoleSessionAccess(socket, auth, sessionId))) return;

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
        clearLobbyTimer(cd.sessionId);
        await getSessionRuntime().start(cd.sessionId);
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
        await getSessionRuntime().pauseSession(cd.sessionId);
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
        await getSessionRuntime().resumeSession(cd.sessionId);
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
        if (!(await checkConsoleSessionAccess(socket, auth, sessionId))) return;

        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: { screen: true },
        });
        if (!session) {
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

    socket.on('console:force_advance', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getSessionRuntime().forceAdvance(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'FORCE_ADVANCE_ERROR',
          message: error.message ?? 'Failed',
        });
      }
    });

    // B5 : la manche en cours passe en `skipped`, puis enchaînement normal.
    socket.on('console:skip_round', async () => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;
      try {
        await getSessionRuntime().skipRound(cd.sessionId);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'SKIP_ROUND_ERROR',
          message: error.message ?? 'Failed to skip round',
        });
      }
    });

    socket.on('console:abort', async (data: unknown) => {
      const cd = socket.data as SocketConsoleData | undefined;
      if (!cd || cd.type !== 'console') return;

      const parsed = consoleAbortPayloadSchema.safeParse(data ?? {});
      try {
        clearLobbyTimer(cd.sessionId);
        await getSessionRuntime().abortSession(
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
          await getSessionRuntime().toggleMute(cd.sessionId);
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
