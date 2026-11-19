import { z } from 'zod';
import {
  BURGER_CUES,
  BURGER_ENGINE_KEY,
  BURGER_LAYER_IDS,
  BURGER_REORDER_ACTION,
  BURGER_SCORE_REASON,
  BURGER_SCREEN_RACERS,
  burgerConfigSchema,
  burgerLayerIdSchema,
  burgerPoints,
  type BurgerConfig,
  type BurgerLayerId,
  type BurgerMe,
  type BurgerMobileView,
  type BurgerPlayerFinishedCue,
  type BurgerRacer,
  type BurgerReorderResult,
  type BurgerScreenView,
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
 * Moteur burger : course de vitesse pour remettre dans l'ordre les étages d'un burger.
 *
 * Phases : `countdown` → `build` → `results` → `done`.
 * - Tous les joueurs reçoivent le même burger mélangé (aucun étage à sa place au départ).
 * - Chaque dépôt d'étage sur le téléphone envoie l'ordre complet (`reorder`) ; le serveur compte
 *   les étages bien placés, et chronomètre le joueur dès que son burger est juste.
 * - La course s'arrête à l'échéance, quand tous les joueurs ont fini, ou sur « Forcer la fin ».
 * - Points à la fin de la course : burger terminé → `pointsFloor`..`pointsMax` selon le temps ;
 *   sinon au prorata des étages bien placés (`partialPointsMax`).
 *
 * La recette ne vit qu'ici (jamais dans `@quiz-app/validation`, qui part dans le code client) et
 * n'apparaît dans les vues qu'à partir de `results`.
 */

/** La recette, du bas vers le haut. */
export const BURGER_RECIPE: readonly BurgerLayerId[] = [
  'bun_bottom',
  'sauce',
  'lettuce',
  'tomato',
  'patty_cheese',
  'onion',
  'pickles',
  'bun_top',
];

/** Délai de grâce après l'échéance affichée avant de clore la course (latence réseau). */
const BUILD_TOLERANCE_MS = 500;
/** Regroupement des vues écran/console après des actions (et de la persistance). */
const RACE_FLUSH_MS = 250;

type BurgerPhase = 'countdown' | 'build' | 'results' | 'done';

/** Nombre d'étages à la bonne place. */
export function burgerCorrectCount(order: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < BURGER_RECIPE.length; i++) if (order[i] === BURGER_RECIPE[i]) n += 1;
  return n;
}

/** Permutation sans aucun étage à sa place (même départ pour tous les joueurs). */
export function shuffledStart(random: () => number = Math.random): BurgerLayerId[] {
  for (;;) {
    const order = [...BURGER_RECIPE];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    if (burgerCorrectCount(order) === 0) return order;
  }
}

const orderSchema = z.array(burgerLayerIdSchema).length(BURGER_LAYER_IDS.length);

const racerStateSchema = z.object({
  order: orderSchema,
  correct: z.number().int().nonnegative(),
  finishMs: z.number().int().nonnegative().nullable(),
  /** Ordre d'arrivée (1 = premier burger terminé). */
  finishRank: z.number().int().positive().nullable(),
  /** Temps de course (ms) où le joueur a atteint son nombre actuel d'étages bien placés. */
  reachedMs: z.number().int().nonnegative(),
  points: z.number().int().nonnegative().nullable(),
});
type RacerState = z.infer<typeof racerStateSchema>;

/** Partie moteur de session_rounds.state_json. */
const burgerPersistedStateSchema = z.object({
  v: z.literal(1),
  phase: z.enum(['countdown', 'build', 'results', 'done']),
  start: orderSchema,
  racers: z.record(z.string(), racerStateSchema),
  finishedSoFar: z.number().int().nonnegative(),
});
type BurgerPersistedState = z.infer<typeof burgerPersistedStateSchema>;

const reorderPayloadSchema = z.object({ order: orderSchema });

