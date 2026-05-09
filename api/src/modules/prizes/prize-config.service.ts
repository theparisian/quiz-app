import { prisma } from '../../shared/db/index.js';
import { prizesConfigSchema, type PrizeConfigEntry } from './prizes.schemas.js';

const RANK_KEYS = ['rank1', 'rank2', 'rank3'] as const;

function rankToKey(rank: number): (typeof RANK_KEYS)[number] | null {
  if (rank === 1) return 'rank1';
  if (rank === 2) return 'rank2';
  if (rank === 3) return 'rank3';
  return null;
}

export async function resolvePrizeConfig(
  sessionId: bigint,
  rank: number,
): Promise<PrizeConfigEntry | null> {
  const key = rankToKey(rank);
  if (!key) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      screen: { include: { cinema: true } },
      quiz: { include: { sponsor: true } },
    },
  });
  if (!session) return null;

  const sponsor = session.quiz.sponsor;
  if (sponsor?.prizesConfig != null) {
    const parsed = prizesConfigSchema.safeParse(sponsor.prizesConfig);
    if (parsed.success) {
      const entry = parsed.data[key];
      if (entry) return entry;
    }
  }

  const cinema = session.screen.cinema;
  if (cinema.prizesConfig != null) {
    const parsed = prizesConfigSchema.safeParse(cinema.prizesConfig);
    if (parsed.success) {
      const entry = parsed.data[key];
      if (entry) return entry;
    }
  }

  return null;
}
