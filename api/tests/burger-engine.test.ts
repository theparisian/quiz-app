import { afterEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import {
  BURGER_SCORE_REASON,
  burgerConfigSchema,
  burgerMobileViewSchema,
  burgerScreenViewSchema,
  type BurgerConfigInput,
  type BurgerLayerId,
  type BurgerMobileView,
  type BurgerScreenView,
} from '@quiz-app/validation';
import {
  BURGER_RECIPE,
  burgerCorrectCount,
  burgerEngine,
  shuffledStart,
} from '../src/modules/games/engines/burger/burger.engine.js';
import type {
  Audience,
  GameRound,
  RoundContext,
  RoundPlayerMeta,
  ScoreAward,
} from '../src/modules/games/engine.types.js';

/**
 * Moteur burger seul : faux RoundContext, horloge et minuteurs simulés (aucune base nécessaire).
 */

const COUNTDOWN_MS = 3_000;
const DURATION_MS = 40_000;
const RESULTS_MS = 5_000;
const TOLERANCE_MS = 500;

const CONFIG: BurgerConfigInput = {
  countdownSeconds: COUNTDOWN_MS / 1000,
  durationSeconds: DURATION_MS / 1000,
  resultsSeconds: RESULTS_MS / 1000,
  pointsMax: 1000,
  pointsFloor: 500,
  partialPointsMax: 400,
};

interface EmittedState {
  audience: Audience;
  key: string;
  seq: number;
  view: Record<string, unknown>;
}

function meta(pseudo: string): RoundPlayerMeta {
  return { pseudo, avatarUrl: null, joinedDuringRound: false };
}

function createFakeContext(players: Map<string, RoundPlayerMeta>) {
  let now = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  const states: EmittedState[] = [];
  const cues: string[] = [];
  const seqs = new Map<string, number>();
  const awards: ScoreAward[] = [];
  const persisted: unknown[] = [];
  const progress: (number | null)[] = [];
  let finishCalls = 0;

  const ctx: RoundContext = {
    sessionId: 1n,
    roundId: 1n,
    players: {
      ids: () => [...players.keys()],
      has: (id) => players.has(id),
      meta: (id) => players.get(id),
    },
    emitState(audience, view, playerId) {
      const key = playerId !== undefined ? `mobile:${playerId}` : audience;
      const seq = (seqs.get(key) ?? 0) + 1;
      seqs.set(key, seq);
      states.push({
        audience,
        key,
        seq,
        view: JSON.parse(JSON.stringify(view)) as Record<string, unknown>,
      });
    },
    emitCue(_audience, cue) {
      cues.push(cue);
    },
    async award(entries) {
      awards.push(...entries);
    },
    async scores() {
      return new Map([...players.keys()].map((id) => [id, 0]));
    },
    async persistState(json) {
      persisted.push(JSON.parse(JSON.stringify(json)));
    },
    async reportProgress(step) {
      progress.push(step);
    },
    async finish() {
      finishCalls += 1;
    },
    now: () => now,
    setTimer(ms, fn) {
      const timer = { id: nextTimerId++, at: now + ms, fn };
      timers.push(timer);
      return () => {
        const i = timers.indexOf(timer);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    log: pino({ level: 'silent' }),
  };

  /** Laisse s'exécuter les promesses en attente (écritures simulées du moteur). */
  async function settle() {
    for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve));
  }

  /** Avance l'horloge en déclenchant les minuteurs échus, puis laisse le moteur réagir. */
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = next.at;
      next.fn();
      await settle();
    }
    now = target;
    await settle();
  }

  const of = (key: string) => states.filter((s) => s.key === key);
  return {
    ctx,
    advance,
    settle,
    now: () => now,
    states,
    cues,
    awards,
    persisted,
    progress,
    finishCalls: () => finishCalls,
    of,
    lastScreen: () => of('screen').at(-1)?.view as unknown as BurgerScreenView,
    lastConsole: () => of('console').at(-1)?.view as unknown as BurgerScreenView,
    lastMobile: (pid: bigint) => of(`mobile:${pid}`).at(-1)?.view as unknown as BurgerMobileView,
  };
}

