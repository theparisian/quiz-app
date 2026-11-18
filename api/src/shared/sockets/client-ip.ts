import type { Socket } from 'socket.io';

/**
 * IP client d'une socket. Derrière le reverse proxy, handshake.address est l'IP
 * du proxy. Le proxy (un seul saut, comme `trust proxy` 1 côté Express) ajoute l'IP réelle
 * en DERNIÈRE position de x-forwarded-for ; les valeurs précédentes viennent du client et
 * peuvent être forgées. On prend donc la dernière valeur, sinon handshake.address.
 */
export function socketClientIp(socket: Socket): string {
  const header = socket.handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  const last = raw?.split(',').pop()?.trim();
  if (last) return last;
  return socket.handshake.address || 'unknown';
}
