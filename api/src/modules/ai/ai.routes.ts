import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, uploadFile } from '../../shared/upload/index.js';
import { logger } from '../../shared/logger/index.js';
import { generateQuizInputSchema, listGenerationsQuerySchema } from './ai.schemas.js';
import { aiService } from './ai.service.js';

const router = Router();

const UPLOAD_MAX = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const aiInputUpload = createUploadMiddleware({
  kind: 'ai-input',
  maxSize: UPLOAD_MAX,
  allowedMimes: IMAGE_TYPES,
});

function shapeUserLite(u: { id: bigint; email: string | null; displayName: string | null }) {
  return {
    id: u.id.toString(),
    email: u.email,
    displayName: u.displayName,
  };
}

function shapeGenerationSummary(row: {
  id: bigint;
  userId: bigint;
  status: string;
  modelUsed: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costEstimateEur: unknown;
  createdAt: Date;
  user: { id: bigint; email: string | null; displayName: string | null };
}) {
  const cost = row.costEstimateEur;
  const costNum =
    cost === null || cost === undefined ? null : typeof cost === 'number' ? cost : Number(cost);
  return {
    id: row.id.toString(),
    userId: row.userId.toString(),
    status: row.status,
    modelUsed: row.modelUsed,
    tokensInput: row.tokensInput,
    tokensOutput: row.tokensOutput,
    costEstimateEur: costNum,
    createdAt: row.createdAt.toISOString(),
    user: shapeUserLite(row.user),
  };
}

function shapeGenerationDetail(row: Awaited<ReturnType<typeof aiService.getGeneration>>) {
  const cost = row.costEstimateEur;
  const costNum =
    cost === null || cost === undefined ? null : typeof cost === 'number' ? cost : Number(cost);
  return {
    id: row.id.toString(),
    userId: row.userId.toString(),
    quizId: row.quizId?.toString() ?? null,
    inputSummary: row.inputSummary,
    inputFull: row.inputFull,
    outputJson: row.outputJson,
    errorDetails: row.errorDetails,
    modelUsed: row.modelUsed,
    tokensInput: row.tokensInput,
    tokensOutput: row.tokensOutput,
    costEstimateEur: costNum,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    user: shapeUserLite(row.user),
  };
}

router.post('/generate-quiz', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(generateQuizInputSchema, req.body);
    const userId = req.user!.id;
    const result = await aiService.generateQuiz(userId, body);
    res.json({
      generationId: result.generationId.toString(),
      quiz: result.payload,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/input-image/:assetId',
  requireAuth(['super_admin']),
  aiInputUpload,
  async (req, res, next) => {
    try {
      const assetId = param(req, 'assetId');
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const storage = getStorage();
      const result = await uploadFile({
        kind: 'ai-input',
        id: assetId,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage,
      });
      logger.info(
        {
          kind: 'ai-input',
          id: assetId,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        'AI input image uploaded',
      );
      res.status(201).json({ url: result.url });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/generations', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listGenerationsQuerySchema, req.query);
    const result = await aiService.listGenerations(query);
    res.json({
      items: result.items.map(shapeGenerationSummary),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/generations/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    let id: bigint;
    try {
      id = BigInt(param(req, 'id'));
    } catch {
      throw new AppError('Invalid id', 400, 'INVALID_ID');
    }
    const row = await aiService.getGeneration(id);
    res.json(shapeGenerationDetail(row));
  } catch (error) {
    next(error);
  }
});

router.get('/usage/stats', requireAuth(['super_admin']), async (_req, res, next) => {
  try {
    const stats = await aiService.getUsageStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export { router as aiRouter };
