import { z } from 'zod';
import { prisma } from '../../../../shared/db/index.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import { computeScore } from '../../../../shared/scoring/scoring.service.js';
import { QUIZ_ENGINE_KEY } from '../../games.schemas.js';
import type {
  Audience,
  CancelTimer,
  GameAction,
  GameDefinition,
  GameEngine,
  GameRound,
  PlayerJoinInfo,
  RoundContext,
  RoundRestore,
  ScoreAward,
} from '../../engine.types.js';

export function getResultsDisplayMs(): number {
  return parseInt(process.env.RESULTS_DISPLAY_MS ?? '8000', 10);
}
export function getCountdownMs(): number {
  return parseInt(process.env.COUNTDOWN_MS ?? '3000', 10);
}
const TIMER_TOLERANCE_MS = 500;
const TIMER_BROADCAST_INTERVAL_MS = 1000;
const ANSWER_COUNT_FLUSH_MS = 250;

export interface QuizQuestion {
  id: bigint;
  position: number;
  text: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  pointsMax: number;
  pointsFloor: number;
  explanation: string | null;
  answers: { id: bigint; position: string; text: string; isCorrect: boolean }[];
}

interface InMemoryAnswer {
  playerId: bigint;
  answerId: bigint;
  timeToAnswerMs: number;
  receivedAt: number;
}

type QuizPhase = 'countdown' | 'question' | 'results' | 'done';

/** Partie moteur de session_rounds.state_json. Horodatages en ms epoch. */
const quizPersistedStateSchema = z.object({
  v: z.literal(1),
  phase: z.enum(['countdown', 'question', 'results', 'done']),
  questionIndex: z.number().int(),
  questionStartedAt: z.number().nullable(),
  pausedAt: z.number().nullable(),
});
type QuizPersistedState = z.infer<typeof quizPersistedStateSchema>;

/**
 * TEMPORAIRE (B2-B4, commit 1) : mémoire de la manche lue par `session-resume.service.ts` pour
 * construire les anciens snapshots. Disparaît au commit 2 avec `snapshot()`.
 */
export interface QuizLegacyMemory {
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  currentQuestionStartedAt: number | null;
  currentQuestionPausedAt: number | null;
  currentQuestionTimeLimitMs: number;
  questionEnded: boolean;
  resultsPhaseStartedAt: number | null;
}

const answerActionPayloadSchema = z.object({
  questionId: z.union([z.bigint(), z.string().regex(/^\d+$/)]),
  answerId: z.union([z.bigint(), z.string().regex(/^\d+$/)]),
});

export class QuizRound implements GameRound {
  private currentQuestionIndex = -1;
  private currentQuestionStartedAt: number | null = null;
  private currentQuestionPausedAt: number | null = null;
  private currentQuestionTimeLimitMs = 0;
  private questionEnded = false;
  /** Début de l'affichage des résultats (délai avant la question suivante). */
  private resultsPhaseStartedAt: number | null = null;
  private inMemoryAnswers = new Map<string, InMemoryAnswer>();
  /** Joueurs vus pendant la manche : leurs lignes player_answers sont réécrites à la clôture. */
  private knownPlayerIds = new Set<string>();
  /** Arrivés pendant la question en cours : ils attendent la suivante. */
  private lockedPlayerIds = new Set<string>();

  private started = false;
  private paused = false;
  private disposed = false;
  private finished = false;
  private countdownEndsAt: number | null = null;
  private countdownRemainingMs: number | null = null;

  private questionTimer: CancelTimer | null = null;
  private resultsTimer: CancelTimer | null = null;
  private broadcastTimer: CancelTimer | null = null;
  private answerCountFlush: CancelTimer | null = null;
  private countdownTimer: CancelTimer | null = null;

  constructor(
    private readonly ctx: RoundContext,
    private readonly questions: QuizQuestion[],
    /** undefined : nouvelle manche ; sinon reprise (state null = rien de persisté). */
    private restore: { state: QuizPersistedState | null } | undefined,
  ) {}

  // ---------------------------------------------------------------- cycle de vie

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.knownPlayerIds = new Set(this.ctx.players.ids());

    const restore = this.restore;
    this.restore = undefined;
    if (restore) {
      await this.startFromRestore(restore.state);
      return;
    }

