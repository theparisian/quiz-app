import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../errors/app-error.js';

export function createUploadMiddleware(opts: {
  kind: string;
  maxSize?: number;
  allowedMimes: string[];
}) {
  void opts.kind;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      ...(opts.maxSize != null ? { fileSize: opts.maxSize } : {}),
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      if (opts.allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new AppError('Invalid file type', 400, 'UPLOAD_INVALID_MIME'));
      }
    },
  }).single('file');

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new AppError('File too large', 400, 'UPLOAD_FILE_TOO_LARGE'));
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          next(new AppError('Too many files', 400, 'UPLOAD_TOO_MANY_FILES'));
          return;
        }
        next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
        return;
      }
      if (err instanceof AppError) {
        next(err);
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}
