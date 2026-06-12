const buckets = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function resetPseudoSuggestionsRateLimitForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  buckets.clear();
}

function trimOld(ts: number[], now: number): number[] {
  return ts.filter((t) => now - t < WINDOW_MS);
}

export function checkPseudoSuggestionsRateLimit(clientKey: string): {
  allowed: boolean;
  resetAt: Date | null;
} {
  const now = Date.now();
  let ts = buckets.get(clientKey) ?? [];
  ts = trimOld(ts, now);
  buckets.set(clientKey, ts);

  if (ts.length >= MAX_REQUESTS) {
    const oldest = ts[0];
    const resetAt = oldest !== undefined ? new Date(oldest + WINDOW_MS) : new Date(now + WINDOW_MS);
    return { allowed: false, resetAt };
  }

  ts.push(now);
  buckets.set(clientKey, ts);
  return { allowed: true, resetAt: null };
}

export function clientKeyFromRequest(ip: string | undefined): string {
  return ip && ip.length > 0 ? ip : 'unknown';
}
