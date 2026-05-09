import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { logger } from '../logger/index.js';
import { setupNamespace } from './namespace-handler.js';
import { setupPlayerHandlers } from './handlers/player-handler.js';
import { setupMobileHandlers } from './handlers/mobile-handler.js';
import { setupConsoleHandlers } from './handlers/console-handler.js';

export function setupSocketGateway(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const namespaces = ['/player', '/mobile', '/console', '/admin'] as const;

  for (const ns of namespaces) {
    setupNamespace(io, ns);
    logger.info({ namespace: ns }, 'Socket.io namespace registered');
  }

  setupPlayerHandlers(io);
  setupMobileHandlers(io);
  setupConsoleHandlers(io);

  logger.info('Session socket handlers registered on /player, /mobile, /console');

  return io;
}
