import { createRateLimiter } from './sliding-window.js';

const MINUTE = 60_000;

/** POST /api/auth/magic-link/request — par IP. */
export const magicLinkRequestIpLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 5 });
/** POST /api/auth/magic-link/request — par email (minuscules). */
export const magicLinkRequestEmailLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 3 });
/** POST /api/auth/magic-link/verify — par IP. */
export const magicLinkVerifyIpLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 20 });
/** POST /api/nucs/auth — par IP. */
export const nucAuthIpLimiter = createRateLimiter({ windowMs: MINUTE, max: 30 });
/** POST /api/nuc/heartbeat — par IP. */
export const nucHeartbeatIpLimiter = createRateLimiter({ windowMs: MINUTE, max: 30 });
/**
 * POST /api/players/join et socket player:join — par IP. Plafond volontairement
 * haut : toute une salle sort par la même IP.
 */
export const playerJoinIpLimiter = createRateLimiter({ windowMs: MINUTE, max: 300 });
/**
 * Codes de session inconnus (404 sur by-code / by-token, player:join sur code
 * inconnu) — par IP. Seuls les échecs comptent.
 */
export const sessionCodeFailureLimiter = createRateLimiter({ windowMs: MINUTE, max: 10 });

export const allRateLimiters = [
  magicLinkRequestIpLimiter,
  magicLinkRequestEmailLimiter,
  magicLinkVerifyIpLimiter,
  nucAuthIpLimiter,
  nucHeartbeatIpLimiter,
  playerJoinIpLimiter,
  sessionCodeFailureLimiter,
];
