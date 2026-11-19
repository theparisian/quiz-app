import { AppError } from '../../shared/errors/app-error.js';
import type { GameEngine } from './engine.types.js';
import { pollEngine } from './engines/poll/poll.engine.js';
import { quizEngine } from './engines/quiz/quiz.engine.js';

const engines = new Map<string, GameEngine>();

export function registerEngine(engine: GameEngine): void {
  if (engines.has(engine.key)) {
    throw new Error(`Game engine already registered: ${engine.key}`);
  }
  engines.set(engine.key, engine);
}

/** Un moteur est enregistré pour cette clé. */
export function hasEngine(key: string): boolean {
  return engines.has(key);
}

export function getEngine(key: string): GameEngine {
  const engine = engines.get(key);
  if (!engine) throw new AppError(`Unknown game engine: ${key}`, 500, 'ENGINE_NOT_FOUND');
  return engine;
}

registerEngine(quizEngine);
registerEngine(pollEngine);
