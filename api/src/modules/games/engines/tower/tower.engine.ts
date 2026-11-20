import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  TOWER_COLLAPSE_CUE_MIN,
  TOWER_CUES,
  TOWER_DROP_ACTION,
  TOWER_ENGINE_KEY,
  TOWER_MAX_DROPS,
  TOWER_SCORE_REASON,
  TOWER_SCREEN_RACERS,
  TOWER_SLIDE_HALF,
  towerBookAt,
  towerBookSchema,
  towerConfigSchema,
  towerHeight,
  towerPoints,
  towerRoundX,
  towerSettle,
  type TowerBook,
  type TowerCollapsedCue,
  type TowerConfig,
  type TowerDropResult,
  type TowerMe,
  type TowerMobileView,
  type TowerRacer,
  type TowerScreenView,
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
 * Moteur tour de livres : chaque joueur empile des livres ; la plus haute tour debout à la fin
 * gagne.
 *
 * Phases : `countdown` → `build` → `results` → `done`.
 * - Tous les joueurs reçoivent la même suite de livres (graine commune, `towerBookAt`).
 * - Chaque lâcher envoie `{ index, x }` ; le serveur pose le livre et tranche l'équilibre avec
 *   `towerSettle` (le téléphone fait la même prédiction pour animer sans attendre).
 * - La construction s'arrête à l'échéance ou sur « Forcer la fin » : seule compte la tour debout
 *   à ce moment-là.
 * - Points à la fin : `pointsPerCm` × hauteur + bonus des trois premiers.
 */

/** Délai de grâce après l'échéance affichée avant de clore la construction (latence réseau). */
const BUILD_TOLERANCE_MS = 500;
/** Regroupement des vues écran/console après des actions (et de la persistance). */
const FLUSH_MS = 250;
/** Écart minimal entre deux lâchers d'un même joueur (le téléphone anime ~500 ms). */
export const TOWER_MIN_DROP_INTERVAL_MS = 200;

type TowerPhase = 'countdown' | 'build' | 'results' | 'done';

const builderStateSchema = z.object({
  books: z.array(towerBookSchema),
  drops: z.number().int().nonnegative(),
  best: z.number().nonnegative(),
  collapses: z.number().int().nonnegative(),
  /** Temps de construction (ms) où la hauteur actuelle a été atteinte (départage). */
  reachedMs: z.number().int().nonnegative(),
  points: z.number().int().nonnegative().nullable(),
});
type BuilderState = z.infer<typeof builderStateSchema> & { lastDropAt?: number };

/** Partie moteur de session_rounds.state_json. */
const towerPersistedStateSchema = z.object({
  v: z.literal(1),
  phase: z.enum(['countdown', 'build', 'results', 'done']),
  seed: z.number().int().nonnegative(),
  builders: z.record(z.string(), builderStateSchema),
});
type TowerPersistedState = z.infer<typeof towerPersistedStateSchema>;

const dropPayloadSchema = z.object({
  index: z.number().int().nonnegative(),
  x: z.number().finite(),
});

export class TowerRound implements GameRound {
  private phase: TowerPhase = 'countdown';
  private seed: number;
  private builders = new Map<string, BuilderState>();

  private started = false;
  private paused = false;
  private disposed = false;
  private finished = false;
  private phaseEndsAt: number | null = null;
  private pausedRemainingMs: number | null = null;
  private dirty = false;

  private phaseTimer: CancelTimer | null = null;
  private flushTimer: CancelTimer | null = null;

