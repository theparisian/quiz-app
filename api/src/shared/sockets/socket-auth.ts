import type { Socket } from 'socket.io';
import bcrypt from 'bcrypt';
import { verifyJwt } from '../auth/jwt.js';
import { prisma } from '../db/index.js';
import { logger } from '../logger/index.js';

export interface SocketPlayerData {
  type: 'player';
  playerId: bigint;
  sessionId: bigint;
  pseudo: string;
}

export interface SocketNucData {
  type: 'nuc';
  nucId: bigint;
  screenId: bigint;
  sessionId?: bigint;
}

export interface SocketConsoleData {
  type: 'console';
  userId: bigint;
  sessionId: bigint;
  role: string;
}

export type SocketData = SocketPlayerData | SocketNucData | SocketConsoleData;

export async function authenticateNuc(
  nucUid: string,
  authKey: string,
): Promise<{ nucId: bigint; screenId: bigint } | null> {
  const nuc = await prisma.nuc.findUnique({ where: { nucUid } });
  if (!nuc || !nuc.authKeyHash) return null;

  const valid = await bcrypt.compare(authKey, nuc.authKeyHash);
  if (!valid) return null;

  return { nucId: nuc.id, screenId: nuc.screenId };
}

export async function authenticateJwtFromCookie(
  socket: Socket,
): Promise<{ userId: bigint; role: string; cinemaId: bigint | null } | null> {
  try {
    const cookies = socket.handshake.headers.cookie;
    if (!cookies) return null;

    const tokenMatch = cookies.match(/(?:^|;\s*)token=([^;]+)/);
    if (!tokenMatch?.[1]) return null;

    const payload = await verifyJwt(tokenMatch[1]);
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.userId) },
    });
    if (!user || user.deletedAt) return null;

    return { userId: user.id, role: user.role, cinemaId: user.cinemaId };
  } catch {
    logger.warn({ socketId: socket.id }, 'Socket JWT auth failed');
    return null;
  }
}
