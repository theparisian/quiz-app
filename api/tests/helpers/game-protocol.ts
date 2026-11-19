import type { Socket as ClientSocket } from 'socket.io-client';

/** Observation du protocole de manche (`game:state`, `game:action`) dans les tests socket. */

export interface GameStateEnvelope<V = Record<string, unknown>> {
  roundId: string;
  engineKey: string;
  seq: number;
  serverNow: string;
  view: V;
}

export interface QuizQuestionLike {
  id: string;
  position: number;
  answers: { id: string; position: string; text: string }[];
}

export type QuizViewLike = {
  phase: 'countdown' | 'question' | 'reveal' | 'done';
  questionIndex: number;
  question: QuizQuestionLike | null;
  answeredCount: number;
  totalPlayers: number;
  endsAt: string | null;
  pausedRemainingMs: number | null;
  correctAnswerId?: string | null;
  me?: { answerId: string | null; locked: boolean; result: unknown };
};

/** Prochain `game:state` dont la vue satisfait `pred`. */
export function waitForGameState<V = QuizViewLike>(
  socket: ClientSocket,
  pred: (view: V) => boolean,
  timeoutMs = 8000,
): Promise<GameStateEnvelope<V>> {
  return new Promise((resolve, reject) => {
    const onState = (env: GameStateEnvelope<V>) => {
      if (!pred(env.view)) return;
      clearTimeout(timer);
      socket.off('game:state', onState);
      resolve(env);
    };
    const timer = setTimeout(() => {
      socket.off('game:state', onState);
      reject(new Error('game:state timeout'));
    }, timeoutMs);
    socket.on('game:state', onState);
  });
}

/** Ouverture d'une question du quiz (index 0-based), avec l'id de la manche. */
export async function waitForQuizQuestion(
  socket: ClientSocket,
  questionIndex = 0,
  timeoutMs = 8000,
) {
  const env = await waitForGameState(
    socket,
    (v) => v.phase === 'question' && v.questionIndex === questionIndex,
    timeoutMs,
  );
  return { roundId: env.roundId, question: env.view.question!, view: env.view };
}

export type GameActionAck =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };

export function sendGameAction(
  socket: ClientSocket,
  payload: { roundId: string; type: string; payload: unknown },
  timeoutMs = 5000,
): Promise<GameActionAck> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game:action ack timeout')), timeoutMs);
    socket.emit('game:action', payload, (ack: GameActionAck) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

export function answerPayload(questionId: string | bigint, answerId: string | bigint) {
  return {
    type: 'answer',
    payload: { questionId: questionId.toString(), answerId: answerId.toString() },
  };
}