  constructor(
    private readonly ctx: RoundContext,
    private readonly config: TowerConfig,
    private restore: { state: TowerPersistedState | null } | undefined,
    seed: number = randomInt(0, 2 ** 31),
  ) {
    this.seed = seed;
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
   * Reprise après redémarrage : compte à rebours → recommence ; construction interrompue → close
   * sur les tours persistées ; résultats → réaffichés ; fin → `finish()` sans nouveaux points.
   */
  private async startFromRestore(state: TowerPersistedState): Promise<void> {
    this.seed = state.seed;
    this.builders = new Map(
      Object.entries(state.builders).map(([pid, b]) => [pid, { ...b, books: [...b.books] }]),
    );
    this.ctx.log.info({ phase: state.phase }, 'Tower round resumed');

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

  /** « Forcer la fin » : compte à rebours → construction → résultats → fin. */
  async forceAdvance(): Promise<void> {
    if (!this.started || this.disposed || this.finished) return;
    if (this.phase === 'countdown') await this.enterBuild();
    else if (this.phase === 'build') await this.closeBuild('forced');
    else if (this.phase === 'results') await this.complete();
  }

  onPlayerJoined(playerId: bigint, _info: PlayerJoinInfo): void {
    // Un retardataire part d'un socle vide, avec la même suite de livres.
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

  async onAction(playerId: bigint, action: GameAction): Promise<TowerDropResult> {
    if (action.type !== TOWER_DROP_ACTION) {
      throw new AppError(`Unknown action: ${action.type}`, 400, 'UNKNOWN_ACTION');
    }
    const parsed = dropPayloadSchema.safeParse(action.payload);
    if (!parsed.success || Math.abs(parsed.data.x) > TOWER_SLIDE_HALF) {
      throw new AppError('Invalid drop', 400, 'VALIDATION_ERROR');
    }
    const { index } = parsed.data;

    // Contrôles et écriture en mémoire synchrones (aucun await avant).
    if (this.disposed || this.finished || this.phase !== 'build') {
      throw new AppError('The build is not open', 409, 'PHASE_CLOSED');
    }
    if (this.paused) {
      throw new AppError('Session is paused', 409, 'SESSION_PAUSED');
    }
    const pid = playerId.toString();
    if (!this.ctx.players.has(pid)) {
      throw new AppError('Player not in session', 403, 'PLAYER_NOT_IN_SESSION');
    }
    const builder = this.builderOf(pid);
    if (index !== builder.drops) {
      // Lâcher rejoué ou en avance : le téléphone se recale sur la vue.
      this.ctx.emitState('mobile', this.mobileView(pid), playerId);
      throw new AppError('Unexpected book index', 409, 'STALE_DROP');
    }
    if (builder.drops >= TOWER_MAX_DROPS) {
      throw new AppError('No more books', 409, 'TOWER_FULL');
    }
    const now = this.ctx.now();
    if (builder.lastDropAt !== undefined && now - builder.lastDropAt < TOWER_MIN_DROP_INTERVAL_MS) {
      throw new AppError('Dropping too fast', 429, 'TOO_FAST');
    }

    const book: TowerBook = { k: towerBookAt(this.seed, index), x: towerRoundX(parsed.data.x) };
    const settled = towerSettle([...builder.books, book]);
    const before = towerHeight(builder.books);
    builder.books = settled.books;
    builder.drops += 1;
    builder.lastDropAt = now;
    const height = towerHeight(settled.books);
    if (height !== before) builder.reachedMs = this.elapsedMs();
    if (height > builder.best) builder.best = height;
    if (settled.fallen.length > 1) builder.collapses += 1;
    this.dirty = true;

    this.ctx.emitState('mobile', this.mobileView(pid), playerId);
    this.scheduleFlush();

    if (settled.fallen.length >= TOWER_COLLAPSE_CUE_MIN) {
      const cue: TowerCollapsedCue = {
        pseudo: this.ctx.players.meta(pid)?.pseudo ?? '',
        fallen: settled.fallen.length,
        heightCm: height,
      };
      this.ctx.emitCue('screen', TOWER_CUES.collapsed, cue);
    }

    return { heightCm: height, fallen: settled.fallen.length, drops: builder.drops };
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
    this.ctx.log.info('Tower build started');
  }

  /** Fin de la construction : points de chacun selon la tour debout, puis résultats. */
  private async closeBuild(reason: string): Promise<void> {
    if (this.disposed || this.finished || this.phase !== 'build') return;
    this.cancelPhaseTimer();
    this.phase = 'results';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;

    const awards: { playerId: bigint; points: number; reason: string; meta: unknown }[] = [];
    this.ranking().forEach(({ pid, builder }, i) => {
      const heightCm = towerHeight(builder.books);
      const points = towerPoints(this.config, { heightCm, rank: i + 1 });
      builder.points = points;
      awards.push({
        playerId: BigInt(pid),
        points,
        reason: TOWER_SCORE_REASON,
        meta: { heightCm, books: builder.books.length, rank: i + 1 },
      });
    });
    // Phase `results` persistée avant l'attribution : une reprise ne redonne pas les points.
    await this.persist();
    try {
      await this.ctx.award(awards);
    } catch (err) {
      this.ctx.log.error({ err }, 'Awarding tower points failed');
    }
    this.ctx.log.info({ reason, builders: awards.length }, 'Tower build closed');
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
        this.ctx.log.error({ err, phase }, 'Tower phase transition failed');
      });
    });
  }

  // ---------------------------------------------------------------- état

  /** Temps de construction écoulé (ms), borné à la durée ; pauses exclues. */
  private elapsedMs(): number {
    const remaining =
      this.phaseEndsAt !== null
        ? this.phaseEndsAt - this.ctx.now()
        : (this.pausedRemainingMs ?? this.durationMs);
    return Math.round(Math.max(0, Math.min(this.durationMs, this.durationMs - remaining)));
  }

  private builderOf(pid: string): BuilderState {
    let builder = this.builders.get(pid);
    if (!builder) {
      builder = { books: [], drops: 0, best: 0, collapses: 0, reachedMs: 0, points: null };
      this.builders.set(pid, builder);
    }
    return builder;
  }

  /**
   * Joueurs actifs classés : hauteur de la tour debout, puis le premier à l'avoir atteinte, puis
   * meilleure hauteur, puis pseudo.
   */
  private ranking(): { pid: string; builder: BuilderState; height: number }[] {
    return this.ctx.players
      .ids()
      .map((pid) => {
        const builder = this.builderOf(pid);
        return { pid, builder, height: towerHeight(builder.books) };
      })
      .sort((a, b) => {
        if (a.height !== b.height) return b.height - a.height;
        if (a.height > 0 && a.builder.reachedMs !== b.builder.reachedMs) {
          return a.builder.reachedMs - b.builder.reachedMs;
        }
        if (a.builder.best !== b.builder.best) return b.builder.best - a.builder.best;
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
    let top = 0;
    for (const id of ids) {
      const b = this.builders.get(id);
      if (b) top = Math.max(top, towerHeight(b.books));
    }
    return {
      ...timing,
      durationMs: this.durationMs,
      countdownMs: this.config.countdownSeconds * 1000,
      seed: this.seed,
      totalPlayers: ids.length,
      topHeight: top,
    };
  }

  private over(): boolean {
    return this.phase === 'results' || this.phase === 'done';
  }

  private racersView(): TowerRacer[] {
    return this.ranking()
      .slice(0, TOWER_SCREEN_RACERS)
      .map(({ pid, builder, height }, i) => {
        const meta = this.ctx.players.meta(pid);
        return {
          playerId: pid,
          pseudo: meta?.pseudo ?? '',
          avatarUrl: meta?.avatarUrl ?? null,
          books: builder.books.map((b) => ({ ...b })),
          heightCm: height,
          bestHeightCm: builder.best,
          collapses: builder.collapses,
          rank: i + 1,
          points: this.over() ? builder.points : null,
        };
      });
  }

  screenView(): TowerScreenView {
    const common = this.common();
    if (this.phase === 'countdown') return { phase: 'countdown', ...common };
    return { phase: this.phase, ...common, racers: this.racersView() };
  }

  mobileView(pid: string | null): TowerMobileView {
    return { phase: this.phase, ...this.common(), me: this.meView(pid) };
  }

  private meView(pid: string | null): TowerMe {
    if (pid === null || this.phase === 'countdown') {
      return {
        books: [],
        drops: 0,
        heightCm: 0,
        bestHeightCm: 0,
        collapses: 0,
        rank: null,
        points: null,
      };
    }
    const builder = this.builderOf(pid);
    let rank: number | null = null;
    if (this.over()) {
      const i = this.ranking().findIndex((r) => r.pid === pid);
      rank = i >= 0 ? i + 1 : null;
    }
    return {
      books: builder.books.map((b) => ({ ...b })),
      drops: builder.drops,
      heightCm: towerHeight(builder.books),
      bestHeightCm: builder.best,
      collapses: builder.collapses,
      rank,
      points: this.over() ? builder.points : null,
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

  /** Vues écran et console au plus toutes les 250 ms ; persistance des tours au passage. */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = this.ctx.setTimer(FLUSH_MS, () => {
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
    const state: TowerPersistedState = {
      v: 1,
      phase: this.phase,
      seed: this.seed,
      builders: Object.fromEntries(
        [...this.builders].map(([pid, b]) => [
          pid,
          {
            books: b.books,
            drops: b.drops,
            best: b.best,
            collapses: b.collapses,
            reachedMs: b.reachedMs,
            points: b.points,
          },
        ]),
      ),
    };
    try {
      await this.ctx.persistState(state);
    } catch (err) {
      this.ctx.log.error({ err }, 'Persisting tower round state failed');
    }
  }

  private cancelPhaseTimer(): void {
    this.phaseTimer?.();
    this.phaseTimer = null;
  }
}

function parsePersistedState(json: unknown): TowerPersistedState | null {
  if (json == null) return null;
  const parsed = towerPersistedStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('Invalid tower round state', 500, 'TOWER_RESTORE_INVALID_STATE');
  }
  return parsed.data;
}

export const towerEngine: GameEngine = {
  key: TOWER_ENGINE_KEY,

  async createRound(ctx: RoundContext, game: GameDefinition, restore?: RoundRestore) {
    const parsed = towerConfigSchema.safeParse(game.configJson ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid tower configuration', 400, 'TOWER_CONFIG_INVALID');
    }
    return new TowerRound(
      ctx,
      parsed.data,
      restore ? { state: parsePersistedState(restore.stateJson) } : undefined,
    );
  },
};
