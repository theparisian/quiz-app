import { afterEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import {
  POLL_PARTICIPATION_REASON,
  pollConfigSchema,
  pollMobileViewSchema,
  pollScreenViewSchema,
  type PollConfigInput,
  type PollMobileView,
  type PollScreenView,
} from '@quiz-app/validation';
import { pollEngine } from '../src/modules/games/engines/poll/poll.engine.js';
import type {
  Audience,
  GameRound,
  RoundContext,
  RoundPlayerMeta,
  ScoreAward,
} from '../src/modules/games/engine.types.js';

/**
 * Moteur sondage seul : faux RoundContext, horloge et minuteurs simulés. Le moteur n'a ni table
 * ni accès base : tout passe par le contexte (aucune base nécessaire pour ce test).
 */

const DURATION_MS = 10_000;
const RESULTS_MS = 4_000;
const TOLERANCE_MS = 500;

const CONFIG: PollConfigInput = {
  questions: [
    {
      id: 'q1',
      text: 'Film préféré ?',
      options: [
        { id: 'a', text: 'Alien' },
        { id: 'b', text: 'Brazil' },
        { id: 'c', text: 'Casablanca' },
      ],
      durationSeconds: DURATION_MS / 1000,
    },
    {
      id: 'q2',
      text: 'Popcorn ?',
      options: [
        { id: 'sweet', text: 'Sucré' },
        { id: 'salty', text: 'Salé' },
      ],
      durationSeconds: DURATION_MS / 1000,
    },
  ],
  participationPoints: 300,
  resultsSeconds: RESULTS_MS / 1000,
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
    lastScreen: () => of('screen').at(-1)?.view as unknown as PollScreenView,
    lastConsole: () => of('console').at(-1)?.view as unknown as PollScreenView,
    lastMobile: (pid: bigint) => of(`mobile:${pid}`).at(-1)?.view as unknown as PollMobileView,
  };
}

const vote = (r: GameRound, playerId: bigint, questionId: string, optionId: string) =>
  r.onAction(playerId, { type: 'vote', payload: { questionId, optionId } });