const reorder = (r: GameRound, playerId: bigint, order: readonly string[]) =>
  r.onAction(playerId, { type: 'reorder', payload: { order: [...order] } });

/**
 * Un burger avec exactement les `n` premiers étages de la recette à leur place : les autres sont
 * décalés d'un cran (rotation), donc aucun d'eux n'est à sa place.
 */
function withFirstCorrect(_start: readonly BurgerLayerId[], n: number): BurgerLayerId[] {
  const rest = BURGER_RECIPE.slice(n);
  return [...BURGER_RECIPE.slice(0, n), ...rest.slice(1), ...rest.slice(0, 1)];
}

describe('burger engine (fake RoundContext, simulated clock)', () => {
  let round: GameRound | null = null;

  afterEach(() => {
    round?.dispose();
    round = null;
  });

  async function setup(
    playerIds: bigint[],
    config: BurgerConfigInput = CONFIG,
    restoreState?: unknown,
  ) {
    const players = new Map(playerIds.map((id) => [id.toString(), meta(`P${id}`)]));
    const f = createFakeContext(players);
    const r = await burgerEngine.createRound(
      f.ctx,
      { id: 1n, configJson: burgerConfigSchema.parse(config), quizId: null },
      restoreState !== undefined
        ? { stateJson: restoreState, interruptedAt: new Date() }
        : undefined,
    );
    round = r;
    return { f, r, players };
  }

  /** Démarre et passe le compte à rebours ; renvoie l'ordre de départ commun. */
  async function race(playerIds: bigint[], config?: BurgerConfigInput) {
    const s = await setup(playerIds, config);
    await s.r.start();
    expect(s.f.lastScreen().phase).toBe('countdown');
    await s.f.advance(COUNTDOWN_MS);
    expect(s.f.lastScreen().phase).toBe('build');
    const start = s.f.lastMobile(playerIds[0]!).me.order as BurgerLayerId[];
    return { ...s, start };
  }

  it('shuffledStart never leaves a layer in place and is a permutation', () => {
    for (let i = 0; i < 200; i++) {
      const order = shuffledStart();
      expect(burgerCorrectCount(order)).toBe(0);
      expect([...order].sort()).toEqual([...BURGER_RECIPE].sort());
    }
  });

  it('full race: countdown hides the burger, progress, finish ranks, points, results, finish() once', async () => {
    const { f, r } = await setup([1n, 2n, 3n]);
    await r.start();

    const cd = f.lastMobile(1n);
    expect(cd).toMatchObject({ phase: 'countdown', me: { order: [], correctCount: 0 } });
    expect(Date.parse(cd.endsAt!)).toBe(f.now() + COUNTDOWN_MS);
    await expect(reorder(r, 1n, BURGER_RECIPE)).rejects.toMatchObject({ code: 'PHASE_CLOSED' });

    await f.advance(COUNTDOWN_MS);
    const build = f.lastScreen();
    expect(build.phase).toBe('build');
    expect(Date.parse(build.endsAt!)).toBe(f.now() + DURATION_MS);
    expect(f.progress).toEqual([1]);
    const start = f.lastMobile(1n).me.order as BurgerLayerId[];
    expect(f.lastMobile(2n).me.order).toEqual(start);
    expect(f.lastMobile(1n).me.correctCount).toBe(0);

    // Joueur 2 : 3 étages bien placés à 2 s.
    await f.advance(2_000);
    expect(await reorder(r, 2n, withFirstCorrect(start, 3))).toEqual({
      correctCount: 3,
      finishMs: null,
      rank: null,
    });
    // Joueur 1 termine à 5 s, joueur 3 à 10 s.
    await f.advance(3_000);
    expect(await reorder(r, 1n, BURGER_RECIPE)).toEqual({
      correctCount: 8,
      finishMs: 5_000,
      rank: 1,
    });
    expect(f.cues).toEqual(['player_finished']);
    await expect(reorder(r, 1n, start)).rejects.toMatchObject({ code: 'ALREADY_FINISHED' });
    await f.advance(5_000);
    expect(await reorder(r, 3n, BURGER_RECIPE)).toMatchObject({ finishMs: 10_000, rank: 2 });

    await f.advance(250);
    const racing = f.lastScreen();
    expect(racing).toMatchObject({ phase: 'build', finishedCount: 2, totalPlayers: 3 });
    if (racing.phase !== 'build') throw new Error('unreachable');
    expect(racing.racers.map((x) => [x.playerId, x.rank, x.correctCount])).toEqual([
      ['1', 1, 8],
      ['3', 2, 8],
      ['2', 3, 3],
    ]);

    // Échéance (+ tolérance) : résultats avec recette et points.
    await f.advance(DURATION_MS - 10_250 + TOLERANCE_MS - 1);
    expect(f.lastScreen().phase).toBe('build');
    await f.advance(1);
    const results = f.lastScreen();
    expect(results.phase).toBe('results');
    if (results.phase !== 'results') throw new Error('unreachable');
    expect(results.recipe).toEqual([...BURGER_RECIPE]);
    const p1 = Math.round(500 + 500 * (1 - 5_000 / DURATION_MS));
    const p3 = Math.round(500 + 500 * (1 - 10_000 / DURATION_MS));
    expect(results.racers.map((x) => x.points)).toEqual([p1, p3, 150]);
    expect(f.awards).toEqual([
      expect.objectContaining({ playerId: 1n, points: p1, reason: BURGER_SCORE_REASON }),
      expect.objectContaining({ playerId: 2n, points: 150 }),
      expect.objectContaining({ playerId: 3n, points: p3 }),
    ]);
    expect(f.lastMobile(2n)).toMatchObject({ phase: 'results', me: { rank: 3, points: 150 } });

    await f.advance(RESULTS_MS);
    expect(f.lastScreen().phase).toBe('done');
    expect(f.finishCalls()).toBe(1);
    await f.advance(60_000);
    expect(f.finishCalls()).toBe(1);

    for (const s of f.states) {
      const schema = s.audience === 'mobile' ? burgerMobileViewSchema : burgerScreenViewSchema;
      expect(schema.safeParse(s.view).success).toBe(true);
    }
  });

  it('ends the race as soon as every active player has finished', async () => {
    const { f, r } = await race([1n, 2n]);
    await reorder(r, 1n, BURGER_RECIPE);
    expect(f.lastScreen().phase).toBe('build');
    await reorder(r, 2n, BURGER_RECIPE);
    await f.settle();
    expect(f.lastScreen().phase).toBe('results');
  });

  it('refuses invalid orders, unknown actions and moves while paused', async () => {
    const { r } = await race([1n]);
    await expect(reorder(r, 1n, ['bun_top'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const dup = [...BURGER_RECIPE];
    dup[1] = 'bun_bottom';
    await expect(reorder(r, 1n, dup)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(r.onAction(1n, { type: 'vote', payload: {} })).rejects.toMatchObject({
      code: 'UNKNOWN_ACTION',
    });
    await expect(reorder(r, 9n, BURGER_RECIPE)).rejects.toMatchObject({
      code: 'PLAYER_NOT_IN_SESSION',
    });
    await r.pause();
    await expect(reorder(r, 1n, BURGER_RECIPE)).rejects.toMatchObject({ code: 'SESSION_PAUSED' });
  });

  it('pause freezes the race clock: finish time excludes the pause', async () => {
    const { f, r } = await race([1n, 2n]);
    await f.advance(4_000);
    await r.pause();
    expect(f.lastScreen()).toMatchObject({ endsAt: null, pausedRemainingMs: DURATION_MS - 4_000 });
    await f.advance(30_000);
    expect(f.lastScreen().phase).toBe('build');
    await r.resume();
    expect(Date.parse(f.lastScreen().endsAt!)).toBe(f.now() + DURATION_MS - 4_000);
    await f.advance(1_000);
    expect(await reorder(r, 1n, BURGER_RECIPE)).toMatchObject({ finishMs: 5_000 });
  });

  it('forceAdvance: countdown → build → results → done', async () => {
    const { f, r } = await setup([1n]);
    await r.start();
    await r.forceAdvance();
    expect(f.lastScreen().phase).toBe('build');
    await r.forceAdvance();
    expect(f.lastScreen().phase).toBe('results');
    await r.forceAdvance();
    expect(f.lastScreen().phase).toBe('done');
    expect(f.finishCalls()).toBe(1);
  });

  it('confidentiality: no recipe field before results; the screen shows placed layers in burger order', async () => {
    const { f, r, start } = await race([1n, 2n]);
    await reorder(r, 1n, withFirstCorrect(start, 4));
    await f.advance(250);
    const screen = f.lastScreen();
    if (screen.phase !== 'build') throw new Error('unreachable');
    const placed = screen.racers.find((x) => x.playerId === '1')!.placedLayers;
    expect(placed).toEqual(BURGER_RECIPE.slice(0, 4));
    for (const s of f.states) {
      if (s.view.phase === 'results' || s.view.phase === 'done') continue;
      expect(s.view).not.toHaveProperty('recipe');
    }
    // La vue d'un joueur ne contient ni l'ordre ni la progression d'un autre.
    const m2 = f.lastMobile(2n);
    expect(m2.me.order).toEqual(start);
    expect(m2.me.correctCount).toBe(0);
    expect(m2).not.toHaveProperty('racers');
  });

  it('snapshot equals the last view emitted to each recipient; seq grows; emissions are linear', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => BigInt(i + 1));
    const { f, r, start } = await race(ids);
    const before = f.states.length;
    for (const id of ids) await reorder(r, id, withFirstCorrect(start, 2));
    await f.advance(250);
    // Une vue par action + un seul regroupement écran/console.
    expect(f.states.length - before).toBe(ids.length + 2);
    expect(r.snapshot('screen')).toEqual(f.lastScreen());
    expect(r.snapshot('console')).toEqual(f.lastConsole());
    for (const id of ids) expect(r.snapshot('mobile', id)).toEqual(f.lastMobile(id));
    for (const key of new Set(f.states.map((s) => s.key))) {
      const seqs = f.of(key).map((s) => s.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });

  it('late joiner starts from the common shuffled burger', async () => {
    const { f, r, players, start } = await race([1n]);
    players.set('2', { pseudo: 'P2', avatarUrl: null, joinedDuringRound: true });
    r.onPlayerJoined(2n, { rejoin: false });
    expect(f.lastMobile(2n)).toMatchObject({ phase: 'build', me: { order: start } });
    expect(await reorder(r, 2n, BURGER_RECIPE)).toMatchObject({ rank: 1 });
  });

  it('restore mid-race closes it on the persisted progress; restore of results does not award again', async () => {
    const first = await race([1n, 2n]);
    await first.f.advance(3_000);
    await reorder(first.r, 1n, BURGER_RECIPE);
    await reorder(first.r, 2n, withFirstCorrect(first.start, 4));
    await first.f.advance(250);
    const midRace = first.f.persisted.at(-1);
    first.r.dispose();

    const second = await setup([1n, 2n], CONFIG, midRace);
    await second.r.start();
    const results = second.f.lastScreen();
    expect(results.phase).toBe('results');
    if (results.phase !== 'results') throw new Error('unreachable');
    expect(results.racers.map((x) => [x.playerId, x.finishMs, x.correctCount])).toEqual([
      ['1', 3_000, 8],
      ['2', null, 4],
    ]);
    expect(second.f.awards.map((a) => a.points)).toEqual([
      Math.round(500 + 500 * (1 - 3_000 / DURATION_MS)),
      200,
    ]);
    const atResults = second.f.persisted.at(-1);
    second.r.dispose();

    const third = await setup([1n, 2n], CONFIG, atResults);
    await third.r.start();
    expect(third.f.lastScreen().phase).toBe('results');
    expect(third.f.awards).toEqual([]);
    await third.f.advance(RESULTS_MS);
    expect(third.f.finishCalls()).toBe(1);
  });

  it('refuses an invalid configuration', async () => {
    const players = new Map([['1', meta('P1')]]);
    const f = createFakeContext(players);
    await expect(
      burgerEngine.createRound(f.ctx, {
        id: 1n,
        configJson: { durationSeconds: 2 },
        quizId: null,
      }),
    ).rejects.toMatchObject({ code: 'BURGER_CONFIG_INVALID' });
  });
});
