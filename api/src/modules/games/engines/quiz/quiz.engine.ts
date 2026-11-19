import { z } from 'zod';
import {
  QUIZ_CUES,
  QUIZ_LAST_SECONDS_MS,
  QUIZ_SCREEN_SCOREBOARD_SIZE,
  type QuizMobileMe,
  type QuizMobileView,
  type QuizQuestionView,
  type QuizScoreEntry,
  type QuizScreenView,
} from '@quiz-app/validation';
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
/** Délai de grâce après l'échéance affichée avant de clore la question (latence réseau). */
const TIMER_TOLERANCE_MS = 500;
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

/** Phase interne (persistée). La vue renomme `results` en `reveal`. */
type QuizInternalPhase = 'countdown' | 'question' | 'results' | 'done';

/** Partie moteur de session_rounds.state_json. Horodatages en ms epoch. */
const quizPersistedStateSchema = z.object({
  v: z.literal(1),
  phase: z.enum(['countdown', 'question', 'results', 'done']),
  questionIndex: z.number().int(),
  questionStartedAt: z.number().nullable(),
  pausedAt: z.number().nullable(),
});
type QuizPersistedState = z.infer<typeof quizPersistedStateSchema>;

/** Résultat d'une question, calculé à la clôture ; sert aux vues `reveal`. */
interface QuizReveal {
  questionIndex: number;
  correctAnswerId: string | null;
  explanation: string | null;
  revealedAt: number;
  answeredCount: number;
  /** Tous les joueurs notés, triés (rang = index + 1). */
  scoreboard: QuizScoreEntry[];
  /** Par joueur noté : sa réponse et son résultat. */
  byPlayer: Map<string, { answerId: string | null; result: NonNullable<QuizMobileMe['result']> }>;
}

const answerActionPayloadSchema = z.object({
  questionId: z.union([z.bigint(), z.string().regex(/^\d+$/)]),
  answerId: z.union([z.bigint(), z.string().regex(/^\d+$/)]),
});

/** Partie commune des vues, sans `phase` ni `question` (posés par la vue). */
type QuizCommon = Pick<
  QuizScreenView,
  | 'questionIndex'
  | 'totalQuestions'
  | 'endsAt'
  | 'pausedRemainingMs'
  | 'answeredCount'
  | 'totalPlayers'
>;

export class QuizRound implements GameRound {
  private currentQuestionIndex = -1;
  private currentQuestionStartedAt: number | null = null;
  private currentQuestionPausedAt: number | null = null;
  private currentQuestionTimeLimitMs = 0;
  private questionEnded = false;
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
  /** Échéance de l'affichage des résultats (question suivante), ms epoch. */
  private resultsEndsAt: number | null = null;
  /** Résultat de la dernière question close (vue `reveal` quand son index est le courant). */
  private reveal: QuizReveal | null = null;

