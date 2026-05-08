import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import {
  getAiClient,
  AiTimeoutError,
  AiRefusalError,
  AiInvalidOutputError,
  AiError,
  type GenerateQuizInput,
} from '../../shared/ai/index.js';
import { generatedQuizPayloadSchema } from '../../shared/ai/generated-quiz.zod.js';
import { buildSystemPrompt } from './ai.prompt.js';
import { checkRateLimit, recordSuccessfulGeneration } from './ai.rate-limit.js';
import type { GenerateQuizRouteInput, ListGenerationsQuery } from './ai.schemas.js';

function defaultMaxTokens(): number {
  const raw = process.env.AI_MAX_TOKENS;
  if (raw !== undefined && raw.length > 0) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 256) return n;
  }
  return 4096;
}

type QuizPayload = z.infer<typeof generatedQuizPayloadSchema>;

function sanitizeImageUrls(quiz: QuizPayload, allowedUrls: string[]): QuizPayload {
  const allowed = new Set(allowedUrls);
  return {
    questions: quiz.questions.map((q) => {
      const url = q.imageUrl ?? null;
      if (url && !allowed.has(url)) {
        logger.warn({ imageUrl: url }, 'AI returned image URL not in input list; clearing');
        return { ...q, imageUrl: null };
      }
      return q;
    }),
  };
}

