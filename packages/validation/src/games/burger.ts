import { z } from 'zod';

/**
 * Moteur « burger » : course de vitesse. Chaque joueur reçoit les étages d'un burger mélangés sur
 * son téléphone et les remet dans l'ordre en les faisant glisser ; le plus rapide gagne.
 *
 * Phases : `countdown` → `build` → `results` → `done`.
 *
 * Ordre des étages : un tableau d'identifiants **du bas vers le haut** (index 0 = pain du bas).
 *
 * Secrets :
 * - la recette (côté serveur uniquement, `burger.engine.ts`) n'apparaît dans aucune vue avant `results` ;
 * - une vue mobile ne contient que l'ordre du joueur et son nombre d'étages bien placés, jamais
 *   lesquels ;
 * - la vue écran montre, pour chaque joueur, ses étages bien placés dans l'ordre du burger (bas
 *   vers le haut) : la salle voit les burgers se monter. C'est une course de vitesse, la solution
 *   visible au grand écran n'est pas un problème.
 */

export const BURGER_ENGINE_KEY = 'burger';

/**
 * Étages du burger, par ordre alphabétique (ce n'est PAS la recette, qui reste côté serveur
 * pour ne jamais se retrouver dans le code envoyé aux téléphones).
 */
export const BURGER_LAYER_IDS = [
  'bun_bottom',
  'bun_top',
  'lettuce',
  'onion',
  'patty_cheese',
  'pickles',
  'sauce',
  'tomato',
] as const;
export type BurgerLayerId = (typeof BURGER_LAYER_IDS)[number];

export const burgerLayerIdSchema = z.enum(BURGER_LAYER_IDS);

export const BURGER_LAYER_LABELS: Record<BurgerLayerId, string> = {
  bun_bottom: 'Pain du bas',
  sauce: 'Sauce',
  lettuce: 'Salade',
  tomato: 'Tomates',
  patty_cheese: 'Steak & cheddar',
  onion: 'Oignons rouges',
  pickles: 'Cornichons',
  bun_top: 'Pain sésame',
};

/** Nombre de concurrents détaillés dans la vue écran (les suivants sont seulement comptés). */
export const BURGER_SCREEN_RACERS = 24;

// ─── Configuration (games.config_json) ───────────────────

export const burgerConfigSchema = z
  .object({
    /** Compte à rebours avant la course (s). */
    countdownSeconds: z.number().int().min(3).max(10).default(4),
    /** Durée maximale de la course (s). */
    durationSeconds: z.number().int().min(15).max(180).default(60),
    /** Durée de l'écran de résultats (s). */
    resultsSeconds: z.number().int().min(3).max(30).default(10),
    /** Points d'un burger terminé instantanément ; décroît linéairement jusqu'à `pointsFloor`. */
    pointsMax: z.number().int().min(0).max(5000).default(1000),
    /** Points d'un burger terminé à la dernière seconde. */
    pointsFloor: z.number().int().min(0).max(5000).default(500),
    /** Burger non terminé : points au prorata des étages bien placés, jusqu'à ce plafond. */
    partialPointsMax: z.number().int().min(0).max(5000).default(300),
  })
  .refine((c) => c.pointsFloor <= c.pointsMax, {
    message: 'pointsFloor must not exceed pointsMax',
    path: ['pointsFloor'],
  });
export type BurgerConfig = z.infer<typeof burgerConfigSchema>;
export type BurgerConfigInput = z.input<typeof burgerConfigSchema>;

/** Durée estimée d'une manche (s). */
export function burgerDurationEstimateSeconds(config: BurgerConfig): number {
  return config.countdownSeconds + config.durationSeconds + config.resultsSeconds;
}

/** Points d'un joueur en fin de course (calcul serveur, exporté pour les tests et l'aide). */
export function burgerPoints(
  config: BurgerConfig,
  result: { finishMs: number | null; correctCount: number },
): number {
  const durationMs = config.durationSeconds * 1000;
  if (result.finishMs !== null) {
    const left = Math.max(0, Math.min(1, 1 - result.finishMs / durationMs));
    return Math.round(config.pointsFloor + (config.pointsMax - config.pointsFloor) * left);
  }
  return Math.round(config.partialPointsMax * (result.correctCount / BURGER_LAYER_IDS.length));
}

// ─── Vues ────────────────────────────────────────────────

export const burgerPhaseSchema = z.enum(['countdown', 'build', 'results', 'done']);
export type BurgerPhase = z.infer<typeof burgerPhaseSchema>;

const orderSchema = z.array(burgerLayerIdSchema).length(BURGER_LAYER_IDS.length);

