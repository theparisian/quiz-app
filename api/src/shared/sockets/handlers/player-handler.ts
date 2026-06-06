import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { nucResumePayloadSchema } from '@quiz-app/validation';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { AppError } from '../../errors/app-error.js';
import { verifyNucJwt } from '../../auth/nuc-jwt.js';
import { authenticateNuc, type SocketNucData } from '../socket-auth.js';
import { buildNucStateSnapshot } from '../../../modules/sessions/session-resume.service.js';
import { nucsService } from '../../../modules/nucs/nucs.service.js';
import { broadcastNucStatusChanged } from '../../nuc-monitor/broadcast-nuc-status.js';

const nucJoinSchema = z.object({
  nucUid: z.string().min(1),
  authKey: z.string().min(1),
  sessionId: z.string().min(1),
});

const nucJoinScreenSchema = z.object({
  nucId: z.string().min(1),
});

const nucJoinSessionSchema = z.object({
  sessionId: z.string().min(1),
});

function parseNucCookie(socket: Socket): string | null {
  const cookies = socket.handshake.headers.cookie;
  if (!cookies) return null;
  const match = cookies.match(/(?:^|;\s*)nuc_session=([^;]+)/);
  return match?.[1] ?? null;
}

export function setupPlayerHandlers(io: Server): void {
  const nsp = io.of('/player');

  nsp.on('connection', (socket: Socket) => {
    socket.on('nuc:join_screen', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = nucJoinScreenSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid nuc:join_screen payload',
        });
        return;
      }

      try {
        const cookieToken = parseNucCookie(socket);
        if (!cookieToken) {
          socket.emit('error', {
            code: 'NUC_AUTH_REQUIRED',
            message: 'NUC session cookie required',
          });
          return;
        }

        const jwt = await verifyNucJwt(cookieToken);
        if (jwt.nucId !== parsed.data.nucId) {
          socket.emit('error', { code: 'NUC_AUTH_FAILED', message: 'NUC ID mismatch with cookie' });
          return;
        }

        const screenId = BigInt(jwt.screenId);
        socket.data = { type: 'nuc', nucId: BigInt(jwt.nucId), screenId };

        await socket.join(`screen:${screenId}`);
        await socket.join(`nuc:${jwt.nucId}`);

        const activeSession = await prisma.session.findFirst({
          where: { screenId, state: { in: ['lobby', 'running', 'paused'] } },
          select: { id: true, slugShort: true, state: true },
          orderBy: { createdAt: 'desc' },
        });

        const response = {
          ok: true,
          screenId: screenId.toString(),
          currentSession: activeSession
            ? {
                sessionId: activeSession.id.toString(),
                slugShort: activeSession.slugShort,
                state: activeSession.state,
              }
            : null,
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('nuc:join_screen_success', response);
        }

        const ip =
          (socket.handshake.headers['x-forwarded-for'] as string | undefined)
            ?.split(',')[0]
            ?.trim() ?? socket.handshake.address;
        const onlineResult = await nucsService.markOnlineFromConnection(BigInt(jwt.nucId), ip);
        if (onlineResult?.cameOnline) {
          broadcastNucStatusChanged(io, {
            nucId: onlineResult.nucId.toString(),
            screenId: onlineResult.screenId.toString(),
            status: 'online',
          });
        }

        logger.info(
          { nucId: jwt.nucId, screenId: screenId.toString(), socketId: socket.id },
          'NUC joined screen room',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'NUC_JOIN_SCREEN_ERROR',
          message: error.message ?? 'Failed to join screen',
        });
      }
    });

    socket.on('nuc:join', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsedLegacy = nucJoinSchema.safeParse(data);
      const parsedNew = nucJoinSessionSchema.safeParse(data);

      if (parsedLegacy.success) {
        try {
          const auth = await authenticateNuc(parsedLegacy.data.nucUid, parsedLegacy.data.authKey);
          if (!auth) {
            socket.emit('error', { code: 'NUC_AUTH_FAILED', message: 'NUC authentication failed' });
            return;
          }

          const sessionId = BigInt(parsedLegacy.data.sessionId);
          const socketData: SocketNucData = {
            type: 'nuc',
            nucId: auth.nucId,
            screenId: auth.screenId,
            sessionId,
          };
          socket.data = socketData;

          await socket.join(`session:${sessionId}`);
          await socket.join(`session:${sessionId}:nuc`);

          const response = { nucId: auth.nucId.toString(), sessionId: sessionId.toString() };
          if (typeof callback === 'function') callback(response);
          else socket.emit('nuc:join_success', response);

          logger.info(
            { nucId: auth.nucId.toString(), sessionId: sessionId.toString() },
            'NUC joined session (legacy)',
          );
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          socket.emit('error', {
            code: error.code ?? 'NUC_JOIN_ERROR',
            message: error.message ?? 'Failed to join',
          });
        }
        return;
      }

      if (parsedNew.success) {
        try {
          const nucData = socket.data as
            | { type?: string; nucId?: bigint; screenId?: bigint }
            | undefined;
          if (!nucData || nucData.type !== 'nuc' || !nucData.nucId) {
            socket.emit('error', {
              code: 'NUC_NOT_ON_SCREEN',
              message: 'Call nuc:join_screen first',
            });
            return;
          }

          const sessionId = BigInt(parsedNew.data.sessionId);
          (socket.data as SocketNucData).sessionId = sessionId;

          await socket.join(`session:${sessionId}`);
          await socket.join(`session:${sessionId}:nuc`);

          const response = { nucId: nucData.nucId.toString(), sessionId: sessionId.toString() };
          if (typeof callback === 'function') callback(response);
          else socket.emit('nuc:join_success', response);

          logger.info(
            { nucId: nucData.nucId.toString(), sessionId: sessionId.toString() },
            'NUC joined session',
          );
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          socket.emit('error', {
            code: error.code ?? 'NUC_JOIN_ERROR',
            message: error.message ?? 'Failed to join',
          });
        }
        return;
      }

      socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid NUC join payload' });
    });

    socket.on('nuc:resume', async (data: unknown) => {
      const parsed = nucResumePayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid nuc resume payload' });
        return;
      }

      try {
        const cookieToken = parseNucCookie(socket);
        if (!cookieToken) {
          socket.emit('error', {
            code: 'NUC_AUTH_REQUIRED',
            message: 'NUC session cookie required',
          });
          return;
        }

        const jwt = await verifyNucJwt(cookieToken);
        const nuc = await prisma.nuc.findUnique({ where: { nucUid: parsed.data.nucUid } });
        if (!nuc || nuc.id.toString() !== jwt.nucId) {
          socket.emit('error', {
            code: 'NUC_AUTH_FAILED',
            message: 'NUC UID does not match session',
          });
          return;
        }

        const screenId = nuc.screenId;

        let resolvedSessionId: bigint | null = null;
        if (parsed.data.sessionId) {
          const sid = BigInt(parsed.data.sessionId);
          const s = await prisma.session.findUnique({
            where: { id: sid },
            select: { screenId: true, state: true },
          });
          if (!s || s.screenId !== screenId || !['lobby', 'running', 'paused'].includes(s.state)) {
            socket.emit('error', {
              code: 'SESSION_INVALID',
              message: 'Session is not active on this screen',
            });
            return;
          }
          resolvedSessionId = sid;
        } else {
          const active = await prisma.session.findFirst({
            where: { screenId, state: { in: ['lobby', 'running', 'paused'] } },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          resolvedSessionId = active?.id ?? null;
        }

        socket.data = {
          type: 'nuc',
          nucId: nuc.id,
          screenId,
          ...(resolvedSessionId != null ? { sessionId: resolvedSessionId } : {}),
        };

        await socket.join(`screen:${screenId}`);
        await socket.join(`nuc:${nuc.id.toString()}`);
        if (resolvedSessionId != null) {
          await socket.join(`session:${resolvedSessionId}`);
          await socket.join(`session:${resolvedSessionId}:nuc`);
        }

        const snapshot = await buildNucStateSnapshot({
          nucId: nuc.id,
          screenId,
          sessionId: resolvedSessionId,
        });
        socket.emit('session:state_snapshot', snapshot);

        logger.info(
          { nucId: nuc.id.toString(), sessionId: resolvedSessionId?.toString() ?? null },
          'NUC resumed',
        );
      } catch (err: unknown) {
        if (err instanceof AppError) {
          socket.emit('error', { code: err.code, message: err.message });
          return;
        }
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'NUC_RESUME_ERROR',
          message: error.message ?? 'Failed to resume NUC',
        });
      }
    });

    socket.on('disconnect', () => {
      const nucData = socket.data as SocketNucData | undefined;
      if (nucData?.type === 'nuc') {
        logger.info({ nucId: nucData.nucId.toString(), socketId: socket.id }, 'NUC disconnected');
      }
    });
  });
}
