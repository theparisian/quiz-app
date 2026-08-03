import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  createSoundLibrarySchema,
  listSoundLibrariesQuerySchema,
  reorderSoundsSchema,
  updateSoundLibrarySchema,
  updateSoundSchema,
} from './audio.schemas.js';
import { audioService } from './audio.service.js';
import { shapeSoundLibrary } from './audio.shapers.js';
import { soundUpload, storeUploadedSound } from './audio-upload.js';

const router = Router();

function parseSoundId(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new AppError('Invalid sound id', 400, 'INVALID_SOUND_ID');
  }
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listSoundLibrariesQuerySchema, req.query);
    const libraries = await audioService.listLibraries({ active: query.active });
    res.json({ items: libraries.map((l) => shapeSoundLibrary(l)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const library = await audioService.getLibraryBySlug(param(req, 'slug'));
    res.json(shapeSoundLibrary(library));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createSoundLibrarySchema, req.body);
    const library = await audioService.createLibrary(data);
    logger.info({ soundLibrarySlug: library.slug }, 'Sound library created');
    res.status(201).json(shapeSoundLibrary(await audioService.getLibraryBySlug(library.slug)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    const data = validate(updateSoundLibrarySchema, req.body);
    await audioService.updateLibrary(slug, data);
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/activate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    await audioService.setLibraryActive(slug, true);
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/deactivate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    await audioService.setLibraryActive(slug, false);
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await audioService.deleteLibrary(param(req, 'slug'), getStorage());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/sounds', requireAuth(['super_admin']), soundUpload, async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    const library = await audioService.getLibraryBySlug(slug);
    const params = await storeUploadedSound(req, slug);
    await audioService.addLibrarySound(library.slug, params);
    res.status(201).json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

// Doit précéder `/:slug/sounds/:soundId`, sinon "reorder" serait lu comme un id.
router.patch('/:slug/sounds/reorder', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    const data = validate(reorderSoundsSchema, req.body);
    await audioService.reorderLibrarySounds(slug, data.orderedIds);
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug/sounds/:soundId', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    const library = await audioService.getLibraryBySlug(slug);
    const soundId = parseSoundId(param(req, 'soundId'));
    if (!library.sounds.some((s) => s.id === soundId)) {
      throw new AppError('Sound not found', 404, 'SOUND_NOT_FOUND');
    }
    const data = validate(updateSoundSchema, req.body);
    await audioService.updateSound(soundId, data);
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug/sounds/:soundId', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    const library = await audioService.getLibraryBySlug(slug);
    const soundId = parseSoundId(param(req, 'soundId'));
    await audioService.removeSound(soundId, { libraryId: library.id }, getStorage());
    res.json(shapeSoundLibrary(await audioService.getLibraryBySlug(slug)));
  } catch (error) {
    next(error);
  }
});

export { router as audioRouter };
