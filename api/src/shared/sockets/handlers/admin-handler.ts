import type { Server, Socket } from 'socket.io';
import { adminWatchCinemaPayloadSchema } from '@quiz-app/validation';
import { logger } from '../../logger/index.js';
import { prisma } from '../../db/index.js';
import { authenticateJwtFromCookie } from '../socket-auth.js';

const ADMIN_ROLES = new Set(['super_admin', 'cinema_admin']);

export function setupAdminHandlers(io: Server): void {
  const nsp = io.of('/admin');

  nsp.on('connection', (socket: Socket) => {
    socket.on('admin:watch_cinema', async (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = adminWatchCinemaPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid admin watch cinema payload',
        });
        return;
      }

      try {
        const auth = await authenticateJwtFromCookie(socket);
        if (!auth || !ADMIN_ROLES.has(auth.role)) {
          socket.emit('error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
          return;
        }

        const cinema = await prisma.cinema.findUnique({
          where: { slug: parsed.data.cinemaSlug },
          select: { id: true, screens: { select: { id: true } } },
        });
        if (!cinema) {
          socket.emit('error', { code: 'CINEMA_NOT_FOUND', message: 'Cinema not found' });
          return;
        }

        if (auth.role === 'cinema_admin' && auth.cinemaId !== cinema.id) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not allowed for this cinema' });
          return;
        }

        for (const screen of cinema.screens) {
          await socket.join(`screen:${screen.id}`);
        }

        socket.data = {
          type: 'admin',
          userId: auth.userId,
          role: auth.role,
          cinemaId: cinema.id,
        };

        const response = {
          cinemaSlug: parsed.data.cinemaSlug,
          screenIds: cinema.screens.map((s) => s.id.toString()),
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('admin:watch_cinema_success', response);
        }

        logger.info(
          {
            userId: auth.userId.toString(),
            cinemaSlug: parsed.data.cinemaSlug,
            screenCount: cinema.screens.length,
            socketId: socket.id,
          },
          'Admin watching cinema NUC status',
        );
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        socket.emit('error', {
          code: error.code ?? 'ADMIN_WATCH_ERROR',
          message: error.message ?? 'Failed to watch cinema',
        });
      }
    });
  });
}
