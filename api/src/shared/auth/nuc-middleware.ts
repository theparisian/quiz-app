import type { Request, Response, NextFunction } from 'express';
import { verifyNucJwt } from './nuc-jwt.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger/index.js';

export interface AuthNuc {
  id: bigint;
  screenId: bigint;
}

export function requireNucAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.nuc_session as string | undefined;
      if (!token) {
        throw new AppError('NUC authentication required', 401, 'NUC_AUTH_REQUIRED');
      }

      const payload = await verifyNucJwt(token);

      req.nuc = {
        id: BigInt(payload.nucId),
        screenId: BigInt(payload.screenId),
      };

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      logger.warn({ err: error }, 'NUC JWT verification failed');
      next(new AppError('Invalid NUC token', 401, 'NUC_AUTH_INVALID'));
    }
  };
}
