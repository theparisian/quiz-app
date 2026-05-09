import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';

const ACTIVE_STATES = ['lobby', 'running', 'paused'] as const;
const MAX_ATTEMPTS = 50;

export async function generateUniqueSessionCode(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await prisma.session.findFirst({
      where: {
        slugShort: code,
        state: { in: [...ACTIVE_STATES] },
      },
    });
    if (!existing) return code;
  }
  throw new AppError('Unable to generate a unique session code', 503, 'NO_AVAILABLE_CODE');
}
