import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, uploadFile } from '../../shared/upload/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  createQuizSchema,
  updateQuizSchema,
  saveFullEditSchema,
  publishQuizSchema,
  listQuizzesQuerySchema,
} from './quizzes.schemas.js';
import { quizzesService } from './quizzes.service.js';
import { quizPrizesConfigService } from '../prizes/prize-catalog.service.js';
import { updateQuizPrizesConfigBodySchema } from '../prizes/prizes.schemas.js';

const router = Router();

const UPLOAD_MAX = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const BACKGROUND_TYPES = [...IMAGE_TYPES, 'video/mp4', 'video/webm'];

const quizCoverUpload = createUploadMiddleware({
  kind: 'quiz-cover',
  maxSize: UPLOAD_MAX,
  allowedMimes: IMAGE_TYPES,
});

const quizBackgroundUpload = createUploadMiddleware({
  kind: 'quiz-background',
  allowedMimes: BACKGROUND_TYPES,
});

const quizLobbyBackgroundUpload = createUploadMiddleware({
  kind: 'quiz-lobby-background',
  allowedMimes: BACKGROUND_TYPES,
});

const questionImageUpload = createUploadMiddleware({
  kind: 'question-image',
  maxSize: UPLOAD_MAX,
  allowedMimes: IMAGE_TYPES,
});

function shapeSponsorLite(s: { id: bigint; slug: string; name: string; active: boolean } | null) {
  if (!s) return null;
  return {
    id: s.id.toString(),
    slug: s.slug,
    name: s.name,
    active: s.active,
  };
}

function shapeAnswer(a: { id: bigint; position: string; text: string; isCorrect: boolean }) {
  return {
    id: a.id.toString(),
    position: a.position,
    text: a.text,
    isCorrect: a.isCorrect,
  };
}

function shapeQuestion(q: {
  id: bigint;
  position: number;
  text: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  pointsMax: number;
  pointsFloor: number;
  explanation: string | null;
  createdAt: Date;
  answers?: {
    id: bigint;
    position: string;
    text: string;
    isCorrect: boolean;
  }[];
}) {
  return {
    id: q.id.toString(),
    position: q.position,
    text: q.text,
    imageUrl: q.imageUrl,
    timeLimitSeconds: q.timeLimitSeconds,
    pointsMax: q.pointsMax,
    pointsFloor: q.pointsFloor,
    explanation: q.explanation,
    createdAt: q.createdAt.toISOString(),
    ...(q.answers ? { answers: q.answers.map(shapeAnswer) } : {}),
  };
}

export function shapeQuizSummary(item: {
  id: bigint;
  slug: string;
  title: string;
  type: string;
  status: string;
  language: string;
  coverImageUrl: string | null;
  createdAt: Date;
  sponsor: { slug: string; name: string } | null;
  createdBy: { id: bigint; displayName: string | null; email: string | null };
  _count: { questions: number };
}) {
  return {
    id: item.id.toString(),
    slug: item.slug,
    title: item.title,
    type: item.type,
    status: item.status,
    language: item.language,
    coverImageUrl: item.coverImageUrl,
    createdAt: item.createdAt.toISOString(),
    sponsor: item.sponsor,
    createdBy: {
      id: item.createdBy.id.toString(),
      displayName: item.createdBy.displayName,
      email: item.createdBy.email,
    },
    questionsCount: item._count.questions,
  };
}

function shapeQuizDetail(quiz: Awaited<ReturnType<typeof quizzesService.getBySlug>>) {
  return {
    id: quiz.id.toString(),
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    type: quiz.type,
    sponsorId: quiz.sponsorId?.toString() ?? null,
    sponsor: quiz.sponsor
      ? shapeSponsorLite({
          id: quiz.sponsor!.id,
          slug: quiz.sponsor.slug,
          name: quiz.sponsor.name,
          active: quiz.sponsor.active,
        })
      : null,
    language: quiz.language,
    durationEstimateSeconds: quiz.durationEstimateSeconds,
    coverImageUrl: quiz.coverImageUrl,
    backgroundMediaUrl: quiz.backgroundMediaUrl,
    backgroundMediaType: quiz.backgroundMediaType,
    backgroundOverlayOpacity: quiz.backgroundOverlayOpacity,
    lobbyBackgroundMediaUrl: quiz.lobbyBackgroundMediaUrl,
    lobbyBackgroundMediaType: quiz.lobbyBackgroundMediaType,
    lobbyBackgroundOverlayOpacity: quiz.lobbyBackgroundOverlayOpacity,
    avatarsEnabled: quiz.avatarsEnabled,
    avatarLibraryId: quiz.avatarLibraryId?.toString() ?? null,
    avatarLibrary: quiz.avatarLibrary
      ? {
          id: quiz.avatarLibrary.id.toString(),
          slug: quiz.avatarLibrary.slug,
          name: quiz.avatarLibrary.name,
        }
      : null,
    brandingJson: quiz.brandingJson,
    status: quiz.status,
    aiGenerated: quiz.aiGenerated,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
    createdBy: {
      id: quiz.createdBy.id.toString(),
      displayName: quiz.createdBy.displayName,
      email: quiz.createdBy.email,
    },
    sessionsCount: quiz._count.sessions,
    questions: quiz.questions.map(shapeQuestion),
  };
}

