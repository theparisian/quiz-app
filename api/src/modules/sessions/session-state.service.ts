import type { SessionState } from '@quiz-app/types';
import { AppError } from '../../shared/errors/app-error.js';

export const SESSION_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  lobby: ['running', 'aborted'],
  running: ['paused', 'ended', 'aborted'],
  paused: ['running', 'aborted'],
  ended: [],
  aborted: [],
} as const;

export function assertTransition(from: SessionState, to: SessionState): void {
  const allowed = SESSION_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Cannot transition from '${from}' to '${to}'`,
      409,
      'INVALID_STATE_TRANSITION',
    );
  }
}

export function isTerminal(state: SessionState): boolean {
  return state === 'ended' || state === 'aborted';
}

export function isActive(state: SessionState): boolean {
  return state === 'lobby' || state === 'running' || state === 'paused';
}
