import { afterEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import {
  TOWER_BOOKS,
  TOWER_SCORE_REASON,
  towerBookAt,
  towerConfigSchema,
  towerHeight,
  towerMobileViewSchema,
  towerPoints,
  towerScreenViewSchema,
  towerSettle,
  type TowerBook,
  type TowerConfigInput,
  type TowerMobileView,
  type TowerScreenView,
} from '@quiz-app/validation';
import {
  TOWER_MIN_DROP_INTERVAL_MS,
  towerEngine,
} from '../src/modules/games/engines/tower/tower.engine.js';
import type {
  Audience,
  GameRound,
  RoundContext,
  RoundPlayerMeta,
  ScoreAward,
} from '../src/modules/games/engine.types.js';

/**
 * Moteur tour de livres seul : faux RoundContext, horloge et minuteurs simulés (aucune base).
 */

const COUNTDOWN_MS = 3_000;
const DURATION_MS = 40_000;
const RESULTS_MS = 5_000;
const TOLERANCE_MS = 500;

const CONFIG: TowerConfigInput = {
  countdownSeconds: COUNTDOWN_MS / 1000,
  durationSeconds: DURATION_MS / 1000,
  resultsSeconds: RESULTS_MS / 1000,
  pointsPerCm: 5,
  firstPlacePoints: 300,
  secondPlacePoints: 200,
  thirdPlacePoints: 100,
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
    lastScreen: () => of('screen').at(-1)?.view as unknown as TowerScreenView,
    lastConsole: () => of('console').at(-1)?.view as unknown as TowerScreenView,
    lastMobile: (pid: bigint) => of(`mobile:${pid}`).at(-1)?.view as unknown as TowerMobileView,
  };
}

const drop = (r: GameRound, playerId: bigint, index: number, x: number) =>
  r.onAction(playerId, { type: 'drop', payload: { index, x } });

describe('tower physics (shared settle rule)', () => {
  const book = (x: number): TowerBook => ({ k: 'roman', x });

  it('a centred stack stands; a book past the edge of its support falls alone', () => {
    expect(towerSettle([book(0), book(0), book(0)]).fallen).toEqual([]);
    const half = TOWER_BOOKS.roman.width / 2;
    const r = towerSettle([book(0), book(0), book(half + 1)]);
    expect(r.books).toHaveLength(2);
    expect(r.fallen).toEqual([book(half + 1)]);
    expect(r.side).toBe(1);
  });

  it('the lowest failing interface brings down everything above it', () => {
    // Deux livres décalés à gauche : chacun tient sur son voisin, mais leur centre de gravité
    // commun sort du livre du bas.
    const r = towerSettle([book(0), book(-11), book(-22)]);
    expect(r.books).toEqual([book(0)]);
    expect(r.fallen).toHaveLength(2);
    expect(r.side).toBe(-1);
  });

  it('the load margin grows with height: an offset safe on a short tower fails under load', () => {
    const offset = TOWER_BOOKS.roman.width / 2 - 1.5;
    expect(towerSettle([book(0), book(offset)]).fallen).toEqual([]);
    const loaded = [book(0), book(offset), ...Array.from({ length: 12 }, () => book(offset))];
    expect(towerSettle(loaded).fallen.length).toBeGreaterThan(0);
  });

  it('the book sequence is the same for a given seed', () => {
    const a = Array.from({ length: 30 }, (_, i) => towerBookAt(42, i));
    const b = Array.from({ length: 30 }, (_, i) => towerBookAt(42, i));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(3);
  });
});