    const countdownMs = getCountdownMs();
    await this.persist();
    if (this.disposed) return;
    if (this.paused) {
      this.countdownRemainingMs = countdownMs;
    } else {
      this.scheduleCountdown(countdownMs);
    }
  }

  /**
   * Règle de reprise après redémarrage du serveur : une question en cours est close et notée
   * avec les réponses déjà enregistrées, puis la partie s'enchaîne (sauf séance en pause, qui
   * attend la reprise).
   */
  private async startFromRestore(state: QuizPersistedState | null): Promise<void> {
    const phase: QuizPhase = state?.phase ?? 'countdown';

    if (phase === 'done') {
      await this.complete();
      return;
    }

    if (phase === 'countdown') {
      this.currentQuestionIndex = -1;
      if (this.paused) {
        this.countdownRemainingMs = 0;
        return;
      }
      await this.nextQuestion();
      return;
    }

    const idx = state!.questionIndex;
    const question = this.questions[idx];
    if (!question) {
      throw new AppError(
        `Cannot resolve quiz question index ${idx} on restore`,
        500,
        'QUIZ_RESTORE_INVALID_INDEX',
      );
    }
    this.currentQuestionIndex = idx;

    if (phase === 'question' && state!.questionStartedAt != null) {
      this.ctx.log.info('Force-ending question due to server restart');
      this.currentQuestionStartedAt = state!.questionStartedAt;
      this.currentQuestionPausedAt = state!.pausedAt;
      this.currentQuestionTimeLimitMs = question.timeLimitSeconds * 1000;
      this.questionEnded = false;
      await this.endQuestion(true, 'server-resume');
      return;
    }

    // Entre deux questions.
    this.questionEnded = true;
    if (!this.paused) await this.nextQuestion();
  }

  async pause(): Promise<void> {
    if (this.paused || this.disposed) return;
    this.paused = true;

    if (this.currentQuestionStartedAt && !this.currentQuestionPausedAt) {
      this.currentQuestionPausedAt = this.ctx.now();
    }
    if (this.countdownTimer && this.countdownEndsAt != null) {
      this.countdownRemainingMs = Math.max(0, this.countdownEndsAt - this.ctx.now());
    }
    // Un compte regroupé en attente serait perdu par cancelTimers : on l'émet tout de suite.
    if (this.answerCountFlush) {
      this.emitAnswerCount();
    }
    this.cancelTimers();

    if (this.started) await this.persist();
  }

  async resume(): Promise<void> {
    if (!this.paused || this.disposed) return;
    this.paused = false;

    if (this.currentQuestionPausedAt && this.currentQuestionStartedAt) {
      const pauseDuration = this.ctx.now() - this.currentQuestionPausedAt;
      this.currentQuestionStartedAt += pauseDuration;
      this.currentQuestionPausedAt = null;

      if (!this.questionEnded) {
        const elapsed = this.ctx.now() - this.currentQuestionStartedAt;
        const remaining = this.currentQuestionTimeLimitMs + TIMER_TOLERANCE_MS - elapsed;
        if (remaining > 0) {
          this.questionTimer = this.ctx.setTimer(remaining, () => {
            void this.endQuestion(false);
          });
        } else {
          void this.endQuestion(false);
        }
        this.startTimerBroadcast();
      }
    }

    if (
      this.questionEnded &&
      this.currentQuestionStartedAt === null &&
      this.currentQuestionIndex >= 0
    ) {
      if (this.currentQuestionIndex + 1 < this.questions.length) {
        this.scheduleNextQuestion();
      } else {
        // Dernière question close pendant la pause (reprise après redémarrage) : fin de manche.
        void this.complete();
      }
    }

    if (this.currentQuestionIndex === -1 && !this.questionEnded) {
      this.scheduleCountdown(this.countdownRemainingMs ?? getCountdownMs());
      this.countdownRemainingMs = null;
    }

    await this.persist();
  }

  async forceAdvance(): Promise<void> {
    if (this.questionEnded || this.currentQuestionStartedAt === null) return;
    await this.endQuestion(true);
  }

  onPlayerJoined(playerId: bigint, info: PlayerJoinInfo): void {
    const pid = playerId.toString();
    this.knownPlayerIds.add(pid);
    // Arrivé pendant cette question : il attend la suivante. Un joueur qui revient (reprise
    // après un départ) n'est pas une nouvelle arrivée.
    if (!info.rejoin && this.currentQuestionStartedAt !== null && !this.questionEnded) {
      this.lockedPlayerIds.add(pid);
    }
  }

  snapshot(_audience: Audience, _playerId?: bigint): unknown {
    // Vues complètes : commit 2. Les snapshots passent encore par legacyMemory().
    return {
      phase: this.phase(),
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimers();
  }

  legacyMemory(): QuizLegacyMemory {
    return {
      questions: this.questions,
      currentQuestionIndex: this.currentQuestionIndex,
      currentQuestionStartedAt: this.currentQuestionStartedAt,
      currentQuestionPausedAt: this.currentQuestionPausedAt,
      currentQuestionTimeLimitMs: this.currentQuestionTimeLimitMs,
      questionEnded: this.questionEnded,
      resultsPhaseStartedAt: this.resultsPhaseStartedAt,
    };
  }

  // ---------------------------------------------------------------- actions

  async onAction(playerId: bigint, action: GameAction): Promise<unknown> {
    if (action.type !== 'answer') {
      throw new AppError(`Unknown action: ${action.type}`, 400, 'UNKNOWN_ACTION');
    }
    const parsed = answerActionPayloadSchema.safeParse(action.payload);
    if (!parsed.success) {
      throw new AppError('Invalid answer payload', 400, 'VALIDATION_ERROR');
    }
    const questionId = BigInt(parsed.data.questionId);
    const answerId = BigInt(parsed.data.answerId);

    // Tous les contrôles et la réservation sont synchrones : aucun await entre le test
    // et l'écriture en mémoire, donc deux envois simultanés ne peuvent pas passer tous les deux.
    if (this.questionEnded || this.finished || this.disposed) {
      throw new AppError('Question already ended', 409, 'QUESTION_ALREADY_ENDED');
    }

    if (this.paused || this.currentQuestionPausedAt != null) {
      throw new AppError('Session is paused', 409, 'SESSION_PAUSED');
    }

    const currentQuestion = this.questions[this.currentQuestionIndex];
    if (!currentQuestion || currentQuestion.id !== questionId) {
      throw new AppError('Wrong question', 400, 'WRONG_QUESTION');
    }

    const pid = playerId.toString();
    const meta = this.ctx.players.meta(pid);
    if (!meta) {
      throw new AppError('Player not in session', 403, 'PLAYER_NOT_IN_SESSION');
    }

    if (this.lockedPlayerIds.has(pid)) {
      throw new AppError('Cannot answer current question after late join', 403, 'LATE_JOIN_LOCKED');
    }

    const answerExists = currentQuestion.answers.some((a) => a.id === answerId);
    if (!answerExists) {
      throw new AppError('Invalid answer', 400, 'INVALID_ANSWER');
    }

    if (this.inMemoryAnswers.has(pid)) {
      throw new AppError('Already answered', 409, 'ALREADY_ANSWERED');
    }

    const receivedAt = this.ctx.now();
    const timeToAnswerMs = Math.max(1, receivedAt - (this.currentQuestionStartedAt ?? receivedAt));

    this.inMemoryAnswers.set(pid, { playerId, answerId, timeToAnswerMs, receivedAt });

    // Persistance après réservation. En cas d'échec, la réponse en mémoire fait foi
    // (endQuestion réécrit les lignes de la question).
    try {
      await prisma.playerAnswer.upsert({
        where: { playerId_questionId: { playerId, questionId } },
        create: {
          playerId,
          questionId,
          chosenAnswerId: answerId,
          answeredAtServer: new Date(receivedAt),
          timeToAnswerMs,
          pointsAwarded: 0,
          isCorrect: false,
        },
        update: {
          chosenAnswerId: answerId,
          answeredAtServer: new Date(receivedAt),
          timeToAnswerMs,
          pointsAwarded: 0,
          isCorrect: false,
        },
      });
    } catch (err) {
      this.ctx.log.error(
        { err, playerId: pid, questionId: questionId.toString() },
        'Persisting player answer failed (kept in memory)',
      );
    }

    // La question a pu être close pendant l'écriture (fin, abandon) : pas de flush alors,
    // endQuestion émet lui-même le compte final.
    if (!this.questionEnded && !this.disposed) {
      this.scheduleAnswerCountFlush();
    }

    // Cue écran cinéma : pseudo éphémère + petit son. Jamais la réponse choisie,
    // pour ne pas divulguer d'information avant la clôture de la question.
    if (!this.disposed) {
      this.ctx.legacy.toScreen('session:player_answered', {
        playerId: pid,
        pseudo: meta.pseudo,
        avatarUrl: meta.avatarUrl,
        answeredCount: this.inMemoryAnswers.size,
      });
    }

    return { timeToAnswerMs };
  }

  // ---------------------------------------------------------------- questions

  private scheduleCountdown(ms: number): void {
    this.countdownEndsAt = this.ctx.now() + ms;
    this.countdownTimer = this.ctx.setTimer(ms, () => {
      this.countdownTimer = null;
      this.countdownEndsAt = null;
      void this.nextQuestion();
    });
  }

  private scheduleNextQuestion(): void {
    const displayMs = getResultsDisplayMs();
    this.ctx.legacy.broadcast('session:next_question_in', { ms: displayMs });
    this.resultsPhaseStartedAt = this.ctx.now();
    this.resultsTimer = this.ctx.setTimer(displayMs, () => {
      this.resultsTimer = null;
      void this.nextQuestion();
    });
  }

  private async nextQuestion(): Promise<void> {
    if (this.disposed || this.finished) return;
    this.cancelTimers();
    this.currentQuestionIndex += 1;

    if (this.currentQuestionIndex >= this.questions.length) {
      await this.complete();
      return;
    }

    const question = this.questions[this.currentQuestionIndex]!;
    this.currentQuestionStartedAt = this.ctx.now();
    this.currentQuestionPausedAt = null;
    this.currentQuestionTimeLimitMs = question.timeLimitSeconds * 1000;
    this.inMemoryAnswers = new Map();
    this.lockedPlayerIds = new Set();
    this.questionEnded = false;
    this.resultsPhaseStartedAt = null;
    const startedAt = this.currentQuestionStartedAt;

    await this.ctx.reportProgress(question.position);
    await this.persist();
    if (this.disposed) return;

    this.ctx.legacy.broadcast('session:question_started', {
      questionId: question.id.toString(),
      questionPosition: question.position,
      questionText: question.text,
      questionImageUrl: question.imageUrl,
      answers: question.answers.map((a) => ({
        id: a.id.toString(),
        position: a.position,
        text: a.text,
      })),
      timeLimitMs: this.currentQuestionTimeLimitMs,
      startedAt: new Date(startedAt).toISOString(),
    });

    // Mis en pause pendant les écritures : resume() reposera les minuteurs.
    if (!this.paused && !this.questionEnded) {
      this.questionTimer = this.ctx.setTimer(
        this.currentQuestionTimeLimitMs + TIMER_TOLERANCE_MS,
        () => {
          this.questionTimer = null;
          void this.endQuestion(false);
        },
      );
      this.startTimerBroadcast();
    }

    this.ctx.log.info({ questionPosition: question.position }, 'Question started');
  }

  private async endQuestion(forced: boolean, reason?: string): Promise<void> {
    if (this.questionEnded || this.disposed) return;
    this.questionEnded = true;
    this.cancelTimers();

    const question = this.questions[this.currentQuestionIndex];
    if (!question) return;

    const correctAnswer = question.answers.find((a) => a.isCorrect);
    const correctAnswerId = correctAnswer?.id ?? null;

    const allPlayerIds = [...this.knownPlayerIds];
    const answersMap = this.inMemoryAnswers;
    const totalTimeMs = question.timeLimitSeconds * 1000;

    const playerAnswerRows: {
      playerId: bigint;
      questionId: bigint;
      chosenAnswerId: bigint | null;
      answeredAtServer: Date | null;
      timeToAnswerMs: number | null;
      pointsAwarded: number;
      isCorrect: boolean;
    }[] = [];
    const awards: ScoreAward[] = [];
    const scoreboardEntries: {
      playerId: string;
      pseudo: string;
      avatarUrl: string | null;
      scoreTotal: number;
      scoreThisQuestion: number;
    }[] = [];

    // Joueurs encore actifs dans la manche (un joueur exclu ou parti n'est pas noté).
    const scores = await this.ctx.scores();

    const dbAnswersForQuestion =
      allPlayerIds.length > 0
        ? await prisma.playerAnswer.findMany({
            where: {
              questionId: question.id,
              playerId: { in: allPlayerIds.map((id) => BigInt(id)) },
            },
          })
        : [];
    const dbByPlayer = new Map(dbAnswersForQuestion.map((a) => [a.playerId.toString(), a]));

    for (const pid of allPlayerIds) {
      const mem = answersMap.get(pid);
      const dbRow = dbByPlayer.get(pid);
      const submitted: InMemoryAnswer | undefined =
        mem ??
        (dbRow?.chosenAnswerId
          ? {
              playerId: BigInt(pid),
              answerId: dbRow.chosenAnswerId,
              timeToAnswerMs: dbRow.timeToAnswerMs ?? 0,
              receivedAt: dbRow.answeredAtServer?.getTime() ?? this.ctx.now(),
            }
          : undefined);

      const scoreTotal = scores.get(pid);
      const meta = this.ctx.players.meta(pid);
      if (scoreTotal === undefined || !meta) continue;

      if (submitted) {
        const isCorrect = correctAnswerId !== null && submitted.answerId === correctAnswerId;
        const points = computeScore({
          isCorrect,
          timeToAnswerMs: submitted.timeToAnswerMs,
          totalTimeMs,
          pointsMax: question.pointsMax,
          pointsFloor: question.pointsFloor,
        });

        playerAnswerRows.push({
          playerId: submitted.playerId,
          questionId: question.id,
          chosenAnswerId: submitted.answerId,
          answeredAtServer: new Date(submitted.receivedAt),
          timeToAnswerMs: submitted.timeToAnswerMs,
          pointsAwarded: points,
          isCorrect,
        });

        if (points > 0) {
          awards.push({
            playerId: submitted.playerId,
            points,
            reason: 'quiz_answer',
            meta: {
              questionId: question.id.toString(),
              timeToAnswerMs: submitted.timeToAnswerMs,
            },
          });
        }

        scoreboardEntries.push({
          playerId: pid,
          pseudo: meta.pseudo,
          avatarUrl: meta.avatarUrl,
          scoreTotal: scoreTotal + points,
          scoreThisQuestion: points,
        });
      } else {
        playerAnswerRows.push({
          playerId: BigInt(pid),
          questionId: question.id,
          chosenAnswerId: null,
          answeredAtServer: null,
          timeToAnswerMs: null,
          pointsAwarded: 0,
          isCorrect: false,
        });

        scoreboardEntries.push({
          playerId: pid,
          pseudo: meta.pseudo,
          avatarUrl: meta.avatarUrl,
          scoreTotal,
          scoreThisQuestion: 0,
        });
      }
    }

    // `questionId` seul supprimerait les réponses de toutes les sessions partageant ce quiz.
    if (allPlayerIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.playerAnswer.deleteMany({
          where: {
            questionId: question.id,
            playerId: { in: allPlayerIds.map((id) => BigInt(id)) },
          },
        });
        if (playerAnswerRows.length > 0) {
          await tx.playerAnswer.createMany({ data: playerAnswerRows });
        }
      });
    }

    // Une seule transaction (plateforme) : Player.scoreTotal + ScoreEvent.
    if (awards.length > 0) {
      await this.ctx.award(awards);
    }

    scoreboardEntries.sort((a, b) => b.scoreTotal - a.scoreTotal);

    this.currentQuestionStartedAt = null;
    this.currentQuestionPausedAt = null;
    await this.persist();
    if (this.disposed) return;

    // Dernier compte exact (le flush regroupé a été annulé par cancelTimers).
    this.emitAnswerCount();

    this.ctx.legacy.broadcast('session:question_ended', {
      correctAnswerId: correctAnswerId?.toString() ?? null,
      explanationText: question.explanation,
      scoreboard: scoreboardEntries,
    });

    this.ctx.log.info(
      { questionPosition: question.position, forced, reason: reason ?? null },
      'Question ended',
    );

    const hasNext = this.currentQuestionIndex + 1 < this.questions.length;
    if (!hasNext) {
      await this.complete();
      return;
    }
    // En pause (reprise d'une séance en pause, clôture forcée) : resume() enchaînera.
    if (!this.paused) this.scheduleNextQuestion();
  }

  /** Fin de manche : un seul appel à ctx.finish(). */
  private async complete(): Promise<void> {
    if (this.finished || this.disposed) return;
    this.finished = true;
    this.cancelTimers();
    await this.persist();
    await this.ctx.finish();
  }

  // ---------------------------------------------------------------- émissions

  private emitAnswerCount(): void {
    this.ctx.legacy.broadcast('session:answer_submitted_count', {
      count: this.inMemoryAnswers.size,
      total: this.ctx.players.ids().length,
    });
  }

  /** Regroupe les émissions du compteur de réponses (au plus une toutes les 250 ms). */
  private scheduleAnswerCountFlush(): void {
    if (this.answerCountFlush) return;
    this.answerCountFlush = this.ctx.setTimer(ANSWER_COUNT_FLUSH_MS, () => {
      this.answerCountFlush = null;
      if (!this.disposed) this.emitAnswerCount();
    });
  }

  private startTimerBroadcast(): void {
    const tick = () => {
      this.broadcastTimer = null;
      if (this.disposed || !this.currentQuestionStartedAt || this.currentQuestionPausedAt) return;
      const elapsed = this.ctx.now() - this.currentQuestionStartedAt;
      const remaining = Math.max(0, this.currentQuestionTimeLimitMs - elapsed);
      this.ctx.legacy.broadcast('session:timer_update', { remainingMs: remaining });
      if (remaining > 0) {
        this.broadcastTimer = this.ctx.setTimer(TIMER_BROADCAST_INTERVAL_MS, tick);
      }
    };
    this.broadcastTimer = this.ctx.setTimer(TIMER_BROADCAST_INTERVAL_MS, tick);
  }

  // ---------------------------------------------------------------- outils

  private phase(): QuizPhase {
    if (this.finished) return 'done';
    if (this.currentQuestionIndex < 0) return 'countdown';
    if (!this.questionEnded && this.currentQuestionStartedAt !== null) return 'question';
    return 'results';
  }

  private async persist(): Promise<void> {
    const state: QuizPersistedState = {
      v: 1,
      phase: this.phase(),
      questionIndex: this.currentQuestionIndex,
      questionStartedAt: this.currentQuestionStartedAt,
      pausedAt: this.currentQuestionPausedAt,
    };
    try {
      await this.ctx.persistState(state);
    } catch (err) {
      this.ctx.log.error({ err }, 'Persisting quiz round state failed');
    }
  }

  private cancelTimers(): void {
    for (const cancel of [
      this.questionTimer,
      this.resultsTimer,
      this.broadcastTimer,
      this.answerCountFlush,
      this.countdownTimer,
    ]) {
      cancel?.();
    }
    this.questionTimer = null;
    this.resultsTimer = null;
    this.broadcastTimer = null;
    this.answerCountFlush = null;
    this.countdownTimer = null;
    this.countdownEndsAt = null;
    this.resultsPhaseStartedAt = null;
  }
}