describe('poll engine (fake RoundContext, simulated clock)', () => {
  let round: GameRound | null = null;

  afterEach(() => {
    round?.dispose();
    round = null;
  });

  async function setup(
    playerIds: bigint[],
    config: PollConfigInput = CONFIG,
    restoreState?: unknown,
  ) {
    const players = new Map(playerIds.map((id) => [id.toString(), meta(`P${id}`)]));
    const f = createFakeContext(players);
    const r = await pollEngine.createRound(
      f.ctx,
      { id: 1n, configJson: pollConfigSchema.parse(config), quizId: null },
      restoreState !== undefined
        ? { stateJson: restoreState, interruptedAt: new Date() }
        : undefined,
    );
    round = r;
    return { f, r, players };
  }

  it('full sequence: views valid, votes, results with counts, participation points, finish() once', async () => {
    const { f, r } = await setup([1n, 2n, 3n]);
    await r.start();

    // Question 1 ouverte : échéance, aucun vote, aucune répartition.
    const q1 = f.lastScreen();
    expect(q1).toMatchObject({
      phase: 'question',
      questionIndex: 0,
      totalQuestions: 2,
      totalVotes: 0,
      totalPlayers: 3,
      pausedRemainingMs: null,
    });
    expect(Date.parse(q1.endsAt!)).toBe(f.now() + DURATION_MS);
    expect(q1).not.toHaveProperty('counts');
    expect(f.lastMobile(1n)).toMatchObject({ phase: 'question', myVote: null });
    expect(f.progress).toEqual([1]);

    expect(await vote(r, 1n, 'q1', 'a')).toEqual({ accepted: true });
    expect(await vote(r, 2n, 'q1', 'a')).toEqual({ accepted: true });
    // Vue du votant seulement ; le compteur des écrans part au regroupement.
    expect(f.lastMobile(1n)).toMatchObject({ phase: 'question', myVote: 'a' });
    expect(f.lastMobile(3n)).toMatchObject({ myVote: null });
    expect(f.lastScreen().totalVotes).toBe(0);
    await f.advance(250);
    expect(f.lastScreen().totalVotes).toBe(2);
    expect(f.lastConsole().totalVotes).toBe(2);
    expect(f.lastScreen()).not.toHaveProperty('counts');

    // Échéance (+ tolérance) : résultats.
    await f.advance(DURATION_MS + TOLERANCE_MS - 250);
    const results = f.lastScreen();
    expect(results).toMatchObject({
      phase: 'results',
      questionIndex: 0,
      totalVotes: 2,
      counts: [
        { optionId: 'a', votes: 2 },
        { optionId: 'b', votes: 0 },
        { optionId: 'c', votes: 0 },
      ],
    });
    expect(Date.parse(results.endsAt!)).toBe(f.now() + RESULTS_MS);
    expect(f.lastMobile(1n)).toMatchObject({ phase: 'results', myVote: 'a' });
    expect(f.lastMobile(3n)).toMatchObject({ phase: 'results', myVote: null });

    // Question 2 : seul le joueur 3 vote.
    await f.advance(RESULTS_MS);
    expect(f.lastScreen()).toMatchObject({ phase: 'question', questionIndex: 1, totalVotes: 0 });
    expect(f.progress).toEqual([1, 2]);
    await vote(r, 3n, 'q2', 'salty');
    await f.advance(DURATION_MS + TOLERANCE_MS);
    expect(f.lastScreen()).toMatchObject({ phase: 'results', questionIndex: 1, totalVotes: 1 });
    expect(f.awards).toHaveLength(0);
    expect(f.finishCalls()).toBe(0);

    // Fin : points de participation aux trois votants, vue `done`, finish() une fois.
    await f.advance(RESULTS_MS);
    expect(f.lastScreen()).toMatchObject({
      phase: 'done',
      questionIndex: 1,
      endsAt: null,
      pausedRemainingMs: null,
    });
    expect(f.awards.map((a) => [a.playerId, a.points, a.reason]).sort()).toEqual([
      [1n, 300, POLL_PARTICIPATION_REASON],
      [2n, 300, POLL_PARTICIPATION_REASON],
      [3n, 300, POLL_PARTICIPATION_REASON],
    ]);
    expect(f.finishCalls()).toBe(1);
    await r.forceAdvance();
    await f.advance(60_000);
    expect(f.finishCalls()).toBe(1);

    // Toutes les vues émises sont valides ; aucun cue.
    for (const s of f.states) {
      const schema = s.audience === 'mobile' ? pollMobileViewSchema : pollScreenViewSchema;
      expect(schema.safeParse(s.view).success, JSON.stringify(s.view)).toBe(true);
    }
    expect(f.cues).toHaveLength(0);
    // État persisté à chaque phase.
    expect(f.persisted.at(-1)).toMatchObject({
      phase: 'done',
      questionIndex: 1,
      votes: { q1: { '1': 'a', '2': 'a' }, q2: { '3': 'salty' } },
    });
  });

  it('refuses a double vote, an unknown option, a vote out of the question phase or while paused', async () => {
    const { f, r } = await setup([1n, 2n]);
    await r.start();

    await vote(r, 1n, 'q1', 'b');
    await expect(vote(r, 1n, 'q1', 'a')).rejects.toMatchObject({ code: 'ALREADY_VOTED' });
    // Deux votes simultanés : un seul passe (réservation synchrone).
    const both = await Promise.allSettled([vote(r, 2n, 'q1', 'a'), vote(r, 2n, 'q1', 'c')]);
    expect(both.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(f.lastMobile(2n).myVote).toBe('a');

    const { f: g, r: r2 } = await setup([1n, 2n]);
    await r2.start();
    await expect(vote(r2, 1n, 'q1', 'zz')).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    await expect(vote(r2, 1n, 'q2', 'sweet')).rejects.toMatchObject({ code: 'PHASE_CLOSED' });
    await expect(
      r2.onAction(1n, { type: 'answer', payload: { questionId: 'q1', optionId: 'a' } }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_ACTION' });
    await expect(
      r2.onAction(1n, { type: 'vote', payload: { questionId: 'q1' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(vote(r2, 9n, 'q1', 'a')).rejects.toMatchObject({ code: 'PLAYER_NOT_IN_SESSION' });

    await r2.pause();
    await expect(vote(r2, 1n, 'q1', 'a')).rejects.toMatchObject({ code: 'SESSION_PAUSED' });
    await r2.resume();
    await r2.forceAdvance();
    await g.settle();
    expect(g.lastScreen().phase).toBe('results');
    await expect(vote(r2, 1n, 'q1', 'a')).rejects.toMatchObject({ code: 'PHASE_CLOSED' });
    r2.dispose();
  });

  it('ends the vote early when every active player has voted', async () => {
    const { f, r } = await setup([1n, 2n]);
    await r.start();
    await vote(r, 1n, 'q1', 'a');
    expect(f.lastScreen().phase).toBe('question');
    await vote(r, 2n, 'q1', 'b');
    await f.settle();
    expect(f.lastScreen()).toMatchObject({
      phase: 'results',
      totalVotes: 2,
      counts: [
        { optionId: 'a', votes: 1 },
        { optionId: 'b', votes: 1 },
        { optionId: 'c', votes: 0 },
      ],
    });
    // Résultats affichés resultsSeconds, puis la question suivante.
    await f.advance(RESULTS_MS);
    expect(f.lastScreen()).toMatchObject({ phase: 'question', questionIndex: 1 });
  });

  it('awards participation points only to voters still in the round, and none at 0 points', async () => {
    const { f, r, players } = await setup([1n, 2n, 3n]);
    await r.start();
    await vote(r, 1n, 'q1', 'a');
    await vote(r, 2n, 'q1', 'a');
    players.delete('2'); // exclu ou parti
    await r.forceAdvance();
    await r.forceAdvance();
    await f.settle();
    await r.forceAdvance();
    await r.forceAdvance();
    await f.settle();
    expect(f.finishCalls()).toBe(1);
    expect(f.awards).toEqual([
      expect.objectContaining({ playerId: 1n, points: 300, reason: POLL_PARTICIPATION_REASON }),
    ]);

    const { f: g, r: r2 } = await setup([1n], { ...CONFIG, participationPoints: 0 });
    await r2.start();
    await vote(r2, 1n, 'q1', 'a');
    await g.settle();
    for (let i = 0; i < 3; i++) {
      await r2.forceAdvance();
      await g.settle();
    }
    expect(g.finishCalls()).toBe(1);
    expect(g.awards).toHaveLength(0);
    r2.dispose();
  });

  it('pause freezes the deadline (pausedRemainingMs), resume shifts it', async () => {
    const { f, r } = await setup([1n, 2n]);
    await r.start();
    await f.advance(3000);
    await r.pause();
    expect(f.lastScreen()).toMatchObject({
      phase: 'question',
      endsAt: null,
      pausedRemainingMs: DURATION_MS - 3000,
    });
    expect(f.lastMobile(1n)).toMatchObject({ endsAt: null, pausedRemainingMs: DURATION_MS - 3000 });

    // Le temps passe pendant la pause : rien ne change.
    await f.advance(60_000);
    expect(f.lastScreen().phase).toBe('question');

    await r.resume();
    const resumed = f.lastScreen();
    expect(resumed.pausedRemainingMs).toBeNull();
    expect(Date.parse(resumed.endsAt!)).toBe(f.now() + DURATION_MS - 3000);
    await f.advance(DURATION_MS - 3000 + TOLERANCE_MS - 1);
    expect(f.lastScreen().phase).toBe('question');
    await f.advance(1);
    expect(f.lastScreen().phase).toBe('results');

    // Pause pendant les résultats : la suite attend la reprise.
    await f.advance(1000);
    await r.pause();
    expect(f.lastScreen()).toMatchObject({
      phase: 'results',
      pausedRemainingMs: RESULTS_MS - 1000,
    });
    await f.advance(60_000);
    expect(f.lastScreen().phase).toBe('results');
    await r.resume();
    await f.advance(RESULTS_MS - 1000);
    expect(f.lastScreen()).toMatchObject({ phase: 'question', questionIndex: 1 });
  });

  it('forceAdvance: question → results → next question → … → done', async () => {
    const { f, r } = await setup([1n]);
    await r.start();
    const phases = () => `${f.lastScreen().phase}:${f.lastScreen().questionIndex}`;
    expect(phases()).toBe('question:0');
    await r.forceAdvance();
    expect(phases()).toBe('results:0');
    await r.forceAdvance();
    expect(phases()).toBe('question:1');
    await r.forceAdvance();
    expect(phases()).toBe('results:1');
    await r.forceAdvance();
    expect(phases()).toBe('done:1');
    expect(f.finishCalls()).toBe(1);
    // Personne n'a voté : aucun point.
    expect(f.awards).toHaveLength(0);
  });

  it('confidentiality: no distribution before the results, no other player vote in a mobile view', async () => {
    const { f, r } = await setup([1n, 2n, 3n]);
    await r.start();
    await vote(r, 1n, 'q1', 'c');
    await vote(r, 2n, 'q1', 'b');
    await f.advance(250);
    for (const s of f.states) {
      if (s.view.phase !== 'question') continue;
      expect(s.view).not.toHaveProperty('counts');
    }
    // Le joueur 3 n'a pas voté : aucune de ses vues ne mentionne une option choisie.
    for (const s of f.of('mobile:3')) expect(s.view.myVote).toBeNull();
    for (const s of f.of('mobile:2'))
      expect(s.view.myVote === null || s.view.myVote === 'b').toBe(true);
  });

  it('snapshot equals the last view emitted to each recipient; seq grows; emissions are linear', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => BigInt(i + 1));
    const { f, r } = await setup(ids);
    await r.start();
    const before = f.states.length;
    for (const id of ids.slice(0, 29)) await vote(r, id, 'q1', 'a');
    await f.advance(250);
    // 29 vues de votants + compteur écran/console regroupé (2), pas N².
    expect(f.states.length - before).toBeLessThanOrEqual(29 + 2 * 2);

    await vote(r, 30n, 'q1', 'b'); // dernier votant : résultats
    await f.settle();
    for (const key of ['screen', 'console', 'mobile:1', 'mobile:30']) {
      const last = f.of(key).at(-1)!.view;
      const audience: Audience = key.startsWith('mobile') ? 'mobile' : (key as Audience);
      const pid = key.startsWith('mobile:') ? BigInt(key.slice(7)) : undefined;
      expect(JSON.parse(JSON.stringify(r.snapshot(audience, pid)))).toEqual(last);
      const seqs = f.of(key).map((s) => s.seq);
      expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    }

    // Un client qui ne reçoit qu'une vue sur trois finit dans le même état.
    const screen = f.of('screen');
    const sparse = screen.filter((_, i) => i % 3 === 2 || i === screen.length - 1);
    expect(sparse.at(-1)!.view).toEqual(screen.at(-1)!.view);
  });

  it('late joiner votes on the current question', async () => {
    const { f, r, players } = await setup([1n]);
    await r.start();
    players.set('7', { ...meta('Late'), joinedDuringRound: true });
    r.onPlayerJoined(7n, { rejoin: false });
    expect(f.lastMobile(7n)).toMatchObject({ phase: 'question', myVote: null });
    await vote(r, 7n, 'q1', 'b');
    expect(f.lastMobile(7n).myVote).toBe('b');
    await f.advance(250);
    expect(f.lastScreen()).toMatchObject({ totalVotes: 1, totalPlayers: 2 });
  });

  it('restore during a question: resumes at that question results with the persisted votes', async () => {
    // État persisté par une première instance, interrompue pendant le vote de la question 2.
    const first = await setup([1n, 2n]);
    await first.r.start();
    await vote(first.r, 1n, 'q1', 'a');
    await first.r.forceAdvance();
    await first.r.forceAdvance();
    await vote(first.r, 2n, 'q2', 'sweet');
    await first.f.advance(250); // regroupement : votes persistés
    const state = first.f.persisted.at(-1);
    expect(state).toMatchObject({ phase: 'question', questionIndex: 1 });
    first.r.dispose();

    const { f, r } = await setup([1n, 2n], CONFIG, state);
    await r.start();
    expect(f.lastScreen()).toMatchObject({
      phase: 'results',
      questionIndex: 1,
      totalVotes: 1,
      counts: [
        { optionId: 'sweet', votes: 1 },
        { optionId: 'salty', votes: 0 },
      ],
    });
    expect(f.lastMobile(2n)).toMatchObject({ phase: 'results', myVote: 'sweet' });
    await f.advance(RESULTS_MS);
    expect(f.lastScreen().phase).toBe('done');
    expect(f.finishCalls()).toBe(1);
    // Les votes d'avant l'arrêt comptent pour la participation.
    expect(f.awards.map((a) => a.playerId).sort()).toEqual([1n, 2n]);
  });

  it('restore paused: results frozen until resume; restore of a done round finishes without awarding again', async () => {
    const state = { v: 1, phase: 'question', questionIndex: 0, votes: { q1: { '1': 'a' } } };
    const { f, r } = await setup([1n], CONFIG, state);
    await r.pause();
    await r.start();
    expect(f.lastScreen()).toMatchObject({
      phase: 'results',
      endsAt: null,
      pausedRemainingMs: RESULTS_MS,
    });
    await f.advance(60_000);
    expect(f.lastScreen().phase).toBe('results');
    await r.resume();
    await f.advance(RESULTS_MS);
    expect(f.lastScreen()).toMatchObject({ phase: 'question', questionIndex: 1 });
    r.dispose();

    const done = { v: 1, phase: 'done', questionIndex: 1, votes: { q1: { '1': 'a' } } };
    const g = await setup([1n], CONFIG, done);
    await g.r.start();
    expect(g.f.lastScreen().phase).toBe('done');
    expect(g.f.finishCalls()).toBe(1);
    expect(g.f.awards).toHaveLength(0);

    await expect(setup([1n], CONFIG, { v: 1, phase: 'nope' })).rejects.toMatchObject({
      code: 'POLL_RESTORE_INVALID_STATE',
    });
  });

  it('refuses an invalid configuration', async () => {
    const f = createFakeContext(new Map());
    await expect(
      pollEngine.createRound(f.ctx, { id: 1n, configJson: { questions: [] }, quizId: null }),
    ).rejects.toMatchObject({ code: 'POLL_CONFIG_INVALID' });
  });
});
