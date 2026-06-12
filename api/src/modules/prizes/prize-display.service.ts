import { prisma } from '../../shared/db/index.js';
import { resolvePrizeConfig } from './prize-config.service.js';

export type SessionPrizesDisplay = {
  rank1?: { label: string; isSuperPrize?: boolean };
  rank2?: { label: string };
  rank3?: { label: string };
  all?: { label: string };
};

export async function resolvePrizeDisplay(sessionId: bigint): Promise<SessionPrizesDisplay> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { superPrizeTemplateId: true },
  });

  const result: SessionPrizesDisplay = {};

  for (const rank of [1, 2, 3] as const) {
    const cfg = await resolvePrizeConfig(sessionId, rank);
    if (!cfg) continue;

    if (rank === 1) {
      const isSuperPrize =
        session?.superPrizeTemplateId != null &&
        cfg.templateId === session.superPrizeTemplateId.toString();
      result.rank1 = { label: cfg.label, ...(isSuperPrize ? { isSuperPrize: true } : {}) };
    } else if (rank === 2) {
      result.rank2 = { label: cfg.label };
    } else {
      result.rank3 = { label: cfg.label };
    }
  }

  const allCfg = await resolvePrizeConfig(sessionId, 'all');
  if (allCfg) result.all = { label: allCfg.label };

  return result;
}

export async function resolvePrizesPayload(
  sessionId: bigint,
): Promise<SessionPrizesDisplay | undefined> {
  const prizes = await resolvePrizeDisplay(sessionId);
  if (!prizes.rank1 && !prizes.rank2 && !prizes.rank3 && !prizes.all) return undefined;
  return prizes;
}
