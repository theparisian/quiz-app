import type { Server } from 'socket.io';

const SESSION_NAMESPACES = ['/player', '/console', '/mobile'] as const;

/** Diffuse player:joined aux 3 namespaces de la room d'une session. */
export function broadcastPlayerJoined(
  io: Server,
  sessionId: bigint | string,
  player: { playerId: string; pseudo: string; avatarUrl?: string | null; joinedAt?: string },
): void {
  const room = `session:${sessionId}`;
  const payload = {
    playerId: player.playerId,
    pseudo: player.pseudo,
    avatarUrl: player.avatarUrl ?? null,
    joinedAt: player.joinedAt ?? new Date().toISOString(),
  };
  for (const ns of SESSION_NAMESPACES) {
    io.of(ns).to(room).emit('player:joined', payload);
  }
}

/** Diffuse player:left aux 3 namespaces de la room d'une session. */
export function broadcastPlayerLeft(
  io: Server,
  sessionId: bigint | string,
  playerId: string,
): void {
  const room = `session:${sessionId}`;
  const payload = { playerId };
  for (const ns of SESSION_NAMESPACES) {
    io.of(ns).to(room).emit('player:left', payload);
  }
}
