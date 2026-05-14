import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getPlayerSocket(): Socket {
  if (!socket) {
    socket = io(`${API_URL}/player`, {
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // PROJECT_REFERENCE §2.2 — backoff exponentiel maîtrisé côté NUC / player
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 45000,
      randomizationFactor: 0.5,
    });
  }
  return socket;
}

export function disconnectPlayerSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