async function aggregatePeriod(where: Prisma.AiGenerationWhereInput): Promise<{
  generations: number;
  tokensInput: number;
  tokensOutput: number;
  costEur: number;
}> {
  const [successCount, sums] = await Promise.all([
    prisma.aiGeneration.count({ where: { ...where, status: 'success' } }),
    prisma.aiGeneration.aggregate({
      where: { ...where, status: 'success' },
      _sum: { tokensInput: true, tokensOutput: true, costEstimateEur: true },
    }),
  ]);
  const cost = sums._sum.costEstimateEur;
  const costNum =
    cost === null || cost === undefined ? 0 : typeof cost === 'number' ? cost : Number(cost);
  return {
    generations: successCount,
    tokensInput: sums._sum.tokensInput ?? 0,
    tokensOutput: sums._sum.tokensOutput ?? 0,
    costEur: Math.round(costNum * 1_000_000) / 1_000_000,
  };
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function sevenDaysAgo(d: Date): Date {
  return new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export const aiService = {
  async generateQuiz(userId: bigint, input: GenerateQuizRouteInput) {
    const rate = checkRateLimit(userId);
    if (!rate.allowed) {
      logger.warn({ userId: userId.toString(), resetAt: rate.resetAt }, 'AI rate limit hit');
      const resetAtIso = rate.resetAt?.toISOString() ?? null;
      const mins =
        rate.resetAt !== null
          ? Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 60_000))
          : 60;
      throw new AppError(
        `Vous avez atteint la limite de générations IA. Réessayez dans environ ${String(mins)} minute(s).`,
        429,
        'AI_RATE_LIMITED',
        true,
        { resetAt: resetAtIso },
      );
    }

    const genRow = await prisma.aiGeneration.create({
      data: {
        userId,
        status: 'partial',
        inputSummary: input.sourceText.slice(0, 500),
        inputFull: input.sourceText,
        modelUsed: input.model,
      },
    });
    const generationId = genRow.id;

    const started = Date.now();
    logger.info(
      {
        userId: userId.toString(),
        model: input.model,
        numQuestions: input.numQuestions,
        sourceTextLength: input.sourceText.length,
        imageCount: input.imageUrls.length,
        generationId: generationId.toString(),
      },
      'AI generation started',
    );

    const systemPrompt = buildSystemPrompt({
      language: input.language,
      tone: input.tone,
      difficulty: input.difficulty,
      includeExplanations: input.includeExplanations,
      type: input.type,
      hasImages: input.imageUrls.length > 0,
      numQuestions: input.numQuestions,
    });

    const clientInput: GenerateQuizInput = {
      systemPrompt,
      sourceText: input.sourceText,
      imageUrls: input.imageUrls,
      parameters: {
        numQuestions: input.numQuestions,
        difficulty: input.difficulty,
        tone: input.tone,
        language: input.language,
        contextHint: input.contextHint ?? null,
        includeExplanations: input.includeExplanations,
      },
      model: input.model,
      maxTokens: defaultMaxTokens(),
    };

    try {
      const result = await getAiClient().generateQuiz(clientInput);
      const parsed = generatedQuizPayloadSchema.safeParse(result.quiz);
      if (!parsed.success) {
        throw new AiInvalidOutputError('Post-client Zod validation failed', parsed.error.flatten());
      }
      let payload = parsed.data;
      payload = sanitizeImageUrls(payload, input.imageUrls);

      const costDec = new Prisma.Decimal(result.usage.estimatedCostEur.toFixed(6));

      await prisma.aiGeneration.update({
        where: { id: generationId },
        data: {
          status: 'success',
          tokensInput: result.usage.inputTokens,
          tokensOutput: result.usage.outputTokens,
          costEstimateEur: costDec,
          outputJson: payload as unknown as Prisma.InputJsonValue,
          errorDetails: Prisma.DbNull,
          errorMessage: null,
        },
      });

      recordSuccessfulGeneration(userId);

      const durationMs = Date.now() - started;
      logger.info(
        {
          generationId: generationId.toString(),
          tokensInput: result.usage.inputTokens,
          tokensOutput: result.usage.outputTokens,
          costEur: result.usage.estimatedCostEur,
          durationMs,
        },
        'AI generation succeeded',
      );

      return { generationId, payload };
    } catch (err: unknown) {
      const durationMs = Date.now() - started;
      if (err instanceof AiTimeoutError) {
        await prisma.aiGeneration.update({
          where: { id: generationId },
          data: {
            status: 'failed',
            errorMessage: err.message,
            errorDetails: { code: err.code, durationMs } as unknown as Prisma.InputJsonValue,
          },
        });
        logger.error(
          { generationId: generationId.toString(), errorCode: err.code, durationMs },
          'AI generation timeout',
        );
        throw new AppError('La génération a pris trop de temps. Réessaie.', 504, 'AI_TIMEOUT');
      }
      if (err instanceof AiRefusalError) {
        await prisma.aiGeneration.update({
          where: { id: generationId },
          data: {
            status: 'failed',
            errorMessage: err.message,
            errorDetails: { code: err.code, durationMs } as unknown as Prisma.InputJsonValue,
          },
        });
        logger.warn(
          { generationId: generationId.toString(), errorCode: err.code },
          'AI generation refused',
        );
        throw new AppError(
          'Le modèle a refusé de générer ce contenu. Reformule ta demande.',
          422,
          'AI_REFUSED',
        );
      }
      if (err instanceof AiInvalidOutputError) {
        await prisma.aiGeneration.update({
          where: { id: generationId },
          data: {
            status: 'failed',
            errorMessage: err.message,
            errorDetails: {
              code: err.code,
              details: err.details,
              durationMs,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        logger.error(
          { generationId: generationId.toString(), err: err.details },
          'AI invalid output',
        );
        throw new AppError(
          'Le modèle a retourné un format invalide. Réessaie.',
          502,
          'AI_INVALID_OUTPUT',
        );
      }
      if (err instanceof AiError) {
        await prisma.aiGeneration.update({
          where: { id: generationId },
          data: {
            status: 'failed',
            errorMessage: err.message,
            errorDetails: {
              code: err.code,
              durationMs,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        logger.error(
          { generationId: generationId.toString(), errorCode: err.code, durationMs },
          'AI provider error',
        );
        throw new AppError(
          'Erreur du fournisseur IA. Réessaie plus tard.',
          502,
          'AI_PROVIDER_ERROR',
        );
      }

      await prisma.aiGeneration.update({
        where: { id: generationId },
        data: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          errorDetails: { durationMs } as unknown as Prisma.InputJsonValue,
        },
      });
      logger.error(
        { generationId: generationId.toString(), err, durationMs },
        'AI generation error',
      );
      throw new AppError('Erreur du fournisseur IA. Réessaie plus tard.', 502, 'AI_PROVIDER_ERROR');
    }
  },

  async listGenerations(query: ListGenerationsQuery) {
    const where: Prisma.AiGenerationWhereInput = {};
    if (query.userId) {
      try {
        where.userId = BigInt(query.userId);
      } catch {
        throw new AppError('Invalid userId', 400, 'INVALID_USER_ID');
      }
    }
    if (query.status?.length) {
      where.status = { in: query.status };
    }
    if (query.model?.length) {
      where.modelUsed = query.model;
    }
    if (query.search?.trim()) {
      where.inputSummary = { contains: query.search.trim() };
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      prisma.aiGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
      }),
      prisma.aiGeneration.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  },

  async getGeneration(id: bigint) {
    const row = await prisma.aiGeneration.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!row) throw new AppError('Generation not found', 404, 'NOT_FOUND');
    return row;
  },

  async getUsageStats() {
    const now = new Date();
    const monthStart = startOfUtcMonth(now);
    const d7 = sevenDaysAgo(now);
    const [month, last7Days, allTime] = await Promise.all([
      aggregatePeriod({ createdAt: { gte: monthStart } }),
      aggregatePeriod({ createdAt: { gte: d7 } }),
      aggregatePeriod({}),
    ]);
    return { month, last7Days, allTime };
  },
};
