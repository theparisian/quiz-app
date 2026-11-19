import { describe, expect, it, vi } from 'vitest';
import { computeRemainingMs, pushClockSample } from '@quiz-app/ui';
import { sendGameAction, type ActionSocket } from './game-actions';

function fakeSocket(reply: (ack: (err: unknown, res: unknown) => void) => void) {
  const emit = vi.fn((_e: string, _p: unknown, ack: (err: unknown, res: unknown) => void) =>
    reply(ack),
  );
  const timeout = vi.fn(() => ({ emit }));
  const socket: ActionSocket = { connected: true, timeout };
  return { socket, emit, timeout };
}

describe('sendGameAction', () => {
  it('emits game:action with roundId and a 5 s timeout, resolves the ack', async () => {
    const { socket, emit, timeout } = fakeSocket((ack) => ack(null, { ok: true, result: 1 }));
    const ack = await sendGameAction(socket, '7', 'answer', { questionId: '1', answerId: '2' });
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(emit.mock.calls[0]?.[0]).toBe('game:action');
    expect(emit.mock.calls[0]?.[1]).toEqual({
      roundId: '7',
      type: 'answer',
      payload: { questionId: '1', answerId: '2' },
    });
    expect(ack).toEqual({ ok: true, result: 1 });
  });

  it('passes a refusal through', async () => {
    const { socket } = fakeSocket((ack) =>
      ack(null, { ok: false, code: 'ALREADY_ANSWERED', message: 'x' }),
    );
    expect(await sendGameAction(socket, '7', 'answer', {})).toMatchObject({
      ok: false,
      code: 'ALREADY_ANSWERED',
    });
  });

  it('timeout, disconnected socket and unreadable ack never reject', async () => {
    const timedOut = fakeSocket((ack) => ack(new Error('timeout'), undefined));
    expect(await sendGameAction(timedOut.socket, '7', 'answer', {})).toMatchObject({
      code: 'TIMEOUT',
    });
    expect(await sendGameAction(null, '7', 'answer', {})).toMatchObject({ code: 'NOT_CONNECTED' });
    const garbage = fakeSocket((ack) => ack(null, 'hello'));
    expect(await sendGameAction(garbage.socket, '7', 'answer', {})).toMatchObject({
      code: 'INVALID_ACK',
    });
  });
});

describe('countdown helpers (@quiz-app/ui)', () => {
  it('computeRemainingMs: deadline corrected by the clock offset, frozen in pause', () => {
    const now = 1_000_000;
    const endsAt = new Date(now + 10_000).toISOString();
    expect(computeRemainingMs(endsAt, null, 0, now)).toBe(10_000);
    // Horloge locale en retard de 2 s sur le serveur : il reste 8 s.
    expect(computeRemainingMs(endsAt, null, 2_000, now)).toBe(8_000);
    expect(computeRemainingMs(endsAt, 4_321, 2_000, now)).toBe(4_321);
    expect(computeRemainingMs(null, null, 0, now)).toBeNull();
    expect(computeRemainingMs(new Date(now - 1).toISOString(), null, 0, now)).toBe(0);
  });

  it('pushClockSample keeps the median of the last 5 samples', () => {
    let samples: number[] = [];
    let offset = 0;
    const local = 1_000_000;
    for (const delta of [100, 120, 5000, 110, 90, 105]) {
      ({ samples, offsetMs: offset } = pushClockSample(
        samples,
        new Date(local + delta).toISOString(),
        local,
      ));
    }
    expect(samples).toHaveLength(5);
    expect(offset).toBe(110);
  });
});
