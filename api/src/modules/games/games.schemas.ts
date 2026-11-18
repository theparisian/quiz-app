import { z } from 'zod';

/** Clé du moteur quiz (seul moteur existant à ce stade). */
export const QUIZ_ENGINE_KEY = 'quiz';

/** Nombre maximal de jeux (manches) programmés dans une séance. */
export const MAX_GAMES_PER_SESSION = 5;

export const gameSlugSchema = z.string().min(1).max(100);

export const gameSlugsSchema = z.array(gameSlugSchema).min(1).max(MAX_GAMES_PER_SESSION);
