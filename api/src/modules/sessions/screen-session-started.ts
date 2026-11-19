import type { Server } from 'socket.io';
import { prisma } from '../../shared/db/index.js';

/**
 * Prévient l'écran (`/player`, rooms `screen:` et `nuc:` de la salle) qu'une séance vient d'être
 * créée sur sa salle. Seul point d'émission de `screen:session_started` après une création de
 * séance (POST /api/sessions, lancement d'un programme C2). Porte `joinToken` (convention 4).
 */
export async function notifyScreenSessionStarted(
  io: Server | undefined,
  session: { id: bigint; slugShort: string; joinToken: string | null; screenId: bigint },
): Promise<void> {
  if (!io) return;
  const payload = {
    sessionId: session.id.toString(),
    slugShort: session.slugShort,
    joinToken: session.joinToken,
  };
  const playerNsp = io.of('/player');
  playerNsp.to(`screen:${session.screenId}`).emit('screen:session_started', payload);
  const nucs = await prisma.nuc.findMany({
    where: { screenId: session.screenId },
    select: { id: true },
  });
  for (const nuc of nucs) {
    playerNsp.to(`nuc:${nuc.id}`).emit('screen:session_started', payload);
  }
}
