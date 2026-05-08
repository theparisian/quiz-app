import { Server } from 'socket.io';
import { pingSchema } from '@quiz-app/validation';
import { logger } from '../logger/index.js';

type NamespacePath = '/player' | '/mobile' | '/console' | '/admin';

export function setupNamespace(io: Server, path: NamespacePath): void {
  const nsp = io.of(path);

  nsp.on('connection', (socket) => {
    logger.info({ namespace: path, socketId: socket.id }, 'Client connected');

    socket.on('ping', (data: unknown) => {
      const parsed = pingSchema.safeParse(data);
      if (!parsed.success) {
        logger.warn({ namespace: path, socketId: socket.id }, 'Invalid ping payload');
        return;
      }

      socket.emit('pong', {
        timestamp: parsed.data.timestamp,
        serverTime: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info({ namespace: path, socketId: socket.id, reason }, 'Client disconnected');
    });
  });
}
