import { Router } from 'express';
import sharp from 'sharp';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, uploadFile } from '../../shared/upload/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  createAvatarLibrarySchema,
  updateAvatarLibrarySchema,
  reorderAvatarsSchema,
  listAvatarLibrariesQuerySchema,
} from './avatars.schemas.js';
import { avatarsService } from './avatars.service.js';

const router = Router();

const UPLOAD_MAX = 4 * 1024 * 1024;
const AVATAR_SIZE = 512;
const AVATAR_SOURCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const avatarUpload = createUploadMiddleware({
  kind: 'avatar',
  maxSize: UPLOAD_MAX,
  allowedMimes: [...AVATAR_SOURCE_MIMES],
});

function shapeAvatar(a: { id: bigint; imageUrl: string; label: string | null; position: number }) {
  return {
    id: a.id.toString(),
    imageUrl: a.imageUrl,
    label: a.label,
    position: a.position,
  };
}

function shapeLibrary(lib: {
  id: bigint;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  avatars?: (
    | { imageUrl: string }
    | { id: bigint; imageUrl: string; label: string | null; position: number }
  )[];
  _count?: { avatars?: number; quizzes?: number };
}) {
  const avatars = lib.avatars ?? [];
  const firstAvatar = avatars[0];
  const hasDetailedAvatars = firstAvatar !== undefined && 'id' in firstAvatar;

  return {
    id: lib.id.toString(),
    slug: lib.slug,
    name: lib.name,
    description: lib.description,
    isActive: lib.isActive,
    createdAt: lib.createdAt.toISOString(),
    updatedAt: lib.updatedAt.toISOString(),
    avatarsCount: lib._count?.avatars,
    quizzesCount: lib._count?.quizzes,
    previewImageUrl: avatars[0]?.imageUrl ?? null,
    ...(hasDetailedAvatars
      ? { avatars: avatars.map((a) => shapeAvatar(a as Parameters<typeof shapeAvatar>[0])) }
      : {}),
  };
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listAvatarLibrariesQuerySchema, req.query);
    const libraries = await avatarsService.list({ active: query.active });
    res.json({ items: libraries.map((l) => shapeLibrary(l)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const library = await avatarsService.getBySlug(param(req, 'slug'));
    res.json(shapeLibrary(library));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createAvatarLibrarySchema, req.body);
    const library = await avatarsService.create(data);
    logger.info({ avatarLibrarySlug: library.slug }, 'Avatar library created');
    res.status(201).json(shapeLibrary(await avatarsService.getBySlug(library.slug)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(updateAvatarLibrarySchema, req.body);
    await avatarsService.update(param(req, 'slug'), data);
    res.json(shapeLibrary(await avatarsService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/activate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await avatarsService.setActive(param(req, 'slug'), true);
    res.json(shapeLibrary(await avatarsService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/deactivate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await avatarsService.setActive(param(req, 'slug'), false);
    res.json(shapeLibrary(await avatarsService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await avatarsService.delete(param(req, 'slug'), getStorage());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/avatars',
  requireAuth(['super_admin']),
  avatarUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');

      let normalized: Buffer;
      try {
        normalized = await sharp(req.file.buffer)
          .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
      } catch {
        throw new AppError('Invalid image file', 400, 'AVATAR_INVALID_IMAGE');
      }

      const storage = getStorage();
      const result = await uploadFile({
        kind: 'avatar',
        id: slug,
        file: { buffer: normalized, mimetype: 'image/png', originalname: 'avatar.png' },
        storage,
      });
      const label = typeof req.body?.label === 'string' && req.body.label ? req.body.label : null;
      await avatarsService.addAvatar(slug, { imageUrl: result.url, imageKey: result.key, label });
      logger.info({ kind: 'avatar', id: slug }, 'Avatar uploaded');
      res.status(201).json(shapeLibrary(await avatarsService.getBySlug(slug)));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:slug/avatars/:avatarId', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    let avatarId: bigint;
    try {
      avatarId = BigInt(param(req, 'avatarId'));
    } catch {
      throw new AppError('Invalid avatar id', 400, 'INVALID_AVATAR_ID');
    }
    await avatarsService.removeAvatar(param(req, 'slug'), avatarId, getStorage());
    res.json(shapeLibrary(await avatarsService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug/avatars/reorder', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(reorderAvatarsSchema, req.body);
    await avatarsService.reorder(param(req, 'slug'), data.orderedIds);
    res.json(shapeLibrary(await avatarsService.getBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

export { router as avatarsRouter };
