import type { Request } from 'express';
import { AUDIO_MIME_TYPES, AUDIO_UPLOAD_MAX_BYTES } from '@quiz-app/validation';
import { AppError } from '../../shared/errors/app-error.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, sniffAudioMime, uploadFile } from '../../shared/upload/index.js';
import { validate } from '../../shared/validation/index.js';
import { logger } from '../../shared/logger/index.js';
import { uploadSoundFieldsSchema } from './audio.schemas.js';
import type { AddSoundParams } from './audio.service.js';

export const soundUpload = createUploadMiddleware({
  kind: 'sound',
  maxSize: AUDIO_UPLOAD_MAX_BYTES,
  allowedMimes: [...AUDIO_MIME_TYPES],
});

const MAX_LABEL_LENGTH = 150;

function labelFromFilename(originalname: string): string {
  const withoutExt = originalname.replace(/\.[a-z0-9]+$/i, '');
  const cleaned = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Son').slice(0, MAX_LABEL_LENGTH);
}

/**
 * Valide, stocke et décrit un son uploadé. `storageId` est le segment de chemin
 * (slug de bibliothèque ou de quiz) : il doit respecter /^[a-z0-9-]+$/.
 */
export async function storeUploadedSound(req: Request, storageId: string): Promise<AddSoundParams> {
  if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');

  const fields = validate(uploadSoundFieldsSchema, req.body ?? {});
  const mimeType = sniffAudioMime(req.file.buffer);

  const result = await uploadFile({
    kind: 'sound',
    id: storageId,
    file: {
      buffer: req.file.buffer,
      mimetype: mimeType,
      originalname: req.file.originalname,
    },
    storage: getStorage(),
  });

  logger.info(
    { kind: 'sound', id: storageId, size: req.file.size, mime: mimeType },
    'Sound uploaded',
  );

  return {
    audioUrl: result.url,
    audioKey: result.key,
    label: fields.label?.trim() || labelFromFilename(req.file.originalname),
    kind: fields.kind ?? 'sfx',
    mimeType,
    sizeBytes: req.file.size,
  };
}
