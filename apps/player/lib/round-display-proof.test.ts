import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reportRoundDisplayed,
  resetRoundDisplayForTests,
  type RoundDisplayEmitter,
  type RoundDisplayedAck,
} from './round-display-proof';

function fakeSocket(ack: RoundDisplayedAck) {
  const emit = vi.fn((_event: string, _payload: unknown, cb: (res: RoundDisplayedAck) => void) =>
    cb(ack),
  );
  return { socket: { emit } as unknown as RoundDisplayEmitter, emit };
}

describe('round display proof', () => {
  beforeEach(() => resetRoundDisplayForTests());

  it('emits nuc:round_displayed once per round', () => {
    const { socket, emit } = fakeSocket({ ok: true });
    const retry = vi.fn();
    expect(reportRoundDisplayed(socket, '12', retry)).toBe(true);
    expect(reportRoundDisplayed(socket, '12', retry)).toBe(false);
    expect(reportRoundDisplayed(socket, '13', retry)).toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(
      1,
      'nuc:round_displayed',
      { roundId: '12' },
      expect.any(Function),
    );
    expect(retry).not.toHaveBeenCalled();
  });

  it('a transient refusal releases the round for a retry', () => {
    const transient = fakeSocket({ ok: false, code: 'NUC_NOT_ON_SCREEN' });
    const retry = vi.fn();
    reportRoundDisplayed(transient.socket, '20', retry);
    expect(retry).toHaveBeenCalledTimes(1);
    const ok = fakeSocket({ ok: true });
    expect(reportRoundDisplayed(ok.socket, '20', retry)).toBe(true);
  });

  it('a final refusal is not retried', () => {
    const refused = fakeSocket({ ok: false, code: 'ROUND_NOT_ON_SCREEN' });
    const retry = vi.fn();
    reportRoundDisplayed(refused.socket, '30', retry);
    expect(retry).not.toHaveBeenCalled();
    expect(reportRoundDisplayed(refused.socket, '30', retry)).toBe(false);
  });
});