export class BurgerRound implements GameRound {
  private phase: BurgerPhase = 'countdown';
  private start_: BurgerLayerId[];
  private racers = new Map<string, RacerState>();
  private finishedSoFar = 0;

  private started = false;
  private paused = false;
  private disposed = false;
  private finished = false;
  /** Échéance affichée de la phase en cours (ms epoch), null en pause ou sans échéance. */
  private phaseEndsAt: number | null = null;
  private pausedRemainingMs: number | null = null;
  private dirty = false;

  private phaseTimer: CancelTimer | null = null;
  private flushTimer: CancelTimer | null = null;

  constructor(
    private readonly ctx: RoundContext,
    private readonly config: BurgerConfig,
    private restore: { state: BurgerPersistedState | null } | undefined,
    random: () => number = Math.random,
  ) {
    this.start_ = shuffledStart(random);
  }

  private get durationMs(): number {
    return this.config.durationSeconds * 1000;
  }

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
    await this.enterCountdown();
  }

  /**
   * Reprise après redémarrage : compte à rebours → recommence ; course interrompue → close sur
   * les progrès persistés (résultats) ; résultats → réaffichés ; fin → `finish()` sans nouveaux
   * points.
   */
  private async startFromRestore(state: BurgerPersistedState): Promise<void> {
    this.start_ = [...state.start];
    this.racers = new Map(Object.entries(state.racers).map(([pid, r]) => [pid, { ...r }]));
    this.finishedSoFar = state.finishedSoFar;
    this.ctx.log.info({ phase: state.phase }, 'Burger round resumed');

    switch (state.phase) {
      case 'countdown':
        await this.enterCountdown();
        return;
      case 'build':
        this.phase = 'build';
        await this.closeBuild('server-resume');
        return;
      case 'results':
        await this.enterResults();
        return;
      case 'done':
        this.phase = 'done';
        this.finished = true;
        this.emitAll();
        await this.ctx.finish();
        return;
    }
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

  /** « Forcer la fin » : compte à rebours → course, course → résultats, résultats → fin. */
  async forceAdvance(): Promise<void> {
    if (!this.started || this.disposed || this.finished) return;
    if (this.phase === 'countdown') await this.enterBuild();
    else if (this.phase === 'build') await this.closeBuild('forced');
    else if (this.phase === 'results') await this.complete();
  }

  onPlayerJoined(playerId: bigint, _info: PlayerJoinInfo): void {
    // Un retardataire part du même burger mélangé ; son chrono part du début de la course.
    if (!this.started || this.disposed || this.finished) return;
    this.ctx.emitState('mobile', this.mobileView(playerId.toString()), playerId);
    this.scheduleFlush();
  }

  snapshot(audience: Audience, playerId?: bigint): unknown {
    if (audience === 'mobile') return this.mobileView(playerId?.toString() ?? null);
    return this.screenView();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPhaseTimer();
    this.flushTimer?.();
    this.flushTimer = null;
  }

  // ---------------------------------------------------------------- action

  async onAction(playerId: bigint, action: GameAction): Promise<BurgerReorderResult> {
    if (action.type !== BURGER_REORDER_ACTION) {
      throw new AppError(`Unknown action: ${action.type}`, 400, 'UNKNOWN_ACTION');
    }
    const parsed = reorderPayloadSchema.safeParse(action.payload);
    if (!parsed.success || new Set(parsed.data.order).size !== BURGER_LAYER_IDS.length) {
      throw new AppError('Invalid burger order', 400, 'VALIDATION_ERROR');
    }
    const order = parsed.data.order;

    // Contrôles et écriture en mémoire synchrones (aucun await avant).
    if (this.disposed || this.finished || this.phase !== 'build') {
      throw new AppError('The race is not open', 409, 'PHASE_CLOSED');
    }
    if (this.paused) {
      throw new AppError('Session is paused', 409, 'SESSION_PAUSED');
    }
    const pid = playerId.toString();
    if (!this.ctx.players.has(pid)) {
      throw new AppError('Player not in session', 403, 'PLAYER_NOT_IN_SESSION');
    }
    const racer = this.racerOf(pid);
    if (racer.finishMs !== null) {
      throw new AppError('Burger already finished', 409, 'ALREADY_FINISHED');
    }

    const elapsed = this.elapsedMs();
    const correct = burgerCorrectCount(order);
    racer.order = order;
    if (correct !== racer.correct) {
      racer.correct = correct;
      racer.reachedMs = elapsed;
    }
    let justFinished = false;
    if (correct === BURGER_RECIPE.length) {
      this.finishedSoFar += 1;
      racer.finishMs = elapsed;
      racer.finishRank = this.finishedSoFar;
      justFinished = true;
    }
    this.dirty = true;

    this.ctx.emitState('mobile', this.mobileView(pid), playerId);
    this.scheduleFlush();

    if (justFinished) {
      const cue: BurgerPlayerFinishedCue = {
        pseudo: this.ctx.players.meta(pid)?.pseudo ?? '',
        rank: racer.finishRank!,
        finishMs: racer.finishMs!,
      };
      this.ctx.emitCue('screen', BURGER_CUES.playerFinished, cue);
      const ids = this.ctx.players.ids();
      if (ids.length > 0 && ids.every((id) => this.racers.get(id)?.finishMs != null)) {
        void this.closeBuild('all-finished').catch((err: unknown) => {
          this.ctx.log.error({ err }, 'Closing burger race failed');
        });
      }
    }

    return { correctCount: correct, finishMs: racer.finishMs, rank: racer.finishRank };
  }

  // ---------------------------------------------------------------- phases

  private async enterCountdown(): Promise<void> {
    this.cancelPhaseTimer();
    this.phase = 'countdown';
    this.pausedRemainingMs = null;
    this.phaseEndsAt = null;
    this.armPhase(this.config.countdownSeconds * 1000);
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
  }

  private async enterBuild(): Promise<void> {
    if (this.disposed || this.finished || this.phase !== 'countdown') return;
    this.cancelPhaseTimer();
    this.phase = 'build';
    this.pausedRemainingMs = null;
    this.phaseEndsAt = null;
    this.armPhase(this.durationMs);
    await this.ctx.reportProgress(1);
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
    this.ctx.log.info('Burger race started');
  }

  /** Fin de la course : points de chacun, puis résultats. */
  private async closeBuild(reason: string): Promise<void> {
    if (this.disposed || this.finished || this.phase !== 'build') return;
    this.cancelPhaseTimer();
    this.phase = 'results';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;

    const awards: { playerId: bigint; points: number; reason: string; meta: unknown }[] = [];
    for (const pid of this.ctx.players.ids()) {
      const racer = this.racerOf(pid);
      const points = burgerPoints(this.config, {
        finishMs: racer.finishMs,
        correctCount: racer.correct,
      });
      racer.points = points;
      awards.push({
        playerId: BigInt(pid),
        points,
        reason: BURGER_SCORE_REASON,
        meta: { finishMs: racer.finishMs, correctCount: racer.correct },
      });
    }
    // Phase `results` persistée avant l'attribution : une reprise ne redonne pas les points.
    await this.persist();
    try {
      await this.ctx.award(awards);
    } catch (err) {
      this.ctx.log.error({ err }, 'Awarding burger points failed');
    }
    this.ctx.log.info({ reason, finished: this.finishedSoFar }, 'Burger race closed');
    await this.enterResults();
  }

  private async enterResults(): Promise<void> {
    if (this.disposed || this.finished) return;
    this.cancelPhaseTimer();
    this.phase = 'results';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.armPhase(this.config.resultsSeconds * 1000);
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
  }

  private async complete(): Promise<void> {
    if (this.finished || this.disposed) return;
    this.finished = true;
    this.cancelPhaseTimer();
    this.phase = 'done';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    await this.persist();
    if (this.disposed) return;
    this.emitAll();
    await this.ctx.finish();
  }

  private armPhase(ms: number): void {
    if (this.paused) {
      this.pausedRemainingMs = ms;
      return;
    }
    this.phaseEndsAt = this.ctx.now() + ms;
    const phase = this.phase;
    const delay = phase === 'build' ? ms + BUILD_TOLERANCE_MS : ms;
    this.phaseTimer = this.ctx.setTimer(delay, () => {
      this.phaseTimer = null;
      const run =
        phase === 'countdown'
          ? this.enterBuild()
          : phase === 'build'
            ? this.closeBuild('timer')
            : this.complete();
      run.catch((err: unknown) => {
        this.ctx.log.error({ err, phase }, 'Burger phase transition failed');
      });
    });
  }

  // ---------------------------------------------------------------- état

  /** Temps de course écoulé (ms), borné à la durée ; pauses exclues. */
  private elapsedMs(): number {
    const remaining =
      this.phaseEndsAt !== null
        ? this.phaseEndsAt - this.ctx.now()
        : (this.pausedRemainingMs ?? this.durationMs);
    return Math.round(Math.max(0, Math.min(this.durationMs, this.durationMs - remaining)));
  }

  private racerOf(pid: string): RacerState {
    let racer = this.racers.get(pid);
    if (!racer) {
      racer = {
        order: [...this.start_],
        correct: burgerCorrectCount(this.start_),
        finishMs: null,
        finishRank: null,
        reachedMs: 0,
        points: null,
      };
      this.racers.set(pid, racer);
    }
    return racer;
  }

  /**
   * Joueurs actifs classés : burgers terminés (ordre d'arrivée), puis nombre d'étages bien placés
   * (le premier à l'atteindre devant), puis pseudo.
   */
  private ranking(): { pid: string; racer: RacerState }[] {
    return this.ctx.players
      .ids()
      .map((pid) => ({ pid, racer: this.racerOf(pid) }))
      .sort((a, b) => {
        const fa = a.racer.finishRank;
        const fb = b.racer.finishRank;
        if (fa !== null || fb !== null) {
          if (fa === null) return 1;
          if (fb === null) return -1;
          return fa - fb;
        }
        if (a.racer.correct !== b.racer.correct) return b.racer.correct - a.racer.correct;
        if (a.racer.reachedMs !== b.racer.reachedMs) return a.racer.reachedMs - b.racer.reachedMs;
        const pa = this.ctx.players.meta(a.pid)?.pseudo ?? '';
        const pb = this.ctx.players.meta(b.pid)?.pseudo ?? '';
        return pa.localeCompare(pb);
      });
  }

  // ---------------------------------------------------------------- vues

  private common() {
    const timing =
      this.phase === 'done'
        ? { endsAt: null, pausedRemainingMs: null }
        : this.paused
          ? { endsAt: null, pausedRemainingMs: this.pausedRemainingMs ?? 0 }
          : {
              endsAt: this.phaseEndsAt !== null ? new Date(this.phaseEndsAt).toISOString() : null,
              pausedRemainingMs: null,
            };
    const ids = this.ctx.players.ids();
    return {
      ...timing,
      durationMs: this.durationMs,
      countdownMs: this.config.countdownSeconds * 1000,
      totalLayers: BURGER_RECIPE.length,
      totalPlayers: ids.length,
      finishedCount: ids.filter((id) => this.racers.get(id)?.finishMs != null).length,
    };
  }

  private racersView(): BurgerRacer[] {
    return this.ranking()
      .slice(0, BURGER_SCREEN_RACERS)
      .map(({ pid, racer }, i) => {
        const meta = this.ctx.players.meta(pid);
        return {
          playerId: pid,
          pseudo: meta?.pseudo ?? '',
          avatarUrl: meta?.avatarUrl ?? null,
          correctCount: racer.correct,
          // Triés par identifiant : on voit QUELS étages sont posés, jamais OÙ.
          placedLayers: racer.order.filter((id, idx) => BURGER_RECIPE[idx] === id).sort(),
          finishMs: racer.finishMs,
          rank: i + 1,
          points: this.phase === 'results' || this.phase === 'done' ? racer.points : null,
        };
      });
  }

  screenView(): BurgerScreenView {
    const common = this.common();
    if (this.phase === 'countdown') return { phase: 'countdown', ...common };
    if (this.phase === 'build') return { phase: 'build', ...common, racers: this.racersView() };
    return { phase: this.phase, ...common, racers: this.racersView(), recipe: [...BURGER_RECIPE] };
  }

  mobileView(pid: string | null): BurgerMobileView {
    const common = this.common();
    const me = this.meView(pid);
    if (this.phase === 'countdown') return { phase: 'countdown', ...common, me };
    if (this.phase === 'build') return { phase: 'build', ...common, me };
    return { phase: this.phase, ...common, me, recipe: [...BURGER_RECIPE] };
  }

  private meView(pid: string | null): BurgerMe {
    if (pid === null || this.phase === 'countdown') {
      return { order: [], correctCount: 0, finishMs: null, rank: null, points: null };
    }
    const racer = this.racerOf(pid);
    const over = this.phase === 'results' || this.phase === 'done';
    let rank = racer.finishRank;
    if (over) {
      const i = this.ranking().findIndex((r) => r.pid === pid);
      rank = i >= 0 ? i + 1 : null;
    }
    return {
      order: [...racer.order],
      correctCount: racer.correct,
      finishMs: racer.finishMs,
      rank,
      points: over ? racer.points : null,
    };
  }

  // ---------------------------------------------------------------- émissions

  private emitAll(): void {
    if (this.disposed) return;
    this.flushTimer?.();
    this.flushTimer = null;
    const screen = this.screenView();
    this.ctx.emitState('screen', screen);
    this.ctx.emitState('console', screen);
    for (const pid of this.ctx.players.ids()) {
      this.ctx.emitState('mobile', this.mobileView(pid), BigInt(pid));
    }
  }

  /** Vues écran et console au plus toutes les 250 ms ; persistance des progrès au passage. */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = this.ctx.setTimer(RACE_FLUSH_MS, () => {
      this.flushTimer = null;
      if (this.disposed) return;
      const screen = this.screenView();
      this.ctx.emitState('screen', screen);
      this.ctx.emitState('console', screen);
      if (this.dirty) void this.persist();
    });
  }

  private async persist(): Promise<void> {
    this.dirty = false;
    const state: BurgerPersistedState = {
      v: 1,
      phase: this.phase,
      start: [...this.start_],
      racers: Object.fromEntries(this.racers),
      finishedSoFar: this.finishedSoFar,
    };
    try {
      await this.ctx.persistState(state);
    } catch (err) {
      this.ctx.log.error({ err }, 'Persisting burger round state failed');
    }
  }

  private cancelPhaseTimer(): void {
    this.phaseTimer?.();
    this.phaseTimer = null;
  }
}

function parsePersistedState(json: unknown): BurgerPersistedState | null {
  if (json == null) return null;
  const parsed = burgerPersistedStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('Invalid burger round state', 500, 'BURGER_RESTORE_INVALID_STATE');
  }
  return parsed.data;
}

export const burgerEngine: GameEngine = {
  key: BURGER_ENGINE_KEY,

  async createRound(ctx: RoundContext, game: GameDefinition, restore?: RoundRestore) {
    const parsed = burgerConfigSchema.safeParse(game.configJson ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid burger configuration', 400, 'BURGER_CONFIG_INVALID');
    }
    return new BurgerRound(
      ctx,
      parsed.data,
      restore ? { state: parsePersistedState(restore.stateJson) } : undefined,
    );
  },
};
