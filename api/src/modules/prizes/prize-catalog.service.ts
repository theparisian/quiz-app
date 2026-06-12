import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import type { AuthUser } from '../../shared/auth/middleware.js';
import {
  superPrizeConfigSchema,
  quizPrizesConfigSchema,
  type SuperPrizeConfig,
  type QuizPrizesConfig,
} from '@quiz-app/validation';
import { drawSuperPrizeWin, type Rng } from './super-prize-draw.service.js';
import { parseQuizPrizesConfig, previewInheritedPrize } from './prize-config.service.js';

async function assertCinemaStaffCanAccessSlug(user: AuthUser, cinemaSlug: string) {
  const cinema = await prisma.cinema.findFirst({
    where: { slug: cinemaSlug, deletedAt: null },
  });
  if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  if (user.role === 'super_admin') return cinema;
  if (user.role === 'cinema_admin') {
    if (!user.cinemaId || user.cinemaId !== cinema.id) {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
    return cinema;
  }
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

function parseSuperPrizeConfig(raw: unknown): SuperPrizeConfig | null {
  const parsed = superPrizeConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function drawSuperPrizeForSession(
  sessionId: bigint,
  cinemaId: bigint,
  rng: Rng = Math.random,
): Promise<bigint | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { superPrizeTemplateId: true },
  });
  if (!session || session.superPrizeTemplateId) return session?.superPrizeTemplateId ?? null;

  const cinema = await prisma.cinema.findUnique({ where: { id: cinemaId } });
  if (!cinema) return null;

  const config = parseSuperPrizeConfig(cinema.superPrizeConfig);
  if (!config?.enabled) return null;

  const templateId = BigInt(config.templateId);
  const template = await prisma.prizeTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.isActive || template.cinemaId !== cinemaId) return null;
  if (template.stock !== null && template.stock <= 0) return null;

  if (!drawSuperPrizeWin(config.oddsOneIn, rng)) return null;

  await prisma.session.update({
    where: { id: sessionId },
    data: { superPrizeTemplateId: templateId },
  });

  logEvent({
    level: 'info',
    eventType: 'super_prize_drawn',
    sessionId,
    cinemaId,
    payload: { templateId: templateId.toString(), oddsOneIn: config.oddsOneIn },
  });

  return templateId;
}

export const quizPrizesConfigService = {
  async get(quizSlug: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { slug: quizSlug },
      include: { sponsor: true },
    });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');

    const config = parseQuizPrizesConfig(quiz.prizesConfig);
    const inheritedPreview: Record<string, ResolvedPrizePreview | null> = {};

    for (const rank of [1, 2, 3] as const) {
      const key = `rank${rank}` as 'rank1' | 'rank2' | 'rank3';
      const assignment = config[key];
      if (!assignment || assignment.mode === 'inherit') {
        const raw = await previewInheritedPrize(quizSlug, rank);
        inheritedPreview[key] = raw
          ? {
              type: raw.type,
              label: raw.label,
              ...(raw.value !== undefined ? { value: raw.value } : {}),
            }
          : null;
      } else {
        inheritedPreview[key] = null;
      }
    }

    const allAssignment = config.all;
    if (!allAssignment || allAssignment.mode === 'inherit') {
      const rawAll = await previewInheritedPrize(quizSlug, 'all');
      inheritedPreview.all = rawAll
        ? {
            type: rawAll.type,
            label: rawAll.label,
            ...(rawAll.value !== undefined ? { value: rawAll.value } : {}),
          }
        : null;
    } else {
      inheritedPreview.all = null;
    }

    return { config, inheritedPreview };
  },

  async update(quizSlug: string, data: QuizPrizesConfig) {
    const quiz = await prisma.quiz.findUnique({ where: { slug: quizSlug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');

    const parsed = quizPrizesConfigSchema.parse(data);
    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { prizesConfig: parsed as object },
    });
    return this.get(quizSlug);
  },
};

type ResolvedPrizePreview = {
  type: string;
  label: string;
  value?: string;
};

export const superPrizeConfigService = {
  async get(cinemaSlug: string, user: AuthUser) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    const config = parseSuperPrizeConfig(cinema.superPrizeConfig);
    return { config };
  },

  async update(cinemaSlug: string, user: AuthUser, config: SuperPrizeConfig | null) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    if (config) {
      superPrizeConfigSchema.parse(config);
      const templateId = BigInt(config.templateId);
      const template = await prisma.prizeTemplate.findUnique({ where: { id: templateId } });
      if (!template || template.cinemaId !== cinema.id) {
        throw new AppError('Template not found for this cinema', 400, 'INVALID_TEMPLATE');
      }
    }
    await prisma.cinema.update({
      where: { id: cinema.id },
      data: {
        superPrizeConfig: config === null ? Prisma.JsonNull : (config as Prisma.InputJsonValue),
      },
    });
    return { config };
  },
};
