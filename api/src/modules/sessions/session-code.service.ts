import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Le code à 4 chiffres (`slug_short`) n'est unique que parmi les séances actives :
 * une séance terminée ou abandonnée peut partager son code avec une nouvelle séance.
 */
export const ACTIVE_SESSION_STATES = ['lobby', 'running', 'paused'] as const;
const MAX_ATTEMPTS = 50;

export async function generateUniqueSessionCode(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await prisma.session.findFirst({
      where: {
        slugShort: code,
        state: { in: [...ACTIVE_SESSION_STATES] },
      },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new AppError('Unable to generate a unique session code', 503, 'NO_AVAILABLE_CODE');
}

/**
 * Séance désignée par un code : la séance active portant ce code (la plus récente si,
 * par accident, plusieurs), sinon la plus récemment créée avec ce code (écran final
 * d'une séance terminée). Null si aucune séance n'a jamais porté ce code.
 */
export async function findSessionIdByCode(code: string): Promise<bigint | null> {
  const active = await prisma.session.findFirst({
    where: { slugShort: code, state: { in: [...ACTIVE_SESSION_STATES] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (active) return active.id;
  const latest = await prisma.session.findFirst({
    where: { slugShort: code },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return latest?.id ?? null;
}

/**
 * Concurrence : deux créations simultanées peuvent tirer le même code libre. Après
 * l'insertion, si une séance active créée AVANT celle-ci (id plus petit) porte le même code,
 * cette séance-ci prend un nouveau code ; la plus ancienne garde le sien. Renvoie le code final.
 */
export async function ensureActiveSessionCodeIsUnique(
  sessionId: bigint,
  code: string,
): Promise<string> {
  let current = code;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const conflict = await prisma.session.findFirst({
      where: {
        slugShort: current,
        state: { in: [...ACTIVE_SESSION_STATES] },
        id: { lt: sessionId },
      },
      select: { id: true },
    });
    if (!conflict) return current;
    current = await generateUniqueSessionCode();
    await prisma.session.update({ where: { id: sessionId }, data: { slugShort: current } });
  }
  throw new AppError('Unable to generate a unique session code', 503, 'NO_AVAILABLE_CODE');
}