  private questionTimer: CancelTimer | null = null;
  private resultsTimer: CancelTimer | null = null;
  private lastSecondsTimer: CancelTimer | null = null;
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
    this.emitAll();
  }

  /**
   * Règle de reprise après redémarrage du serveur : une question en cours est close et notée
   * avec les réponses déjà enregistrées, puis la partie s'enchaîne (sauf séance en pause, qui
   * attend la reprise).
   */
  private async startFromRestore(state: QuizPersistedState | null): Promise<void> {
    const phase: QuizInternalPhase = state?.phase ?? 'countdown';

    if (phase === 'done') {
      await this.complete();
      return;
    }

    if (phase === 'countdown') {
      this.currentQuestionIndex = -1;
      if (this.paused) {
        this.countdownRemainingMs = 0;
        this.emitAll();
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
    this.currentQuestionTimeLimitMs = question.timeLimitSeconds * 1000;

    if (phase === 'question' && state!.questionStartedAt != null) {
      this.ctx.log.info('Force-ending question due to server restart');
      this.currentQuestionStartedAt = state!.questionStartedAt;
      this.currentQuestionPausedAt = state!.pausedAt;
      this.questionEnded = false;
      await this.endQuestion(true, 'server-resume');
      return;
    }

    // Entre deux questions : la suite s'enchaîne. En pause, la révélation de la question close
    // reste affichée : son classement n'est plus en mémoire, on le recalcule depuis
    // player_answers (aucune nouvelle note).
    this.questionEnded = true;
    if (!this.paused) {
      await this.nextQuestion();
      return;
    }
    await this.rebuildReveal(question);
    if (!this.disposed) this.emitAll();
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
    this.cancelTimers();

    if (!this.started) return;
    // Vues complètes : le temps restant figé remplace l'échéance (et le compte en attente
    // de regroupement part avec).
    this.emitAll();
    await this.persist();
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
            this.questionTimer = null;
            void this.endQuestion(false);
          });
          this.scheduleLastSeconds(this.currentQuestionTimeLimitMs - elapsed);
        } else {
          void this.endQuestion(false);
        }
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

    if (!this.finished) this.emitAll();
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
    if (!this.started || this.disposed || this.finished) return;
    // Sa vue (bloqué ou non) ; le nombre de joueurs de l'écran suit au prochain regroupement.
    this.ctx.emitState('mobile', this.mobileView(pid), playerId);
    this.scheduleAnswerCountFlush();
  }

  snapshot(audience: Audience, playerId?: bigint): unknown {
    if (audience === 'mobile') return this.mobileView(playerId?.toString() ?? null);
    return this.screenView(audience === 'console');
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimers();
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

    // Émissions synchrones, juste après la réservation : la vue du joueur (sa réponse), le
    // compteur regroupé de l'écran et de la console, le cue écran (pseudo et avatar, jamais la
    // réponse choisie). Émises avant tout await, elles ne peuvent pas suivre la révélation.
    this.ctx.emitState('mobile', this.mobileView(pid), playerId);
    this.scheduleAnswerCountFlush();
    this.ctx.emitCue('screen', QUIZ_CUES.playerAnswered, {
      playerId: pid,
      pseudo: meta.pseudo,
      avatarUrl: meta.avatarUrl,
    });

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
    this.resultsEndsAt = this.ctx.now() + displayMs;
    this.resultsTimer = this.ctx.setTimer(displayMs, () => {
      this.resultsTimer = null;
      void this.nextQuestion();
    });
  }

  /** Cue « dernières secondes », `QUIZ_LAST_SECONDS_MS` avant l'échéance affichée. */
  private scheduleLastSeconds(displayRemainingMs: number): void {
    const delay = displayRemainingMs - QUIZ_LAST_SECONDS_MS;
    if (delay <= 0) return;
    const questionIndex = this.currentQuestionIndex;
    this.lastSecondsTimer = this.ctx.setTimer(delay, () => {
      this.lastSecondsTimer = null;
      if (this.disposed || this.questionEnded) return;
      this.ctx.emitCue('screen', QUIZ_CUES.lastSeconds, { questionIndex });
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

    await this.ctx.reportProgress(question.position);
    await this.persist();
    if (this.disposed) return;

    // Mis en pause pendant les écritures : resume() reposera les minuteurs.
    if (!this.paused && !this.questionEnded) {
      this.questionTimer = this.ctx.setTimer(
        this.currentQuestionTimeLimitMs + TIMER_TOLERANCE_MS,
        () => {
          this.questionTimer = null;
          void this.endQuestion(false);
        },
      );
      this.scheduleLastSeconds(this.currentQuestionTimeLimitMs);
    }

    this.emitAll();
    this.ctx.emitCue('screen', QUIZ_CUES.questionOpened, {
      questionIndex: this.currentQuestionIndex,
      answerCount: question.answers.length,
    });

    this.ctx.log.info({ questionPosition: question.position }, 'Question started');
  }

  private async endQuestion(forced: boolean, reason?: string): Promise<void> {
    if (this.questionEnded || this.disposed) return;
    this.questionEnded = true;
    this.cancelTimers();
    const closeStartedAt = Date.now();

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
    const graded: {
      pid: string;
      pseudo: string;
      avatarUrl: string | null;
      scoreTotal: number;
      points: number;
      isCorrect: boolean;
      answerId: string | null;
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

        graded.push({
          pid,
          pseudo: meta.pseudo,
          avatarUrl: meta.avatarUrl,
          scoreTotal: scoreTotal + points,
          points,
          isCorrect,
          answerId: submitted.answerId.toString(),
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

        graded.push({
          pid,
          pseudo: meta.pseudo,
          avatarUrl: meta.avatarUrl,
          scoreTotal,
          points: 0,
          isCorrect: false,
          answerId: null,
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

    this.reveal = buildReveal(
      this.currentQuestionIndex,
      question,
      graded,
      playerAnswerRows.filter((r) => r.chosenAnswerId !== null).length,
      this.ctx.now(),
    );

    this.currentQuestionStartedAt = null;
    this.currentQuestionPausedAt = null;
    await this.persist();
    if (this.disposed) return;

    const hasNext = this.currentQuestionIndex + 1 < this.questions.length;
    // En pause (reprise d'une séance en pause, clôture forcée) : resume() enchaînera.
    if (hasNext && !this.paused) this.scheduleNextQuestion();

    this.emitAll();
    this.ctx.emitCue('screen', QUIZ_CUES.questionClosed, {
      questionIndex: this.currentQuestionIndex,
    });

    this.ctx.log.info(
      {
        questionPosition: question.position,
        forced,
        reason: reason ?? null,
        players: allPlayerIds.length,
        closeMs: Date.now() - closeStartedAt,
      },
      'Question ended',
    );

    if (!hasNext) await this.complete();
  }

  /**
   * Reprise entre deux questions : reconstitue la révélation de la question close depuis
   * player_answers et les scores actuels (rien n'est noté de nouveau).
   */
  private async rebuildReveal(question: QuizQuestion): Promise<void> {
    const scores = await this.ctx.scores();
    const rows = await prisma.playerAnswer.findMany({
      where: {
        questionId: question.id,
        playerId: { in: [...scores.keys()].map((id) => BigInt(id)) },
      },
    });
    const byPlayer = new Map(rows.map((r) => [r.playerId.toString(), r]));
    const graded = [];
    for (const [pid, scoreTotal] of scores) {
      const meta = this.ctx.players.meta(pid);
      if (!meta) continue;
      const row = byPlayer.get(pid);
      graded.push({
        pid,
        pseudo: meta.pseudo,
        avatarUrl: meta.avatarUrl,
        scoreTotal,
        points: row?.pointsAwarded ?? 0,
        isCorrect: row?.isCorrect ?? false,
        answerId: row?.chosenAnswerId?.toString() ?? null,
      });
    }
    this.reveal = buildReveal(
      this.currentQuestionIndex,
      question,
      graded,
      rows.filter((r) => r.chosenAnswerId !== null).length,
      this.ctx.now(),
    );
  }

  /** Fin de manche : un seul appel à ctx.finish(). */
  private async complete(): Promise<void> {
    if (this.finished || this.disposed) return;
    this.finished = true;
    this.cancelTimers();
    await this.persist();
    if (this.started && !this.disposed) this.emitAll();
    await this.ctx.finish();
  }

  // ---------------------------------------------------------------- vues

  /** Phase affichée. Pendant la notation d'une question close, la vue reste `question`. */
  private viewPhase(): QuizScreenView['phase'] {
    if (this.finished) return 'done';
    if (this.currentQuestionIndex < 0) return 'countdown';
    if (this.reveal?.questionIndex === this.currentQuestionIndex && this.questionEnded) {
      return 'reveal';
    }
    return 'question';
  }

  private iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  private timing(phase: QuizScreenView['phase']): Pick<QuizCommon, 'endsAt' | 'pausedRemainingMs'> {
    const none = { endsAt: null, pausedRemainingMs: null };
    if (phase === 'countdown') {
      if (this.paused) return { endsAt: null, pausedRemainingMs: this.countdownRemainingMs ?? 0 };
      return this.countdownEndsAt != null
        ? { ...none, endsAt: this.iso(this.countdownEndsAt) }
        : none;
    }
    if (phase === 'question') {
      const startedAt = this.currentQuestionStartedAt;
      if (startedAt === null) return none;
      if (this.currentQuestionPausedAt != null) {
        const remaining =
          this.currentQuestionTimeLimitMs - (this.currentQuestionPausedAt - startedAt);
        return { endsAt: null, pausedRemainingMs: Math.max(0, remaining) };
      }
      return { ...none, endsAt: this.iso(startedAt + this.currentQuestionTimeLimitMs) };
    }
    if (phase === 'reveal') {
      const hasNext = this.currentQuestionIndex + 1 < this.questions.length;
      if (!hasNext) return none;
      // En pause, la reprise relance l'affichage des résultats en entier.
      if (this.paused) return { endsAt: null, pausedRemainingMs: getResultsDisplayMs() };
      return this.resultsEndsAt != null ? { ...none, endsAt: this.iso(this.resultsEndsAt) } : none;
    }
    return none;
  }

  private questionView(): QuizQuestionView | null {
    const q = this.questions[this.currentQuestionIndex];
    if (!q) return null;
    return {
      id: q.id.toString(),
      position: q.position,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitMs: q.timeLimitSeconds * 1000,
      // Jamais `isCorrect` : la bonne réponse n'apparaît qu'en `reveal` (correctAnswerId).
      answers: q.answers.map((a) => ({ id: a.id.toString(), position: a.position, text: a.text })),
    };
  }

  private common(phase: QuizScreenView['phase']): QuizCommon {
    const answeredCount =
      phase === 'reveal'
        ? (this.reveal?.answeredCount ?? 0)
        : phase === 'question'
          ? this.inMemoryAnswers.size
          : 0;
    return {
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
      ...this.timing(phase),
      answeredCount,
      totalPlayers: this.ctx.players.ids().length,
    };
  }

  /** Vue écran (5 premiers en `reveal`) ou console (classement complet). */
  screenView(fullScoreboard: boolean): QuizScreenView {
    const phase = this.viewPhase();
    const common = this.common(phase);
    const question = this.questionView();
    if (phase === 'question' && question) return { phase, ...common, question };
    if (phase === 'reveal' && question && this.reveal) {
      return {
        phase,
        ...common,
        question,
        correctAnswerId: this.reveal.correctAnswerId,
        explanation: this.reveal.explanation,
        revealedAt: this.iso(this.reveal.revealedAt),
        scoreboard: fullScoreboard
          ? this.reveal.scoreboard
          : this.reveal.scoreboard.slice(0, QUIZ_SCREEN_SCOREBOARD_SIZE),
      };
    }
    if (phase === 'done') return { phase, ...common, question: null };
    return { phase: 'countdown', ...common, question: null };
  }

  /** Vue d'un joueur : la partie commune et `me` (sa réponse, son blocage, son résultat). */
  mobileView(pid: string | null): QuizMobileView {
    const phase = this.viewPhase();
    const common = this.common(phase);
    const question = this.questionView();
    const locked = pid !== null && this.lockedPlayerIds.has(pid);
    if (phase === 'question' && question) {
      const mine = pid !== null ? this.inMemoryAnswers.get(pid) : undefined;
      return {
        phase,
        ...common,
        question,
        me: { answerId: mine?.answerId.toString() ?? null, locked, result: null },
      };
    }
    if (phase === 'reveal' && question && this.reveal) {
      const graded = pid !== null && !locked ? this.reveal.byPlayer.get(pid) : undefined;
      return {
        phase,
        ...common,
        question,
        correctAnswerId: this.reveal.correctAnswerId,
        explanation: this.reveal.explanation,
        revealedAt: this.iso(this.reveal.revealedAt),
        me: {
          answerId: graded?.answerId ?? null,
          locked,
          result: graded?.result ?? null,
        },
      };
    }
    const me = { answerId: null, locked: false, result: null };
    if (phase === 'done') return { phase, ...common, question: null, me };
    return { phase: 'countdown', ...common, question: null, me };
  }

  // ---------------------------------------------------------------- émissions

  /**
   * Changement de phase ou d'échéance : vue écran, vue console, puis une vue par joueur
   * (1 + 1 + N messages ; aucune émission ne dépend du nombre de joueurs au carré).
   */
  private emitAll(): void {
    if (this.disposed) return;
    this.answerCountFlush?.();
    this.answerCountFlush = null;
    this.ctx.emitState('screen', this.screenView(false));
    this.ctx.emitState('console', this.screenView(true));
    for (const pid of this.ctx.players.ids()) {
      this.ctx.emitState('mobile', this.mobileView(pid), BigInt(pid));
    }
  }

  /** Compteur de réponses (et de joueurs) : vues écran et console seulement. */
  private emitCounts(): void {
    if (this.disposed) return;
    this.ctx.emitState('screen', this.screenView(false));
    this.ctx.emitState('console', this.screenView(true));
  }

  /** Regroupe les émissions du compteur de réponses (au plus une toutes les 250 ms). */
  private scheduleAnswerCountFlush(): void {
    if (this.answerCountFlush) return;
    this.answerCountFlush = this.ctx.setTimer(ANSWER_COUNT_FLUSH_MS, () => {
      this.answerCountFlush = null;
      this.emitCounts();
    });
  }

  // ---------------------------------------------------------------- outils

  private phase(): QuizInternalPhase {
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
      this.lastSecondsTimer,
      this.answerCountFlush,
      this.countdownTimer,
    ]) {
      cancel?.();
    }
    this.questionTimer = null;
    this.resultsTimer = null;
    this.lastSecondsTimer = null;
    this.answerCountFlush = null;
    this.countdownTimer = null;
    this.countdownEndsAt = null;
    this.resultsEndsAt = null;
  }
}

function buildReveal(
  questionIndex: number,
  question: QuizQuestion,
  graded: {
    pid: string;
    pseudo: string;
    avatarUrl: string | null;
    scoreTotal: number;
    points: number;
    isCorrect: boolean;
    answerId: string | null;
  }[],
  answeredCount: number,
  now: number,
): QuizReveal {
  const sorted = [...graded].sort((a, b) => b.scoreTotal - a.scoreTotal);
  const byPlayer: QuizReveal['byPlayer'] = new Map();
  const scoreboard = sorted.map((g, i) => {
    byPlayer.set(g.pid, {
      answerId: g.answerId,
      result: { isCorrect: g.isCorrect, points: g.points, rank: i + 1, scoreTotal: g.scoreTotal },
    });
    return {
      playerId: g.pid,
      pseudo: g.pseudo,
      avatarUrl: g.avatarUrl,
      scoreTotal: g.scoreTotal,
      scoreThisQuestion: g.points,
      rank: i + 1,
    };
  });
  return {
    questionIndex,
    correctAnswerId: question.answers.find((a) => a.isCorrect)?.id.toString() ?? null,
    explanation: question.explanation,
    revealedAt: now,
    answeredCount,
    scoreboard,
    byPlayer,
  };
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
