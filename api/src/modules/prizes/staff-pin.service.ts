import bcrypt from 'bcrypt';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';

const SALT_ROUNDS = 10;

export async function hashStaffPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyStaffPinForCinema(cinemaId: bigint, pin: string): Promise<void> {
  const cinema = await prisma.cinema.findUnique({
    where: { id: cinemaId },
    select: { staffPinHash: true },
  });
  if (!cinema?.staffPinHash) {
    throw new AppError(
      "Le PIN comptoir n'est pas encore configuré pour ce cinéma. Configurez-le dans l'admin.",
      403,
      'PIN_NOT_CONFIGURED',
    );
  }
  const valid = await bcrypt.compare(pin, cinema.staffPinHash);
  if (!valid) {
    throw new AppError('Code PIN incorrect.', 401, 'INVALID_PIN');
  }
}

export async function isStaffPinConfigured(cinemaId: bigint): Promise<boolean> {
  const cinema = await prisma.cinema.findUnique({
    where: { id: cinemaId },
    select: { staffPinHash: true },
  });
  return !!cinema?.staffPinHash;
}
