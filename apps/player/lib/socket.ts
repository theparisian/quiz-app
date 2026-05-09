import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getPlayerSocket(): Socket {
  if (!socket) {
    socket = io(`${API_URL}/player`, {
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
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
