import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getAdminSocket(): Socket {
  if (!socket) {
    socket = io(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/admin`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectAdminSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