describe('tower engine (fake RoundContext, simulated clock)', () => {
  let round: GameRound | null = null;

  afterEach(() => {
    round?.dispose();
    round = null;
  });

  async function setup(
    playerIds: bigint[],
    config: TowerConfigInput = CONFIG,
    restoreState?: unknown,
  ) {
    const players = new Map(playerIds.map((id) => [id.toString(), meta(`P${id}`)]));
    const f = createFakeContext(players);
    const r = await towerEngine.createRound(
      f.ctx,
      { id: 1n, configJson: towerConfigSchema.parse(config), quizId: null },
      restoreState !== undefined
        ? { stateJson: restoreState, interruptedAt: new Date() }
        : undefined,
    );
    round = r;
    return { f, r, players };
  }

  async function build(playerIds: bigint[], config?: TowerConfigInput) {
    const s = await setup(playerIds, config);
    await s.r.start();
    expect(s.f.lastScreen().phase).toBe('countdown');
    await s.f.advance(COUNTDOWN_MS);
    expect(s.f.lastScreen().phase).toBe('build');
    return { ...s, seed: s.f.lastScreen().seed };
  }

  /** `n` lâchers centrés (espacés de 300 ms). */
  async function stack(
    f: Awaited<ReturnType<typeof setup>>['f'],
    r: GameRound,
    pid: bigint,
    n: number,
  ) {
    for (let i = 0; i < n; i++) {
      await f.advance(300);
      await drop(r, pid, f.lastMobile(pid).me.drops, 0);
    }
  }

  it('full round: drops, collapse, ranking by standing height, points, results, finish() once', async () => {
    const { f, r, seed } = await setup([1n, 2n, 3n]).then(async (s) => {
      await s.r.start();
      const cd = s.f.lastMobile(1n);
      expect(cd).toMatchObject({ phase: 'countdown', me: { books: [], drops: 0 } });
      expect(Date.parse(cd.endsAt!)).toBe(s.f.now() + COUNTDOWN_MS);
      await expect(drop(s.r, 1n, 0, 0)).rejects.toMatchObject({ code: 'PHASE_CLOSED' });
      await s.f.advance(COUNTDOWN_MS);
      return { ...s, seed: s.f.lastScreen().seed };
    });
    expect(f.progress).toEqual([1]);
    expect(Date.parse(f.lastScreen().endsAt!)).toBe(f.now() + DURATION_MS);

    // Joueur 1 : 5 livres centrés.
    await stack(f, r, 1n, 5);
    const books1 = Array.from({ length: 5 }, (_, i) => ({ k: towerBookAt(seed, i), x: 0 }));
    expect(f.lastMobile(1n).me).toMatchObject({
      drops: 5,
      books: books1,
      heightCm: towerHeight(books1),
    });

    // Joueur 2 : 3 livres centrés puis un lâcher tout au bord, qui tombe.
    await stack(f, r, 2n, 3);
    await f.advance(300);
    const res = await drop(r, 2n, 3, 30);
    // Le livre tombe, et peut entraîner ceux du dessous s'il est lourd.
    expect(res.fallen).toBeGreaterThanOrEqual(1);
    expect(res.drops).toBe(4);
    expect(f.lastMobile(2n).me.books).toHaveLength(4 - res.fallen);
    // Joueur 3 : rien.

    await f.advance(250);
    const live = f.lastScreen();
    if (live.phase !== 'build') throw new Error('unreachable');
    expect(live.racers.map((x) => x.playerId)).toEqual(['1', '2', '3']);
    expect(live.topHeight).toBe(towerHeight(books1));

    await f.advance(DURATION_MS + TOLERANCE_MS);
    const results = f.lastScreen();
    expect(results.phase).toBe('results');
    if (results.phase !== 'results') throw new Error('unreachable');
    const h1 = towerHeight(books1);
    const h2 = f.lastMobile(2n).me.heightCm;
    expect(results.racers.map((x) => x.points)).toEqual([
      Math.round(h1 * 5) + 300,
      towerPoints(towerConfigSchema.parse(CONFIG), { heightCm: h2, rank: 2 }),
      0,
    ]);
    expect(f.awards).toEqual([
      expect.objectContaining({ playerId: 1n, reason: TOWER_SCORE_REASON }),
      expect.objectContaining({ playerId: 2n }),
      expect.objectContaining({ playerId: 3n, points: 0 }),
    ]);
    expect(f.lastMobile(3n)).toMatchObject({ phase: 'results', me: { rank: 3, points: 0 } });

    await f.advance(RESULTS_MS);
    expect(f.lastScreen().phase).toBe('done');
    expect(f.finishCalls()).toBe(1);
    await f.advance(60_000);
    expect(f.finishCalls()).toBe(1);

    for (const s of f.states) {
      const schema = s.audience === 'mobile' ? towerMobileViewSchema : towerScreenViewSchema;
      expect(schema.safeParse(s.view).success).toBe(true);
    }
  });

  it('a collapse keeps the remaining tower, emits a cue for big ones; the player keeps building', async () => {
    const { f, r } = await build([1n]);
    await stack(f, r, 1n, 4);
    // Trois livres de plus, de plus en plus à droite : quelque chose finit par tomber (le livre
    // lâché seul, ou toute une pile selon les livres tirés).
    let res = { fallen: 0, drops: 0, heightCm: 0 };
    let before = f.lastMobile(1n).me;
    for (const x of [12, 24, 30]) {
      await f.advance(300);
      before = f.lastMobile(1n).me;
      res = await drop(r, 1n, before.drops, x);
      if (res.fallen > 0) break;
    }
    expect(res.fallen).toBeGreaterThan(0);
    const me = f.lastMobile(1n).me;
    expect(me.books).toHaveLength(before.books.length + 1 - res.fallen);
    expect(me.heightCm).toBe(res.heightCm);
    expect(me.bestHeightCm).toBeGreaterThanOrEqual(me.heightCm);
    // Plusieurs livres à terre : un effondrement, la tour a baissé.
    if (res.fallen > 1) {
      expect(me.collapses).toBe(1);
      expect(me.bestHeightCm).toBeGreaterThan(me.heightCm);
    }
    expect(f.cues).toEqual(res.fallen >= 3 ? ['tower_collapsed'] : []);
    await f.advance(300);
    await expect(drop(r, 1n, me.drops, me.books.at(-1)?.x ?? 0)).resolves.toMatchObject({
      drops: me.drops + 1,
    });
  });

  it('refuses stale indexes, too-fast drops, out-of-range x, unknown actions and drops while paused', async () => {
    const { f, r } = await build([1n]);
    await f.advance(300);
    await drop(r, 1n, 0, 0);
    await expect(drop(r, 1n, 0, 0)).rejects.toMatchObject({ code: 'STALE_DROP' });
    await expect(drop(r, 1n, 1, 0)).rejects.toMatchObject({ code: 'TOO_FAST' });
    await f.advance(TOWER_MIN_DROP_INTERVAL_MS);
    await expect(drop(r, 1n, 1, 31)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(r.onAction(1n, { type: 'drop', payload: { index: 1 } })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(r.onAction(1n, { type: 'vote', payload: {} })).rejects.toMatchObject({
      code: 'UNKNOWN_ACTION',
    });
    await expect(drop(r, 9n, 0, 0)).rejects.toMatchObject({ code: 'PLAYER_NOT_IN_SESSION' });
    await r.pause();
    await expect(drop(r, 1n, 1, 0)).rejects.toMatchObject({ code: 'SESSION_PAUSED' });
  });

  it('pause freezes the build clock', async () => {
    const { f, r } = await build([1n]);
    await f.advance(4_000);
    await r.pause();
    expect(f.lastScreen()).toMatchObject({ endsAt: null, pausedRemainingMs: DURATION_MS - 4_000 });
    await f.advance(60_000);
    expect(f.lastScreen().phase).toBe('build');
    await r.resume();
    expect(Date.parse(f.lastScreen().endsAt!)).toBe(f.now() + DURATION_MS - 4_000);
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

  it('a mobile view only carries the player own tower', async () => {
    const { f, r } = await build([1n, 2n]);
    await stack(f, r, 1n, 3);
    const m2 = f.lastMobile(2n);
    expect(m2.me.books).toEqual([]);
    expect(m2).not.toHaveProperty('racers');
  });

  it('snapshot equals the last view emitted to each recipient; seq grows; emissions are linear', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => BigInt(i + 1));
    const { f, r } = await build(ids);
    await f.advance(300);
    const before = f.states.length;
    for (const id of ids) await drop(r, id, 0, 0);
    await f.advance(250);
    expect(f.states.length - before).toBe(ids.length + 2);
    expect(r.snapshot('screen')).toEqual(f.lastScreen());
    expect(r.snapshot('console')).toEqual(f.lastConsole());
    for (const id of ids) expect(r.snapshot('mobile', id)).toEqual(f.lastMobile(id));
    for (const key of new Set(f.states.map((s) => s.key))) {
      const seqs = f.of(key).map((s) => s.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });

  it('late joiner starts from an empty base with the common book sequence', async () => {
    const { f, r, players, seed } = await build([1n]);
    players.set('2', { pseudo: 'P2', avatarUrl: null, joinedDuringRound: true });
    r.onPlayerJoined(2n, { rejoin: false });
    expect(f.lastMobile(2n)).toMatchObject({ phase: 'build', me: { books: [], drops: 0 } });
    await f.advance(300);
    await drop(r, 2n, 0, 0);
    expect(f.lastMobile(2n).me.books).toEqual([{ k: towerBookAt(seed, 0), x: 0 }]);
  });

  it('restore mid-build closes it on the persisted towers; restore of results does not award again', async () => {
    const first = await build([1n, 2n]);
    await stack(first.f, first.r, 1n, 3);
    await stack(first.f, first.r, 2n, 1);
    await first.f.advance(250);
    const midBuild = first.f.persisted.at(-1);
    const h1 = first.f.lastMobile(1n).me.heightCm;
    const h2 = first.f.lastMobile(2n).me.heightCm;
    first.r.dispose();

    const second = await setup([1n, 2n], CONFIG, midBuild);
    await second.r.start();
    const results = second.f.lastScreen();
    expect(results.phase).toBe('results');
    if (results.phase !== 'results') throw new Error('unreachable');
    expect(results.seed).toBe(first.seed);
    expect(results.racers.map((x) => [x.playerId, x.heightCm])).toEqual([
      ['1', h1],
      ['2', h2],
    ]);
    expect(second.f.awards.map((a) => a.points)).toEqual([
      Math.round(h1 * 5) + 300,
      Math.round(h2 * 5) + 200,
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
      towerEngine.createRound(f.ctx, { id: 1n, configJson: { durationSeconds: 2 }, quizId: null }),
    ).rejects.toMatchObject({ code: 'TOWER_CONFIG_INVALID' });
  });
});
