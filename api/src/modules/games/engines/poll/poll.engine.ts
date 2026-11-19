import { z } from 'zod';
import {
  POLL_ENGINE_KEY,
  POLL_PARTICIPATION_REASON,
  POLL_VOTE_ACTION,
  pollConfigSchema,
  type PollConfig,
  type PollMobileView,
  type PollOptionCount,
  type PollQuestionConfig,
  type PollScreenView,
  type PollVoteResult,
} from '@quiz-app/validation';
import { AppError } from '../../../../shared/errors/app-error.js';
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
} from '../../engine.types.js';

/**
 * Moteur sondage. N'utilise que le protocole générique (`RoundContext`) : aucune table propre,
 * aucun événement socket propre, aucun accès à `sessions` ou `players`.
 *
 * Phases : (`question` → `results`) × N → `done`. Fin du vote : échéance, tous les joueurs ont
 * voté, ou « Forcer la fin ». Après la dernière question : points de participation à chaque
 * joueur ayant voté au moins une fois, puis `ctx.finish()`.
 */

/** Délai de grâce après l'échéance affichée avant de clore le vote (latence réseau), comme le quiz. */
const VOTE_TOLERANCE_MS = 500;
/** Regroupement du compteur de votes des écrans (et de la persistance des votes). */
const VOTE_COUNT_FLUSH_MS = 250;

type PollPhase = 'question' | 'results' | 'done';

/** Partie moteur de session_rounds.state_json. */
const pollPersistedStateSchema = z.object({
  v: z.literal(1),
  phase: z.enum(['question', 'results', 'done']),
  questionIndex: z.number().int().nonnegative(),
  /** questionId → (playerId → optionId). */
  votes: z.record(z.string(), z.record(z.string(), z.string())),
});
type PollPersistedState = z.infer<typeof pollPersistedStateSchema>;

const voteActionPayloadSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});

export class PollRound implements GameRound {
  private questionIndex = 0;
  private phase: PollPhase = 'question';
  /** questionId → (playerId → optionId), toutes questions (participation, reprise). */
  private votes = new Map<string, Map<string, string>>();

  private started = false;
  private paused = false;
  private disposed = false;
  private finished = false;
  /** Échéance affichée de la phase en cours (ms epoch), null en pause ou sans échéance. */
  private phaseEndsAt: number | null = null;
  /** Temps restant figé pendant une pause. */
  private pausedRemainingMs: number | null = null;
  /** Votes à persister au prochain regroupement. */
  private votesDirty = false;

  private phaseTimer: CancelTimer | null = null;
  private countFlush: CancelTimer | null = null;

  constructor(
    private readonly ctx: RoundContext,
    private readonly config: PollConfig,
    /** undefined : nouvelle manche ; sinon reprise (state null = rien de persisté). */
    private restore: { state: PollPersistedState | null } | undefined,
  ) {}

