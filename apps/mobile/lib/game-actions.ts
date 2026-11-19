import { gameActionAckSchema, type GameActionAck } from '@quiz-app/validation';

/** Délai d'accusé d'une action de jeu. */
export const GAME_ACTION_TIMEOUT_MS = 5000;

/** Sous-ensemble du socket utilisé (testable sans socket.io). */
export interface ActionSocket {
  connected: boolean;
  timeout(ms: number): {
    emit(event: string, payload: unknown, ack: (err: unknown, response: unknown) => void): unknown;
  };
}

/**
 * `game:action` avec accusé et délai : ne rejette jamais. Délai dépassé → `TIMEOUT`, socket
 * absent ou fermé → `NOT_CONNECTED`, accusé illisible → `INVALID_ACK`.
 */
export function sendGameAction(
  socket: ActionSocket | null,
  roundId: string,
  type: string,
  payload: unknown,
  timeoutMs: number = GAME_ACTION_TIMEOUT_MS,
): Promise<GameActionAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, code: 'NOT_CONNECTED', message: 'Socket not connected' });
  }
  return new Promise((resolve) => {
    socket
      .timeout(timeoutMs)
      .emit('game:action', { roundId, type, payload }, (err: unknown, response: unknown) => {
        if (err) {
          resolve({ ok: false, code: 'TIMEOUT', message: 'No acknowledgement from server' });
          return;
        }
        const parsed = gameActionAckSchema.safeParse(response);
        resolve(
          parsed.success
            ? parsed.data
            : { ok: false, code: 'INVALID_ACK', message: 'Unreadable acknowledgement' },
        );
      });
  });
}
