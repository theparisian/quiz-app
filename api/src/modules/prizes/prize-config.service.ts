import { prisma } from '../../shared/db/index.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import {
  prizesConfigSchema,
  quizPrizesConfigSchema,
  type PrizeConfigEntry,
  type QuizPrizesConfig,
} from '@quiz-app/validation';

const RANK_KEYS = ['rank1', 'rank2', 'rank3'] as const;
export type PrizeConfigKey = (typeof RANK_KEYS)[number] | 'all';

export type ResolvedPrizeConfig = PrizeConfigEntry & {
  templateId?: string;
};

export type ResolvePrizeOptions = {
  excludeTemplateIds?: bigint[];
  sessionId?: bigint;
  cinemaId?: bigint;
};

export type EligiblePrize = {
  config: ResolvedPrizeConfig;
  isConsolation: boolean;
};

function targetToKey(target: number | 'all'): PrizeConfigKey | null {
  if (target === 'all') return 'all';
  if (target === 1) return 'rank1';
  if (target === 2) return 'rank2';
  if (target === 3) return 'rank3';
  return null;
}

function templateToEntry(template: {
  id: bigint;
  label: string;
  type: PrizeConfigEntry['type'];
  payloadJson: unknown;
  isActive: boolean;
  stock: number | null;
}): ResolvedPrizeConfig | null {
  if (!template.isActive) return null;
  if (template.stock !== null && template.stock <= 0) return null;
  const payload = (template.payloadJson ?? {}) as { value?: string };
  return {
    type: template.type,
    label: template.label,
    value: payload.value,
    templateId: template.id.toString(),
  };
}

async function logTemplateExhaustedOnce(sessionId: bigint, cinemaId: bigint, templateId: bigint) {
  const events = await prisma.eventLog.findMany({
    where: { sessionId, eventType: 'prize_template_exhausted' },
    select: { payloadJson: true },
  });
  const tid = templateId.toString();
  if (events.some((e) => (e.payloadJson as { templateId?: string } | null)?.templateId === tid)) {
    return;
  }
  logEvent({
    level: 'info',
    eventType: 'prize_template_exhausted',
    sessionId,
    cinemaId,
    payload: { templateId: tid },
  });
}

async function loadTemplate(
  templateId: bigint,
  opts: ResolvePrizeOptions,
): Promise<ResolvedPrizeConfig | null> {
  if (opts.excludeTemplateIds?.some((id) => id === templateId)) return null;

  const template = await prisma.prizeTemplate.findUnique({ where: { id: templateId } });
  if (!template) return null;

  const entry = templateToEntry(template);
  if (!entry && opts.sessionId && opts.cinemaId) {
    await logTemplateExhaustedOnce(opts.sessionId, opts.cinemaId, templateId);
  }
  return entry;
}

async function resolveFromLegacyConfig(
  raw: unknown,
  key: PrizeConfigKey,
): Promise<ResolvedPrizeConfig | null> {
  const parsed = prizesConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) return null;
  const entry = parsed.data[key];
  return entry ?? null;
}

async function resolveFromQuizConfig(
  raw: unknown,
  key: PrizeConfigKey,
  opts: ResolvePrizeOptions,
): Promise<ResolvedPrizeConfig | 'none' | 'inherit'> {
  const parsed = quizPrizesConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) return 'inherit';
  const assignment = parsed.data[key];
  if (!assignment) return 'inherit';
  if (assignment.mode === 'none') return 'none';
  if (assignment.mode === 'inherit') return 'inherit';
  const templateId = BigInt(assignment.templateId);
  const entry = await loadTemplate(templateId, opts);
  return entry ?? 'inherit';
}

export async function resolvePrizeConfig(
  sessionId: bigint,
  target: number | 'all',
  options: ResolvePrizeOptions = {},
): Promise<ResolvedPrizeConfig | null> {
  const key = targetToKey(target);
  if (!key) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      screen: { include: { cinema: true } },
      quiz: { include: { sponsor: true } },
    },
  });
  if (!session) return null;

  const cinemaId = session.screen.cinemaId;
  const opts: ResolvePrizeOptions = {
    ...options,
    sessionId,
    cinemaId,
  };

  if (key === 'rank1' && session.superPrizeTemplateId) {
    const superEntry = await loadTemplate(session.superPrizeTemplateId, opts);
    if (superEntry) return superEntry;
  }

  const quizResult = await resolveFromQuizConfig(session.quiz.prizesConfig, key, opts);
  if (quizResult === 'none') return null;
  if (quizResult !== 'inherit') return quizResult;

  const sponsor = session.quiz.sponsor;
  if (sponsor?.prizesConfig != null) {
    const entry = await resolveFromLegacyConfig(sponsor.prizesConfig, key);
    if (entry) return entry;
  }

  const cinema = session.screen.cinema;
  if (cinema.prizesConfig != null) {
    const entry = await resolveFromLegacyConfig(cinema.prizesConfig, key);
    if (entry) return entry;
  }

  return null;
}

export async function resolveEligiblePrizeForPlayer(
  sessionId: bigint,
  rankFinal: number | null,
  options: ResolvePrizeOptions = {},
): Promise<EligiblePrize | null> {
  if (rankFinal != null && rankFinal >= 1 && rankFinal <= 3) {
    const rankConfig = await resolvePrizeConfig(sessionId, rankFinal, options);
    if (rankConfig) return { config: rankConfig, isConsolation: false };
  }

  const allConfig = await resolvePrizeConfig(sessionId, 'all', options);
  if (allConfig) return { config: allConfig, isConsolation: true };

  return null;
}

export async function previewInheritedPrize(
  quizSlug: string,
  target: number | 'all',
): Promise<ResolvedPrizeConfig | null> {
  const key = targetToKey(target);
  if (!key) return null;

  const quiz = await prisma.quiz.findUnique({
    where: { slug: quizSlug },
    include: {
      sponsor: true,
      sessions: {
        take: 1,
        orderBy: { id: 'desc' },
        include: { screen: { include: { cinema: true } } },
      },
    },
  });
  if (!quiz) return null;

  const cinema =
    quiz.sessions[0]?.screen.cinema ??
    (await prisma.cinema.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' } }));
  if (!cinema) return null;

  if (quiz.sponsor?.prizesConfig != null) {
    const entry = await resolveFromLegacyConfig(quiz.sponsor.prizesConfig, key);
    if (entry) return entry;
  }

  if (cinema.prizesConfig != null) {
    const entry = await resolveFromLegacyConfig(cinema.prizesConfig, key);
    if (entry) return entry;
  }

  return null;
}

export function parseQuizPrizesConfig(raw: unknown): QuizPrizesConfig {
  const parsed = quizPrizesConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}
