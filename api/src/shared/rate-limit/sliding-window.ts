import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.js';

/**
 * Limiteur en mémoire à fenêtre glissante (même algorithme que
 * pseudo-suggestions.rate-limit.ts), paramétrable. Pas de Redis : un seul
 * process API. Les clés vides sont purgées toutes les 5 minutes.
 */
export interface RateLimitResult {
  allowed: boolean;
  resetAt: Date | null;
}

export interface RateLimiter {
  /** Compte un appel s'il est autorisé. */
  check(key: string): RateLimitResult;
  /** Indique si la clé est bloquée, sans compter d'appel. */
  peek(key: string): RateLimitResult;
  reset(): void;
}

const CLEANUP_INTERVAL_MS = 5 * 60_000;

export function createRateLimiter(options: { windowMs: number; max: number }): RateLimiter {
  const { windowMs, max } = options;
  const buckets = new Map<string, number[]>();

  function trimmed(key: string, now: number): number[] {
    const ts = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (ts.length === 0) buckets.delete(key);
    else buckets.set(key, ts);
    return ts;
  }

  function blockedResult(ts: number[], now: number): RateLimitResult {
    const oldest = ts[0];
    const resetAt = oldest !== undefined ? new Date(oldest + windowMs) : new Date(now + windowMs);
    return { allowed: false, resetAt };
  }

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const key of [...buckets.keys()]) trimmed(key, now);
  }, CLEANUP_INTERVAL_MS);
  cleanup.unref();

  return {
    check(key) {
      const now = Date.now();
      const ts = trimmed(key, now);
      if (ts.length >= max) return blockedResult(ts, now);
      ts.push(now);
      buckets.set(key, ts);
      return { allowed: true, resetAt: null };
    },
    peek(key) {
      const now = Date.now();
      const ts = trimmed(key, now);
      if (ts.length >= max) return blockedResult(ts, now);
      return { allowed: true, resetAt: null };
    },
    reset() {
      buckets.clear();
    },
  };
}

export type RateLimitKeyFn = (req: Request) => string | null;

export function ipKey(req: Request): string {
  return req.ip && req.ip.length > 0 ? req.ip : 'unknown';
}

function retryAfterSeconds(resetAt: Date | null): number {
  if (!resetAt) return 1;
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}

function rateLimitedError(res: Response, resetAt: Date | null): AppError {
  res.setHeader('Retry-After', String(retryAfterSeconds(resetAt)));
  return new AppError('Too many requests', 429, 'RATE_LIMITED');
}

/** Compte chaque requête ; 429 RATE_LIMITED + Retry-After au-delà du plafond. Clé null = pas de limite. */
export function rateLimitMiddleware(limiter: RateLimiter, keyFn: RateLimitKeyFn): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    if (key === null) {
      next();
      return;
    }
    const result = limiter.check(key);
    if (!result.allowed) {
      next(rateLimitedError(res, result.resetAt));
      return;
    }
    next();
  };
}

/**
 * Ne compte que les réponses en échec (par défaut : 404). Tant que la clé a
 * atteint le plafond d'échecs, toute requête reçoit 429, y compris pour un code valide.
 */
export function failureRateLimitMiddleware(
  limiter: RateLimiter,
  keyFn: RateLimitKeyFn,
  isFailure: (statusCode: number) => boolean = (status) => status === 404,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    if (key === null) {
      next();
      return;
    }
    const state = limiter.peek(key);
    if (!state.allowed) {
      next(rateLimitedError(res, state.resetAt));
      return;
    }
    res.on('finish', () => {
      if (isFailure(res.statusCode)) limiter.check(key);
    });
    next();
  };
}
