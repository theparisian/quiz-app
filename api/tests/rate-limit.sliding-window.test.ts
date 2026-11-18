import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../src/shared/rate-limit/sliding-window.js';

describe('createRateLimiter (sliding window)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to max calls per window, then blocks with resetAt', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(true);
    const blocked = limiter.check('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetAt?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    // Les autres clés ne sont pas touchées.
    expect(limiter.check('other').allowed).toBe(true);
  });

  it('slides: the oldest call leaves the window and frees a slot', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.check('ip');
    vi.advanceTimersByTime(30_000);
    limiter.check('ip');
    expect(limiter.check('ip').allowed).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(false);
  });

  it('peek does not consume a slot', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.peek('ip').allowed).toBe(true);
    expect(limiter.peek('ip').allowed).toBe(true);
    limiter.check('ip');
    expect(limiter.peek('ip').allowed).toBe(false);
  });

  it('reset clears every key', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.check('a');
    limiter.check('b');
    expect(limiter.check('a').allowed).toBe(false);
    limiter.reset();
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
  });
});
