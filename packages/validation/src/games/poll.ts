import { z } from 'zod';

/**
 * Moteur sondage (« poll ») : configuration du jeu (`games.config_json`), vues
 * (`game:state.view`) et action (`game:action`). Aucun cue.
 *
 * Une à dix questions sans bonne réponse : le public vote, l'écran montre les barres.
 * Phases : (`question` → `results`) × N → `done`.
 *
 * Règles du protocole (rappel) : vue complète, échéances (`endsAt` pendant que le temps court,
 * `pausedRemainingMs` à la place pendant une pause, les deux à null sans échéance). Pendant la
 * phase `question`, aucune vue ne contient la répartition des votes (`counts`), seulement leur
 * nombre ; une vue mobile ne contient jamais le vote d'un autre joueur.
 */

export const POLL_ENGINE_KEY = 'poll';

export const POLL_MAX_QUESTIONS = 10;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;

// ─── Configuration (games.config_json) ───────────────────

const pollIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/);

export const pollOptionConfigSchema = z.object({
  id: pollIdSchema,
  text: z.string().trim().min(1).max(80),
});

export const pollQuestionConfigSchema = z
  .object({
    id: pollIdSchema,
    text: z.string().trim().min(1).max(200),
    options: z.array(pollOptionConfigSchema).min(POLL_MIN_OPTIONS).max(POLL_MAX_OPTIONS),
    durationSeconds: z.number().int().min(5).max(60).default(20),
  })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === q.options.length, {
    message: 'Option ids must be unique within a question',
    path: ['options'],
  });

export const pollConfigSchema = z
  .object({
    questions: z.array(pollQuestionConfigSchema).min(1).max(POLL_MAX_QUESTIONS),
    participationPoints: z.number().int().min(0).max(1000).default(300),
    resultsSeconds: z.number().int().min(3).max(20).default(6),
  })
  .refine((c) => new Set(c.questions.map((q) => q.id)).size === c.questions.length, {
    message: 'Question ids must be unique',
    path: ['questions'],
  });
export type PollConfig = z.infer<typeof pollConfigSchema>;
export type PollConfigInput = z.input<typeof pollConfigSchema>;
export type PollQuestionConfig = PollConfig['questions'][number];

/** Durée estimée d'une manche (s) : questions et résultats, toutes questions comprises. */
export function pollDurationEstimateSeconds(config: PollConfig): number {
  return config.questions.reduce((acc, q) => acc + q.durationSeconds + config.resultsSeconds, 0);
}

// ─── Vues ────────────────────────────────────────────────

export const pollPhaseSchema = z.enum(['question', 'results', 'done']);
export type PollPhase = z.infer<typeof pollPhaseSchema>;

export const pollQuestionViewSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** Dans l'ordre de la configuration ; l'index donne la lettre et la couleur (A, B, C, D). */
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  /** Durée du vote (barre de temps) ; l'échéance est `endsAt`. */
  durationMs: z.number().int().positive(),
});
export type PollQuestionView = z.infer<typeof pollQuestionViewSchema>;

/** Votes d'une option (même ordre que `question.options`). */
export const pollOptionCountSchema = z.object({
  optionId: z.string(),
  votes: z.number().int().nonnegative(),
});
export type PollOptionCount = z.infer<typeof pollOptionCountSchema>;

const pollCommonFields = {
  /** Index (0-based) de la question courante (la dernière en `done`). */
  questionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  question: pollQuestionViewSchema,
  /** Échéance de la phase : fin du vote (`question`), question suivante ou fin (`results`). */
  endsAt: z.string().datetime().nullable(),
  /** Temps restant figé pendant une pause (remplace `endsAt`). */
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  /** Nombre de votes sur la question courante. */
  totalVotes: z.number().int().nonnegative(),
  /** Joueurs actifs de la manche (« N / M votes »). */
  totalPlayers: z.number().int().nonnegative(),
};

const pollCounts = { counts: z.array(pollOptionCountSchema) };

/**
 * Vue écran (audience `screen`) et vue console (audience `console`) : même forme. La répartition
 * (`counts`) n'apparaît qu'en `results` et `done` (résultats de la dernière question).
 */
export const pollScreenViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('question'), ...pollCommonFields }),
  z.object({ phase: z.literal('results'), ...pollCommonFields, ...pollCounts }),
  z.object({ phase: z.literal('done'), ...pollCommonFields, ...pollCounts }),
]);
export type PollScreenView = z.infer<typeof pollScreenViewSchema>;

export const pollConsoleViewSchema = pollScreenViewSchema;
export type PollConsoleView = PollScreenView;

/**
 * Vue d'un joueur : partie commune et `myVote` (son option pour la question courante, ou null).
 * En `results` et `done`, la répartition aussi (le joueur voit les pourcentages).
 */
const myVote = { myVote: z.string().nullable() };
export const pollMobileViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('question'), ...pollCommonFields, ...myVote }),
  z.object({ phase: z.literal('results'), ...pollCommonFields, ...myVote, ...pollCounts }),
  z.object({ phase: z.literal('done'), ...pollCommonFields, ...myVote, ...pollCounts }),
]);
export type PollMobileView = z.infer<typeof pollMobileViewSchema>;

// ─── Action (game:action) ────────────────────────────────

export const POLL_VOTE_ACTION = 'vote';

export const pollVoteActionSchema = z.object({
  type: z.literal(POLL_VOTE_ACTION),
  payload: z.object({ questionId: z.string().min(1), optionId: z.string().min(1) }),
});
export type PollVoteAction = z.infer<typeof pollVoteActionSchema>;

/** `result` de l'accusé d'un vote accepté. */
export const pollVoteResultSchema = z.object({ accepted: z.literal(true) });
export type PollVoteResult = z.infer<typeof pollVoteResultSchema>;

/** Points de participation : motif des ScoreEvent. */
export const POLL_PARTICIPATION_REASON = 'poll_participation';

/** Pourcentage arrondi de chaque option (0 sans vote). */
export function pollPercentages(counts: PollOptionCount[]): Map<string, number> {
  const total = counts.reduce((acc, c) => acc + c.votes, 0);
  return new Map(
    counts.map((c) => [c.optionId, total > 0 ? Math.round((c.votes / total) * 100) : 0]),
  );
}
