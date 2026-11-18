import { prisma } from '../db/index.js';
import { AppError } from '../errors/app-error.js';

/**
 * Cloisonnement entre cinémas : point d'entrée unique pour vérifier qu'un utilisateur
 * (route REST ou socket) peut agir sur un cinéma, une salle ou une session.
 * super_admin passe toujours ; les autres rôles doivent appartenir au cinéma visé.
 */
export interface TenantScopeUser {
  role: string;
  cinemaId: bigint | null;
}

function forbidden(): AppError {
  return new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

export async function assertCanAccessCinema(
  user: TenantScopeUser,
  cinemaId: bigint,
): Promise<void> {
  if (user.role === 'super_admin') return;
  if (user.cinemaId === null || user.cinemaId !== cinemaId) {
    throw forbidden();
  }
}

export async function assertCanAccessScreen(
  user: TenantScopeUser,
  screenId: bigint,
): Promise<void> {
  const screen = await prisma.screen.findUnique({
    where: { id: screenId },
    select: { cinemaId: true },
  });
  if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');
  await assertCanAccessCinema(user, screen.cinemaId);
}

export async function assertCanAccessSession(
  user: TenantScopeUser,
  sessionId: bigint,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { screen: { select: { cinemaId: true } } },
  });
  if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  await assertCanAccessCinema(user, session.screen.cinemaId);
}
