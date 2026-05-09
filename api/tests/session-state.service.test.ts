import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  isActive,
  isTerminal,
} from '../src/modules/sessions/session-state.service.js';
import type { SessionState } from '@quiz-app/types';

describe('session-state.service', () => {
  describe('assertTransition — valid transitions', () => {
    const validTransitions: [SessionState, SessionState][] = [
      ['lobby', 'running'],
      ['lobby', 'aborted'],
      ['running', 'paused'],
      ['running', 'ended'],
      ['running', 'aborted'],
      ['paused', 'running'],
      ['paused', 'aborted'],
    ];

    for (const [from, to] of validTransitions) {
      it(`${from} → ${to}`, () => {
        expect(() => assertTransition(from, to)).not.toThrow();
      });
    }
  });

  describe('assertTransition — invalid transitions', () => {
    const invalidTransitions: [SessionState, SessionState][] = [
      ['lobby', 'paused'],
      ['lobby', 'ended'],
      ['lobby', 'lobby'],
      ['running', 'lobby'],
      ['running', 'running'],
      ['paused', 'paused'],
      ['paused', 'ended'],
      ['paused', 'lobby'],
      ['ended', 'lobby'],
      ['ended', 'running'],
      ['ended', 'paused'],
      ['ended', 'aborted'],
      ['ended', 'ended'],
      ['aborted', 'lobby'],
      ['aborted', 'running'],
      ['aborted', 'paused'],
      ['aborted', 'ended'],
      ['aborted', 'aborted'],
    ];

    for (const [from, to] of invalidTransitions) {
      it(`${from} → ${to} throws INVALID_STATE_TRANSITION`, () => {
        try {
          assertTransition(from, to);
          expect.unreachable('Should have thrown');
        } catch (err: unknown) {
          const error = err as { code: string; statusCode: number };
          expect(error.code).toBe('INVALID_STATE_TRANSITION');
          expect(error.statusCode).toBe(409);
        }
      });
    }
  });

  describe('helpers', () => {
    it('isActive returns true for lobby, running, paused', () => {
      expect(isActive('lobby')).toBe(true);
      expect(isActive('running')).toBe(true);
      expect(isActive('paused')).toBe(true);
    });

    it('isActive returns false for ended, aborted', () => {
      expect(isActive('ended')).toBe(false);
      expect(isActive('aborted')).toBe(false);
    });

    it('isTerminal returns true for ended, aborted', () => {
      expect(isTerminal('ended')).toBe(true);
      expect(isTerminal('aborted')).toBe(true);
    });

    it('isTerminal returns false for lobby, running, paused', () => {
      expect(isTerminal('lobby')).toBe(false);
      expect(isTerminal('running')).toBe(false);
      expect(isTerminal('paused')).toBe(false);
    });
  });
});
