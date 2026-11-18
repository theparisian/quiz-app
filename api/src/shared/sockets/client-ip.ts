import type { Socket } from 'socket.io';

/**
 * IP client d'une socket. Derrière le reverse proxy, handshake.address est l'IP
 * du proxy : on prend la première valeur de x-forwarded-for, sinon handshake.address.
 */
export function socketClientIp(socket: Socket): string {
  const header = socket.handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  const first = raw?.split(',')[0]?.trim();
  if (first) return first;
  return socket.handshake.address || 'unknown';
}