function parsePersistedState(json: unknown): QuizPersistedState | null {
  if (json == null) return null;
  const parsed = quizPersistedStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('Invalid quiz round state', 500, 'QUIZ_RESTORE_INVALID_STATE');
  }
  return parsed.data;
}

export const quizEngine: GameEngine = {
  key: QUIZ_ENGINE_KEY,

  async createRound(ctx: RoundContext, game: GameDefinition, restore?: RoundRestore) {
    if (game.quizId === null) {
      throw new AppError('Quiz game has no quiz', 500, 'GAME_QUIZ_MISSING');
    }
    const rows = await prisma.question.findMany({
      where: { quizId: game.quizId },
      include: { answers: true },
      orderBy: { position: 'asc' },
    });
    if (rows.length === 0) {
      throw new AppError('Quiz has no questions', 400, 'QUIZ_EMPTY');
    }
    const questions: QuizQuestion[] = rows.map((q) => ({
      id: q.id,
      position: q.position,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitSeconds: q.timeLimitSeconds,
      pointsMax: q.pointsMax,
      pointsFloor: q.pointsFloor,
      explanation: q.explanation,
      answers: q.answers.map((a) => ({
        id: a.id,
        position: String(a.position),
        text: a.text,
        isCorrect: a.isCorrect,
      })),
    }));
    return new QuizRound(
      ctx,
      questions,
      restore ? { state: parsePersistedState(restore.stateJson) } : undefined,
    );
  },
};