  // ---------------------------------------------------------------- cycle de vie

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const restore = this.restore;
    this.restore = undefined;
    if (restore?.state) {
      await this.startFromRestore(restore.state);
      return;
    }
    await this.openQuestion(0);
  }

  /**
   * Reprise après redémarrage : une question interrompue (vote en cours ou résultats) reprend
   * à sa phase `results`, avec les votes persistés ; la suite s'enchaîne normalement.
   */
  private async startFromRestore(state: PollPersistedState): Promise<void> {
    this.votes = new Map(
      Object.entries(state.votes).map(([qid, byPlayer]) => [
        qid,
        new Map(Object.entries(byPlayer)),
      ]),
    );
    if (!this.config.questions[state.questionIndex]) {
      throw new AppError(
        `Cannot resolve poll question index ${state.questionIndex} on restore`,
        500,
        'POLL_RESTORE_INVALID_INDEX',
      );
    }
    this.questionIndex = state.questionIndex;

    if (state.phase === 'done') {
      // Points déjà attribués avant l'arrêt : la manche se termine sans nouvelle attribution.
      this.phase = 'done';
      this.finished = true;
      this.emitAll();
      await this.ctx.finish();
      return;
    }

    this.ctx.log.info({ phase: state.phase }, 'Poll question resumed at its results');
    this.phase = 'question';
    await this.closeQuestion('server-resume');
  }

  async pause(): Promise<void> {
    if (this.paused || this.disposed) return;
    this.paused = true;
    if (this.phaseEndsAt !== null) {
      this.pausedRemainingMs = Math.max(0, this.phaseEndsAt - this.ctx.now());
      this.phaseEndsAt = null;
    }
    this.cancelPhaseTimer();
    if (!this.started || this.finished) return;
    this.emitAll();
    await this.persist();
  }

  async resume(): Promise<void> {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    if (this.finished) return;
    if (this.pausedRemainingMs !== null) {
      this.armPhase(this.pausedRemainingMs);
      this.pausedRemainingMs = null;
    }
    if (!this.started) return;
    this.emitAll();
    await this.persist();
  }

  /** « Forcer la fin » : vote → résultats, résultats → question suivante (ou fin). */
  async forceAdvance(): Promise<void> {
    if (!this.started || this.disposed || this.finished) return;
    if (this.phase === 'question') {
      await this.closeQuestion('forced');
      return;
    }
    if (this.phase === 'results') await this.next();
  }

  onPlayerJoined(playerId: bigint, _info: PlayerJoinInfo): void {
    // Pas de retardataire bloqué : un sondage n'a pas d'enjeu de vitesse, le nouveau venu vote
    // sur la question en cours. Sa vue ; le nombre de joueurs des écrans suit au regroupement.
    if (!this.started || this.disposed || this.finished) return;
    this.ctx.emitState('mobile', this.mobileView(playerId.toString()), playerId);
    this.scheduleCountFlush();
  }

  snapshot(audience: Audience, playerId?: bigint): unknown {
    if (audience === 'mobile') return this.mobileView(playerId?.toString() ?? null);
    return this.screenView();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPhaseTimer();
    this.countFlush?.();
    this.countFlush = null;
  }

  // ---------------------------------------------------------------- action

  async onAction(playerId: bigint, action: GameAction): Promise<PollVoteResult> {
    if (action.type !== POLL_VOTE_ACTION) {
      throw new AppError(`Unknown action: ${action.type}`, 400, 'UNKNOWN_ACTION');
    }
    const parsed = voteActionPayloadSchema.safeParse(action.payload);
    if (!parsed.success) {
      throw new AppError('Invalid vote payload', 400, 'VALIDATION_ERROR');
    }
    const { questionId, optionId } = parsed.data;

    // Contrôles et réservation synchrones : aucun await avant l'écriture en mémoire, donc deux
    // votes simultanés d'un même joueur ne peuvent pas passer tous les deux.
    const question = this.currentQuestion();
    if (this.disposed || this.finished || this.phase !== 'question' || question.id !== questionId) {
      throw new AppError('Voting is closed for this question', 409, 'PHASE_CLOSED');
    }
    if (this.paused) {
      throw new AppError('Session is paused', 409, 'SESSION_PAUSED');
    }
    const pid = playerId.toString();
    if (!this.ctx.players.has(pid)) {
      throw new AppError('Player not in session', 403, 'PLAYER_NOT_IN_SESSION');
    }
    if (!question.options.some((o) => o.id === optionId)) {
      throw new AppError('Unknown option', 400, 'INVALID_OPTION');
    }
    const votes = this.votesOf(question.id);
    if (votes.has(pid)) {
      throw new AppError('Already voted', 409, 'ALREADY_VOTED');
    }
    votes.set(pid, optionId);
    this.votesDirty = true;

    // Vue du seul votant, puis compteur regroupé des écrans (jamais N²).
    this.ctx.emitState('mobile', this.mobileView(pid), playerId);
    this.scheduleCountFlush();

    // Tous les joueurs actifs ont voté : fin du vote sans attendre l'échéance.
    const ids = this.ctx.players.ids();
    if (ids.length > 0 && ids.every((id) => votes.has(id))) {
      void this.closeQuestion('all-voted').catch((err: unknown) => {
        this.ctx.log.error({ err }, 'Closing poll question failed');
      });
    }
    return { accepted: true };
  }

  // ---------------------------------------------------------------- phases

  private async openQuestion(index: number): Promise<void> {
    if (this.disposed || this.finished) return;
    this.cancelPhaseTimer();
    this.questionIndex = index;
    this.phase = 'question';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.armPhase(this.currentQuestion().durationSeconds * 1000);

    await this.ctx.reportProgress(index + 1);
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
    this.ctx.log.info({ questionIndex: index }, 'Poll question opened');
  }

  private async closeQuestion(reason: string): Promise<void> {
    if (this.disposed || this.finished || this.phase !== 'question') return;
    this.cancelPhaseTimer();
    this.phase = 'results';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.armPhase(this.config.resultsSeconds * 1000);

    await this.persist();
    if (this.disposed) return;
    this.emitAll();
    this.ctx.log.info(
      {
        questionIndex: this.questionIndex,
        reason,
        votes: this.votesOf(this.currentQuestion().id).size,
      },
      'Poll question closed',
    );
  }

  /** Fin des résultats : question suivante, ou fin de manche après la dernière. */
  private async next(): Promise<void> {
    if (this.disposed || this.finished || this.phase !== 'results') return;
    if (this.questionIndex + 1 < this.config.questions.length) {
      await this.openQuestion(this.questionIndex + 1);
      return;
    }
    await this.complete();
  }

  /** Fin de manche : points de participation, vue `done`, un seul `ctx.finish()`. */
  private async complete(): Promise<void> {
    if (this.finished || this.disposed) return;
    this.finished = true;
    this.cancelPhaseTimer();
    this.phase = 'done';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;

    const voters = new Set<string>();
    for (const byPlayer of this.votes.values()) {
      for (const pid of byPlayer.keys()) voters.add(pid);
    }
    // Joueurs encore dans la manche (un joueur exclu ou parti n'est pas récompensé).
    const awarded = [...voters].filter((pid) => this.ctx.players.has(pid));
    if (this.config.participationPoints > 0 && awarded.length > 0) {
      await this.ctx.award(
        awarded.map((pid) => ({
          playerId: BigInt(pid),
          points: this.config.participationPoints,
          reason: POLL_PARTICIPATION_REASON,
          meta: { questionsVoted: this.questionsVotedBy(pid) },
        })),
      );
    }
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
    this.ctx.log.info({ voters: voters.size, awarded: awarded.length }, 'Poll round completed');
    await this.ctx.finish();
  }

  /** Échéance de la phase courante, ou temps restant figé si la séance est en pause. */
  private armPhase(ms: number): void {
    if (this.paused) {
      this.pausedRemainingMs = ms;
      return;
    }
    this.phaseEndsAt = this.ctx.now() + ms;
    const phase = this.phase;
    const delay = phase === 'question' ? ms + VOTE_TOLERANCE_MS : ms;
    this.phaseTimer = this.ctx.setTimer(delay, () => {
      this.phaseTimer = null;
      const run = phase === 'question' ? this.closeQuestion('timer') : this.next();
      run.catch((err: unknown) => {
        this.ctx.log.error({ err, phase }, 'Poll phase transition failed');
      });
    });
  }

  // ---------------------------------------------------------------- vues

  private currentQuestion(): PollQuestionConfig {
    return this.config.questions[this.questionIndex]!;
  }

  private votesOf(questionId: string): Map<string, string> {
    let byPlayer = this.votes.get(questionId);
    if (!byPlayer) {
      byPlayer = new Map();
      this.votes.set(questionId, byPlayer);
    }
    return byPlayer;
  }

  private questionsVotedBy(pid: string): number {
    let n = 0;
    for (const byPlayer of this.votes.values()) if (byPlayer.has(pid)) n += 1;
    return n;
  }

  private common() {
    const q = this.currentQuestion();
    const timing =
      this.phase === 'done'
        ? { endsAt: null, pausedRemainingMs: null }
        : this.paused
          ? { endsAt: null, pausedRemainingMs: this.pausedRemainingMs ?? 0 }
          : {
              endsAt: this.phaseEndsAt !== null ? new Date(this.phaseEndsAt).toISOString() : null,
              pausedRemainingMs: null,
            };
    return {
      questionIndex: this.questionIndex,
      totalQuestions: this.config.questions.length,
      question: {
        id: q.id,
        text: q.text,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        durationMs: q.durationSeconds * 1000,
      },
      ...timing,
      totalVotes: this.votes.get(q.id)?.size ?? 0,
      totalPlayers: this.ctx.players.ids().length,
    };
  }

  private counts(): PollOptionCount[] {
    const q = this.currentQuestion();
    const tally = new Map<string, number>(q.options.map((o) => [o.id, 0]));
    for (const optionId of this.votes.get(q.id)?.values() ?? []) {
      tally.set(optionId, (tally.get(optionId) ?? 0) + 1);
    }
    return q.options.map((o) => ({ optionId: o.id, votes: tally.get(o.id) ?? 0 }));
  }

  /** Vue écran et console (même forme). Pas de répartition pendant le vote. */
  screenView(): PollScreenView {
    const common = this.common();
    if (this.phase === 'question') return { phase: 'question', ...common };
    return { phase: this.phase, ...common, counts: this.counts() };
  }

  /** Vue d'un joueur : la partie commune et son propre vote (jamais celui d'un autre). */
  mobileView(pid: string | null): PollMobileView {
    const common = this.common();
    const myVote = pid !== null ? (this.votes.get(common.question.id)?.get(pid) ?? null) : null;
    if (this.phase === 'question') return { phase: 'question', ...common, myVote };
    return { phase: this.phase, ...common, myVote, counts: this.counts() };
  }

  // ---------------------------------------------------------------- émissions

  /** Changement de phase ou d'échéance : écran, console, puis une vue par joueur (2 + N). */
  private emitAll(): void {
    if (this.disposed) return;
    this.countFlush?.();
    this.countFlush = null;
    this.ctx.emitState('screen', this.screenView());
    this.ctx.emitState('console', this.screenView());
    for (const pid of this.ctx.players.ids()) {
      this.ctx.emitState('mobile', this.mobileView(pid), BigInt(pid));
    }
  }

  /**
   * Compteur de votes des écrans, au plus toutes les 250 ms ; les votes reçus entre-temps sont
   * persistés en même temps (une reprise en pleine question les retrouve).
   */
  private scheduleCountFlush(): void {
    if (this.countFlush) return;
    this.countFlush = this.ctx.setTimer(VOTE_COUNT_FLUSH_MS, () => {
      this.countFlush = null;
      if (this.disposed) return;
      this.ctx.emitState('screen', this.screenView());
      this.ctx.emitState('console', this.screenView());
      if (this.votesDirty) void this.persist();
    });
  }

  // ---------------------------------------------------------------- outils

  private async persist(): Promise<void> {
    this.votesDirty = false;
    const state: PollPersistedState = {
      v: 1,
      phase: this.phase,
      questionIndex: this.questionIndex,
      votes: Object.fromEntries(
        [...this.votes].map(([qid, byPlayer]) => [qid, Object.fromEntries(byPlayer)]),
      ),
    };
    try {
      await this.ctx.persistState(state);
    } catch (err) {
      this.ctx.log.error({ err }, 'Persisting poll round state failed');
    }
  }

  private cancelPhaseTimer(): void {
    this.phaseTimer?.();
    this.phaseTimer = null;
  }
}

function parsePersistedState(json: unknown): PollPersistedState | null {
  if (json == null) return null;
  const parsed = pollPersistedStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('Invalid poll round state', 500, 'POLL_RESTORE_INVALID_STATE');
  }
  return parsed.data;
}

export const pollEngine: GameEngine = {
  key: POLL_ENGINE_KEY,

  async createRound(ctx: RoundContext, game: GameDefinition, restore?: RoundRestore) {
    const parsed = pollConfigSchema.safeParse(game.configJson);
    if (!parsed.success) {
      throw new AppError('Invalid poll configuration', 400, 'POLL_CONFIG_INVALID');
    }
    return new PollRound(
      ctx,
      parsed.data,
      restore ? { state: parsePersistedState(restore.stateJson) } : undefined,
    );
  },
};