router.get(
  '/',
  requireAuth(['super_admin', 'cinema_admin', 'projectionist']),
  async (req, res, next) => {
    try {
      const query = validate(listQuizzesQuerySchema, req.query);
      const sponsorIdParsed =
        query.sponsorId && query.sponsorId.length ? query.sponsorId : undefined;
      const result = await quizzesService.list({
        status: query.status,
        type: query.type,
        sponsorId: sponsorIdParsed,
        search: query.search,
        page: query.page,
        limit: query.limit,
      });
      res.json({
        items: result.items.map(shapeQuizSummary),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createQuizSchema, req.body);
    const userId = req.user!.id;
    const quiz = await quizzesService.create(data, userId);
    logger.info({ quizSlug: quiz.slug, userId: userId.toString() }, 'Quiz created');
    res.status(201).json(shapeQuizDetail(await quizzesService.getBySlug(quiz.slug)));
  } catch (error) {
    next(error);
  }
});

router.put('/:slug/full', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const payload = validate(saveFullEditSchema, req.body);
    const saved = await quizzesService.saveFullEdit(param(req, 'slug'), payload, req.user!.id);
    res.json(shapeQuizDetail(saved));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/publish', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    validate(publishQuizSchema, req.body);
    const q = await quizzesService.publish(param(req, 'slug'));
    res.json(shapeQuizDetail(q));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/unpublish', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    validate(publishQuizSchema, req.body);
    const q = await quizzesService.unpublish(param(req, 'slug'));
    res.json(shapeQuizDetail(q));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/archive', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    validate(publishQuizSchema, req.body);
    const q = await quizzesService.archive(param(req, 'slug'));
    res.json(shapeQuizDetail(q));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/unarchive', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    validate(publishQuizSchema, req.body);
    const q = await quizzesService.unarchive(param(req, 'slug'));
    res.json(shapeQuizDetail(q));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/duplicate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    validate(publishQuizSchema, req.body);
    const slug = param(req, 'slug');
    const dup = await quizzesService.duplicate(slug, req.user!.id);
    res.status(201).json(shapeQuizDetail(dup));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/cover',
  requireAuth(['super_admin']),
  quizCoverUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const storage = getStorage();
      const result = await uploadFile({
        kind: 'quiz-cover',
        id: slug,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage,
      });
      logger.info(
        {
          kind: 'quiz-cover',
          id: slug,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        'File uploaded',
      );
      await quizzesService.setCoverImage(slug, result.key, result.url);
      res.json(shapeQuizDetail(await quizzesService.getBySlug(slug)));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:slug/cover', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const storage = getStorage();
    await quizzesService.removeCoverImage(param(req, 'slug'), storage);
    res.json(shapeQuizDetail(await quizzesService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/background',
  requireAuth(['super_admin']),
  quizBackgroundUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const storage = getStorage();
      const result = await uploadFile({
        kind: 'quiz-background',
        id: slug,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage,
      });
      logger.info(
        {
          kind: 'quiz-background',
          id: slug,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        'File uploaded',
      );
      await quizzesService.setBackgroundMedia(slug, result.key, result.url, req.file.mimetype);
      res.json(shapeQuizDetail(await quizzesService.getBySlug(slug)));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:slug/background', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const storage = getStorage();
    await quizzesService.removeBackgroundMedia(param(req, 'slug'), storage);
    res.json(shapeQuizDetail(await quizzesService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/lobby-background',
  requireAuth(['super_admin']),
  quizLobbyBackgroundUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const storage = getStorage();
      const result = await uploadFile({
        kind: 'quiz-lobby-background',
        id: slug,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage,
      });
      logger.info(
        {
          kind: 'quiz-lobby-background',
          id: slug,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        'File uploaded',
      );
      await quizzesService.setLobbyBackgroundMedia(slug, result.key, result.url, req.file.mimetype);
      res.json(shapeQuizDetail(await quizzesService.getBySlug(slug)));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:slug/lobby-background', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const storage = getStorage();
    await quizzesService.removeLobbyBackgroundMedia(param(req, 'slug'), storage);
    res.json(shapeQuizDetail(await quizzesService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/questions/:questionId/image',
  requireAuth(['super_admin']),
  questionImageUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      let qid: bigint;
      try {
        qid = BigInt(param(req, 'questionId'));
      } catch {
        throw new AppError('Invalid question id', 400, 'INVALID_QUESTION_ID');
      }
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const storage = getStorage();
      const idStr = qid.toString();
      const result = await uploadFile({
        kind: 'question-image',
        id: idStr,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage,
      });
      logger.info(
        {
          kind: 'question-image',
          id: idStr,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        'File uploaded',
      );
      await quizzesService.setQuestionImage(slug, qid, result.url);
      res.json(shapeQuizDetail(await quizzesService.getBySlug(slug)));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:slug/questions/:questionId/image',
  requireAuth(['super_admin']),
  async (req, res, next) => {
    try {
      let qid: bigint;
      try {
        qid = BigInt(param(req, 'questionId'));
      } catch {
        throw new AppError('Invalid question id', 400, 'INVALID_QUESTION_ID');
      }
      const storage = getStorage();
      await quizzesService.removeQuestionImage(param(req, 'slug'), qid, storage);
      res.json(shapeQuizDetail(await quizzesService.getBySlug(param(req, 'slug'))));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const quiz = await quizzesService.getBySlug(param(req, 'slug'));
    res.json(shapeQuizDetail(quiz));
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/prizes-config', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const result = await quizPrizesConfigService.get(param(req, 'slug'));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug/prizes-config', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updateQuizPrizesConfigBodySchema, req.body);
    const result = await quizPrizesConfigService.update(param(req, 'slug'), body.config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updateQuizSchema, req.body);
    const quiz = await quizzesService.update(param(req, 'slug'), body);
    res.json(shapeQuizDetail(await quizzesService.getBySlug(quiz.slug)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await quizzesService.delete(param(req, 'slug'));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as quizzesRouter };
