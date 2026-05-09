import type { Server } from 'socket.io';
import type { NucStatus } from '@prisma/client';

const NAMESPACES = ['/console', '/player', '/mobile', '/admin'] as const;

export type NucStatusBroadcastPayload = {
  nucId: string;
  screenId: string;
  status: NucStatus;
  reason?: string;
};

export function broadcastNucStatusChanged(io: Server, payload: NucStatusBroadcastPayload): void {
  const room = `screen:${payload.screenId}`;
  const body = {
    nucId: payload.nucId,
    screenId: payload.screenId,
    status: payload.status,
    ...(payload.reason ? { reason: payload.reason } : {}),
  };
  for (const path of NAMESPACES) {
    io.of(path).to(room).emit('nuc:status_changed', body);
  }
  io.of('/player').to(`nuc:${payload.nucId}`).emit('nuc:status_changed', body);
}