const burgerCommonFields = {
  /** Échéance de la phase (fin du compte à rebours, de la course, des résultats). */
  endsAt: z.string().datetime().nullable(),
  /** Temps restant figé pendant une pause (remplace `endsAt`). */
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  /** Durée de la course (barre de temps). */
  durationMs: z.number().int().positive(),
  /** Durée du compte à rebours (animation). */
  countdownMs: z.number().int().positive(),
  totalLayers: z.number().int().positive(),
  /** Joueurs actifs de la manche. */
  totalPlayers: z.number().int().nonnegative(),
  /** Joueurs ayant terminé leur burger. */
  finishedCount: z.number().int().nonnegative(),
};

/** Un concurrent vu par l'écran et la console (classé : le premier est le plus avancé). */
export const burgerRacerSchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable(),
  correctCount: z.number().int().nonnegative(),
  /** Étages bien placés, du bas vers le haut (positions de la recette). */
  placedLayers: z.array(burgerLayerIdSchema),
  /** Temps de course (ms) si le burger est terminé. */
  finishMs: z.number().int().nonnegative().nullable(),
  /** Rang dans la course (1 = le plus avancé). */
  rank: z.number().int().positive(),
  /** Points de la manche, connus à partir de `results`. */
  points: z.number().int().nonnegative().nullable(),
});
export type BurgerRacer = z.infer<typeof burgerRacerSchema>;

const racersFields = {
  /** Les `BURGER_SCREEN_RACERS` premiers, du plus avancé au moins avancé. */
  racers: z.array(burgerRacerSchema),
};
const recipeField = { recipe: orderSchema };

/** Vue écran (audience `screen`) et console (audience `console`) : même forme. */
export const burgerScreenViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('countdown'), ...burgerCommonFields }),
  z.object({ phase: z.literal('build'), ...burgerCommonFields, ...racersFields }),
  z.object({ phase: z.literal('results'), ...burgerCommonFields, ...racersFields, ...recipeField }),
  z.object({ phase: z.literal('done'), ...burgerCommonFields, ...racersFields, ...recipeField }),
]);
export type BurgerScreenView = z.infer<typeof burgerScreenViewSchema>;

export const burgerConsoleViewSchema = burgerScreenViewSchema;
export type BurgerConsoleView = BurgerScreenView;

/** Ce que voit un joueur de sa propre course. */
export const burgerMeSchema = z.object({
  /** Son burger, du bas vers le haut ; vide pendant le compte à rebours. */
  order: z.array(burgerLayerIdSchema),
  correctCount: z.number().int().nonnegative(),
  finishMs: z.number().int().nonnegative().nullable(),
  /** Rang d'arrivée (burger terminé) ou rang final (à partir de `results`). */
  rank: z.number().int().positive().nullable(),
  points: z.number().int().nonnegative().nullable(),
});
export type BurgerMe = z.infer<typeof burgerMeSchema>;

const meField = { me: burgerMeSchema };

export const burgerMobileViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('countdown'), ...burgerCommonFields, ...meField }),
  z.object({ phase: z.literal('build'), ...burgerCommonFields, ...meField }),
  z.object({ phase: z.literal('results'), ...burgerCommonFields, ...meField, ...recipeField }),
  z.object({ phase: z.literal('done'), ...burgerCommonFields, ...meField, ...recipeField }),
]);
export type BurgerMobileView = z.infer<typeof burgerMobileViewSchema>;

// ─── Action (game:action) ────────────────────────────────

export const BURGER_REORDER_ACTION = 'reorder';

export const burgerReorderActionSchema = z.object({
  type: z.literal(BURGER_REORDER_ACTION),
  /** Le burger complet du joueur, du bas vers le haut (une permutation des étages). */
  payload: z.object({ order: orderSchema }),
});
export type BurgerReorderAction = z.infer<typeof burgerReorderActionSchema>;

/** `result` de l'accusé d'un réordonnancement accepté. */
export const burgerReorderResultSchema = z.object({
  correctCount: z.number().int().nonnegative(),
  finishMs: z.number().int().nonnegative().nullable(),
  rank: z.number().int().positive().nullable(),
});
export type BurgerReorderResult = z.infer<typeof burgerReorderResultSchema>;

/** Cues : un joueur vient de terminer son burger (son et flash à l'écran). */
export const BURGER_CUES = { playerFinished: 'player_finished' } as const;
export const burgerPlayerFinishedCueSchema = z.object({
  pseudo: z.string(),
  rank: z.number().int().positive(),
  finishMs: z.number().int().nonnegative(),
});
export type BurgerPlayerFinishedCue = z.infer<typeof burgerPlayerFinishedCueSchema>;

/** Points de la course : motif des ScoreEvent. */
export const BURGER_SCORE_REASON = 'burger_race';

/** « 12,4 s » */
export function formatBurgerTime(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}
