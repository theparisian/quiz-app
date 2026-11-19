import { z } from 'zod';

/**
 * Moteur quiz : vues (`game:state.view`), actions (`game:action`) et cues (`game:cue`).
 *
 * Règles du protocole (rappel) :
 * - une vue est complète : le client remplace la sienne, il ne fusionne jamais ;
 * - le temps passe par des échéances : `endsAt` (ISO) pendant que le temps court,
 *   `pausedRemainingMs` à la place pendant une pause, les deux à null quand la phase n'a pas
 *   d'échéance (révélation de la dernière question, fin) ;
 * - la bonne réponse n'apparaît dans aucune vue avant la phase `reveal`, et une vue mobile ne
 *   contient jamais la réponse d'un autre joueur.
 */

export const QUIZ_ENGINE_KEY = 'quiz';

/** Le cue `last_seconds` part à cette distance de l'échéance de la question. */
export const QUIZ_LAST_SECONDS_MS = 5000;

export const quizPhaseSchema = z.enum(['countdown', 'question', 'reveal', 'done']);
export type QuizPhase = z.infer<typeof quizPhaseSchema>;

export const quizAnswerViewSchema = z.object({
  id: z.string(),
  /** 'A' | 'B' | 'C' | 'D' */
  position: z.string(),
  text: z.string(),
});

export const quizQuestionViewSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  text: z.string(),
  imageUrl: z.string().nullable(),
  /** Durée totale de la question (barre de temps) ; l'échéance est `endsAt`. */
  timeLimitMs: z.number().int().nonnegative(),
  answers: z.array(quizAnswerViewSchema),
});

/** Ligne de classement d'une révélation, triée par score total décroissant. */
export const quizScoreEntrySchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable(),
  scoreTotal: z.number().int(),
  scoreThisQuestion: z.number().int(),
  rank: z.number().int().positive(),
});

const quizCommonFields = {
  /** Index (0-based) de la question courante ; -1 pendant le compte à rebours initial. */
  questionIndex: z.number().int(),
  totalQuestions: z.number().int().nonnegative(),
  /** Échéance de la phase en cours (fin du compte à rebours, de la question, de la révélation). */
  endsAt: z.string().datetime().nullable(),
  /** Temps restant figé pendant une pause (remplace `endsAt`). */
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  answeredCount: z.number().int().nonnegative(),
  totalPlayers: z.number().int().nonnegative(),
};

const countdownFields = { phase: z.literal('countdown'), ...quizCommonFields, question: z.null() };
const questionFields = {
  phase: z.literal('question'),
  ...quizCommonFields,
  question: quizQuestionViewSchema,
};
const revealFields = {
  phase: z.literal('reveal'),
  ...quizCommonFields,
  question: quizQuestionViewSchema,
  correctAnswerId: z.string().nullable(),
  explanation: z.string().nullable(),
  /** Début de la révélation : les clients y calent leurs animations (reveal puis classement). */
  revealedAt: z.string().datetime(),
};
const doneFields = { phase: z.literal('done'), ...quizCommonFields, question: z.null() };

// ─── Écran cinéma et console ─────────────────────────────

/**
 * Vue écran (audience `screen`) et vue console (audience `console`) : même forme. En `reveal`,
 * `scoreboard` contient les 5 premiers pour l'écran, tous les joueurs pour la console.
 */
export const quizScreenViewSchema = z.discriminatedUnion('phase', [
  z.object(countdownFields),
  z.object(questionFields),
  z.object({ ...revealFields, scoreboard: z.array(quizScoreEntrySchema) }),
  z.object(doneFields),
]);
export type QuizScreenView = z.infer<typeof quizScreenViewSchema>;

export const quizConsoleViewSchema = quizScreenViewSchema;
export type QuizConsoleView = QuizScreenView;

/** Nombre de lignes de classement dans la vue écran. */
export const QUIZ_SCREEN_SCOREBOARD_SIZE = 5;

// ─── Mobile (une vue par joueur) ─────────────────────────

export const quizMobileResultSchema = z.object({
  isCorrect: z.boolean(),
  points: z.number().int().nonnegative(),
  /** Rang après la question, parmi les joueurs notés. */
  rank: z.number().int().positive().nullable(),
  scoreTotal: z.number().int(),
});

export const quizMobileMeSchema = z.object({
  /** Réponse de CE joueur à la question courante (jamais celle d'un autre). */
  answerId: z.string().nullable(),
  /** Arrivé pendant cette question : il attend la suivante. */
  locked: z.boolean(),
  /** Résultat de la question, en `reveal` seulement (null s'il était bloqué). */
  result: quizMobileResultSchema.nullable(),
});

export const quizMobileViewSchema = z.discriminatedUnion('phase', [
  z.object({ ...countdownFields, me: quizMobileMeSchema }),
  z.object({ ...questionFields, me: quizMobileMeSchema }),
  z.object({ ...revealFields, me: quizMobileMeSchema }),
  z.object({ ...doneFields, me: quizMobileMeSchema }),
]);
export type QuizMobileView = z.infer<typeof quizMobileViewSchema>;
export type QuizMobileMe = z.infer<typeof quizMobileMeSchema>;

export type QuizQuestionView = z.infer<typeof quizQuestionViewSchema>;
export type QuizScoreEntry = z.infer<typeof quizScoreEntrySchema>;

// ─── Actions (game:action) ───────────────────────────────

export const quizAnswerActionSchema = z.object({
  type: z.literal('answer'),
  payload: z.object({
    questionId: z.string().regex(/^\d+$/),
    answerId: z.string().regex(/^\d+$/),
  }),
});
export type QuizAnswerAction = z.infer<typeof quizAnswerActionSchema>;

/** `result` de l'accusé d'une action `answer` acceptée. */
export const quizAnswerResultSchema = z.object({ timeToAnswerMs: z.number().int().positive() });
export type QuizAnswerResult = z.infer<typeof quizAnswerResultSchema>;

// ─── Cues (game:cue, écran cinéma seulement) ─────────────

export const QUIZ_CUES = {
  /** Ouverture d'une question (le son `questionStart` se déduit aussi du passage en `question`). */
  questionOpened: 'question_opened',
  /** Dernières secondes ; part `QUIZ_LAST_SECONDS_MS` avant `endsAt`, jamais pendant une pause. */
  lastSeconds: 'last_seconds',
  /** Clôture d'une question (le son `questionEnd` se déduit aussi du passage en `reveal`). */
  questionClosed: 'question_closed',
  /** Un joueur vient de répondre : pseudo et avatar, jamais la réponse choisie. */
  playerAnswered: 'player_answered',
} as const;
export type QuizCue = (typeof QUIZ_CUES)[keyof typeof QUIZ_CUES];

export const quizQuestionOpenedCueSchema = z.object({
  questionIndex: z.number().int(),
  answerCount: z.number().int(),
});
export const quizLastSecondsCueSchema = z.object({ questionIndex: z.number().int() });
export const quizQuestionClosedCueSchema = z.object({ questionIndex: z.number().int() });
export const quizPlayerAnsweredCueSchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable(),
});
export type QuizPlayerAnsweredCue = z.infer<typeof quizPlayerAnsweredCueSchema>;
