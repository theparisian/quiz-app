// Map<userId, timestamps[]>
const buckets = new Map<string, number[]>();

function windowMs(): number {
  return 60 * 60 * 1000;
}

function maxRequests(): number {
  const raw = process.env.AI_RATE_LIMIT_PER_HOUR;
  if (raw !== undefined && raw.length > 0) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1) return n;
  }
  return 5;
}

export function resetRateLimitBucketsForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  buckets.clear();
}

function trimOld(ts: number[], now: number): number[] {
  const win = windowMs();
  return ts.filter((t) => now - t < win);
}

export function checkRateLimit(userId: bigint): { allowed: boolean; resetAt: Date | null } {
  const now = Date.now();
  const key = userId.toString();
  let ts = buckets.get(key) ?? [];
  ts = trimOld(ts, now);
  buckets.set(key, ts);
  const max = maxRequests();
  if (ts.length >= max) {
    const oldest = ts[0];
    const resetAt =
      oldest !== undefined ? new Date(oldest + windowMs()) : new Date(now + windowMs());
    return { allowed: false, resetAt };
  }
  return { allowed: true, resetAt: null };
}

/** Enregistre une génération réussie (comptée dans la fenêtre glissante). */
export function recordSuccessfulGeneration(userId: bigint): void {
  const now = Date.now();
  const key = userId.toString();
  const ts = trimOld(buckets.get(key) ?? [], now);
  ts.push(now);
  buckets.set(key, ts);
}
