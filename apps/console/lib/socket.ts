import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getConsoleSocket(): Socket {
  if (!socket) {
    socket = io(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/console`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectConsoleSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
