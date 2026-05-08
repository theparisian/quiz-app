import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@quiz-app/types';
import { verifyJwt } from './jwt.js';
import { prisma } from '../db/index.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger/index.js';

export interface AuthUser {
  id: bigint;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  cinemaId: bigint | null;
}

declare module 'express' {
  interface Request {
    user?: AuthUser | undefined;
  }
}

export function requireAuth(roles?: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.token as string | undefined;

      if (!token) {
        throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
      }

      const payload = await verifyJwt(token);
      const user = await prisma.user.findUnique({
        where: { id: BigInt(payload.userId) },
      });

      if (!user || user.deletedAt) {
        throw new AppError('User not found', 401, 'USER_NOT_FOUND');
      }

      if (roles && !roles.includes(user.role as UserRole)) {
        throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
      }

      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role as UserRole,
        cinemaId: user.cinemaId,
      };

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      logger.warn({ err: error }, 'JWT verification failed');
      next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    }
  };
}
