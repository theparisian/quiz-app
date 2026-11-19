import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizConsoleView, RoundInfo } from '@quiz-app/validation';

const reportGameIssue = vi.fn();
vi.mock('@/lib/report-issue', () => ({
  reportGameIssue: (...args: unknown[]) => reportGameIssue(...args),
}));

const {
  useLiveSessionStore,
  selectCanForceAdvance,
  selectProgressLabel,
  selectRoundContent,
  selectInterlude,
  selectHasNextRound,
  selectRoundLabel,
} = await import('./live-session-store');

const ROUND: RoundInfo = {
  roundId: '7',
  position: 1,
  totalRounds: 1,
  engineKey: 'quiz',
  game: { slug: 'quiz-cine', title: 'Quiz ciné', kind: 'internal', sponsor: null },
};

const QUESTION = {
  id: '42',
  position: 2,
  text: 'Quelle est la capitale ?',
  imageUrl: null,
  timeLimitMs: 15000,
  answers: [
    { id: '1', position: 'A', text: 'Paris' },
    { id: '2', position: 'B', text: 'Lyon' },
  ],
};

function questionView(overrides: Partial<Record<string, unknown>> = {}): QuizConsoleView {
  return {
    phase: 'question',
    questionIndex: 1,
    totalQuestions: 5,
    endsAt: new Date(Date.now() + 10_000).toISOString(),
    pausedRemainingMs: null,
    answeredCount: 0,
    totalPlayers: 3,
    question: QUESTION,
    ...overrides,
  } as QuizConsoleView;
}

function revealView(overrides: Partial<Record<string, unknown>> = {}): QuizConsoleView {
  return {
    phase: 'reveal',
    questionIndex: 1,
    totalQuestions: 5,
    endsAt: new Date(Date.now() + 8_000).toISOString(),
    pausedRemainingMs: null,
    answeredCount: 2,
    totalPlayers: 3,
    question: QUESTION,
    correctAnswerId: '1',
    explanation: 'Évidemment.',
    revealedAt: new Date().toISOString(),
    scoreboard: [
      {
        playerId: '10',
        pseudo: 'Alice',
        avatarUrl: null,
        scoreTotal: 900,
        scoreThisQuestion: 900,
        rank: 1,
      },
      {
        playerId: '11',
        pseudo: 'Bob',
        avatarUrl: null,
        scoreTotal: 0,
        scoreThisQuestion: 0,
        rank: 2,
      },
    ],
    ...overrides,
  } as QuizConsoleView;
}

function gameState(seq: number, view: unknown, roundId = ROUND.roundId, serverNow = new Date()) {
  return { roundId, engineKey: 'quiz', seq, serverNow: serverNow.toISOString(), view };
}

const apply = (event: string, payload: unknown) =>
  useLiveSessionStore.getState().applyEvent(event, payload);

function startRunning() {
  useLiveSessionStore.getState().applySocketSnapshot({
    session: {
      sessionId: '1',
      slugShort: 'ABCD',
      joinToken: 'tok',
      state: 'lobby',
      totalPlayers: 2,
      audioMuted: false,
    },
    players: [
      {
        playerId: '10',
        pseudo: 'Alice',
        avatarUrl: null,
        scoreTotal: 0,
        joinedAt: new Date().toISOString(),
      },
      {
        playerId: '11',
        pseudo: 'Bob',
        avatarUrl: null,
        scoreTotal: 0,
        joinedAt: new Date().toISOString(),
      },
    ],
    round: null,
    gameView: null,
    gameSeq: 0,
  });
  apply('session:started', { sessionId: '1' });
  apply('round:started', ROUND);
}

beforeEach(() => {
  useLiveSessionStore.getState().reset();
  reportGameIssue.mockClear();
});

describe('live-session-store — manche', () => {
  it('applies a question view from game:state and exposes the engine rules', () => {
    startRunning();
    apply('game:state', gameState(1, questionView()));
    const s = useLiveSessionStore.getState();
    expect(s.state).toBe('running');
    expect(s.round).toEqual(ROUND);
    expect(s.gameSeq).toBe(1);
    expect((s.gameView as QuizConsoleView).phase).toBe('question');
    expect(selectProgressLabel(s)).toBe('Question 2 / 5');
    expect(selectCanForceAdvance(s)).toBe(true);
  });

  it('ignores a stale or equal seq', () => {
    startRunning();
    apply('game:state', gameState(3, questionView({ answeredCount: 2 })));
    apply('game:state', gameState(2, questionView({ answeredCount: 1 })));
    apply('game:state', gameState(3, questionView({ answeredCount: 0 })));
    const s = useLiveSessionStore.getState();
    expect(s.gameSeq).toBe(3);
    expect((s.gameView as QuizConsoleView).answeredCount).toBe(2);
  });

  it('ignores a view of another round', () => {
    startRunning();
    apply('game:state', gameState(1, questionView(), '99'));
    expect(useLiveSessionStore.getState().gameView).toBeNull();
  });

  it('respects the seq of a snapshot', () => {
    useLiveSessionStore.getState().applySocketSnapshot({
      session: {
        sessionId: '1',
        slugShort: 'ABCD',
        state: 'running',
        totalPlayers: 2,
        audioMuted: false,
      },
      players: [],
      round: ROUND,
      gameView: revealView(),
      gameSeq: 5,
    });
    apply('game:state', gameState(4, questionView()));
    let s = useLiveSessionStore.getState();
    expect((s.gameView as QuizConsoleView).phase).toBe('reveal');
    expect(selectCanForceAdvance(s)).toBe(false);
    apply('game:state', gameState(6, questionView({ questionIndex: 2 })));
    s = useLiveSessionStore.getState();
    expect(s.gameSeq).toBe(6);
    expect(selectProgressLabel(s)).toBe('Question 3 / 5');
  });

  it('full view: a client receiving one game:state out of three ends like a client receiving all', () => {
    const views: unknown[] = [
      { ...questionView(), phase: 'countdown', questionIndex: -1, question: null },
    ];
    for (let n = 0; n < 6; n += 1) views.push(questionView({ answeredCount: n }));
    views.push(revealView());
    views.push(questionView({ questionIndex: 2, answeredCount: 0 }));
    views.push(questionView({ questionIndex: 2, answeredCount: 1 }));
    views.push(revealView({ questionIndex: 2 }));

    const finalState = (every: number) => {
      useLiveSessionStore.getState().reset();
      startRunning();
      views.forEach((v, i) => {
        const isLast = i === views.length - 1;
        if (i % every === 0 || isLast) apply('game:state', gameState(i + 1, v));
      });
      const s = useLiveSessionStore.getState();
      return {
        gameView: s.gameView,
        gameSeq: s.gameSeq,
        players: s.players.map((p) => [p.playerId, p.scoreTotal]),
        progress: selectProgressLabel(s),
      };
    };

    expect(finalState(3)).toEqual(finalState(1));
  });

  it('updates the players scores from the reveal scoreboard', () => {
    startRunning();
    apply('game:state', gameState(1, revealView()));
    const players = useLiveSessionStore.getState().players;
    expect(players.find((p) => p.playerId === '10')?.scoreTotal).toBe(900);
    expect(players).toHaveLength(2);
  });

  it('invalid view → fallback and a single Sentry message, never a throw', () => {
    startRunning();
    apply('game:state', gameState(1, questionView()));
    expect(() =>
      apply('game:state', gameState(2, { phase: 'question', bogus: true })),
    ).not.toThrow();
    apply('game:state', gameState(3, { phase: 'nope' }));
    const s = useLiveSessionStore.getState();
    expect(s.gameViewInvalid).toBe(true);
    expect(s.gameView).toBeNull();
    expect(s.gameSeq).toBe(3);
    expect(reportGameIssue).toHaveBeenCalledTimes(1);
    expect(reportGameIssue.mock.calls[0]?.[0]).toBe('console: invalid game view');
    // Repli : le bouton reste actif, le serveur décide.
    expect(selectCanForceAdvance(s)).toBe(true);
    // La vue valide suivante reprend la main.
    apply('game:state', gameState(4, questionView()));
    expect(useLiveSessionStore.getState().gameViewInvalid).toBe(false);
  });

  it('unknown engine → fallback', () => {
    startRunning();
    apply('round:started', { ...ROUND, roundId: '8', engineKey: 'mystery' });
    apply('game:state', { ...gameState(1, { anything: 1 }, '8'), engineKey: 'mystery' });
    const s = useLiveSessionStore.getState();
    expect(s.gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledWith(
      'console: invalid game view',
      expect.objectContaining({ reason: 'unknown_engine' }),
    );
  });

  it('computes the clock offset from serverNow, even for an ignored view', () => {
    startRunning();
    const ahead = new Date(Date.now() + 60_000);
    apply('game:state', gameState(1, questionView(), ROUND.roundId, ahead));
    apply('game:state', gameState(1, questionView(), ROUND.roundId, ahead));
    const offset = useLiveSessionStore.getState().clockOffsetMs;
    expect(offset).toBeGreaterThan(59_000);
    expect(offset).toBeLessThan(61_000);
    expect(useLiveSessionStore.getState().clockSamples).toHaveLength(2);
  });

  it('round:ended keeps the scoreboard and updates scores', () => {
    startRunning();
    apply('round:ended', {
      roundId: '7',
      position: 1,
      totalRounds: 1,
      scoreboard: [
        { playerId: '11', pseudo: 'Bob', avatarUrl: null, scoreTotal: 1200, scoreThisRound: 1200 },
      ],
    });
    const s = useLiveSessionStore.getState();
    expect(s.roundScoreboard?.scoreboard).toHaveLength(1);
    expect(s.players.find((p) => p.playerId === '11')?.scoreTotal).toBe(1200);
  });

  it('a snapshot without quiz content is applied (platform fields, ended state)', () => {
    useLiveSessionStore.getState().applySocketSnapshot({
      session: {
        sessionId: '1',
        slugShort: 'ABCD',
        state: 'ended',
        totalPlayers: 1,
        audioMuted: true,
      },
      players: [],
      round: null,
      gameView: null,
      gameSeq: 0,
      finalScoreboard: [
        { playerId: '10', pseudo: 'Alice', avatarUrl: null, scoreTotal: 900, rank: 1 },
      ],
    });
    const s = useLiveSessionStore.getState();
    expect(s.state).toBe('ended');
    expect(s.audioMuted).toBe(true);
    expect(s.finalScoreboard?.[0]?.pseudo).toBe('Alice');
    expect(s.round).toBeNull();
  });
});

describe('live-session-store — plusieurs manches (B5)', () => {
  const ROUND2: RoundInfo = {
    roundId: '8',
    position: 2,
    totalRounds: 2,
    engineKey: 'quiz',
    game: { slug: 'quiz-musique', title: 'Quiz musique', kind: 'internal', sponsor: null },
  };
  const content = (id: string) => ({
    id,
    slug: `quiz-${id}`,
    title: `Quiz ${id}`,
    coverImageUrl: null,
    questions: [],
  });

  function hydrate() {
    useLiveSessionStore.getState().hydrateFromSession({
      id: '1',
      slugShort: 'ABCD',
      state: 'running',
      totalPlayers: 0,
      screenId: '3',
      screenName: 'S1',
      cinemaName: 'Ciné',
      backgroundMusicUrl: null,
      quiz: content('A'),
      rounds: [
        {
          roundId: '7',
          position: 1,
          state: 'running',
          game: { slug: 'quiz-cine', title: 'Quiz ciné', engineKey: 'quiz', kind: 'internal' },
          content: content('A'),
        },
        {
          roundId: '8',
          position: 2,
          state: 'pending',
          game: {
            slug: 'quiz-musique',
            title: 'Quiz musique',
            engineKey: 'quiz',
            kind: 'internal',
          },
          content: content('B'),
        },
      ],
      players: [],
    });
  }

  it('the console content is the one of the active round', () => {
    hydrate();
    apply('round:started', { ...ROUND, totalRounds: 2 });
    expect(selectRoundContent(useLiveSessionStore.getState())?.id).toBe('A');
    apply('round:started', ROUND2);
    expect(selectRoundContent(useLiveSessionStore.getState())?.id).toBe('B');
  });

  it('legacy session without rounds: the session quiz is the content', () => {
    hydrate();
    useLiveSessionStore.setState({ rounds: [] });
    apply('round:started', ROUND);
    expect(selectRoundContent(useLiveSessionStore.getState())?.id).toBe('A');
  });

  it('header label, interlude after round:ended, next round button', () => {
    hydrate();
    apply('round:started', { ...ROUND, totalRounds: 2 });
    const st = () => useLiveSessionStore.getState();
    expect(selectRoundLabel(st())).toBe('Manche 1/2 — Quiz ciné');
    expect(selectInterlude(st())).toBeNull();
    expect(selectHasNextRound(st())).toBe(true);

    apply('round:ended', { roundId: '7', position: 1, totalRounds: 2, scoreboard: [] });
    expect(selectInterlude(st())).toMatchObject({ position: 1 });
    expect(selectHasNextRound(st())).toBe(true);

    apply('round:started', ROUND2);
    expect(selectInterlude(st())).toBeNull();
    expect(selectRoundLabel(st())).toBe('Manche 2/2 — Quiz musique');
    // Dernière manche : pas de manche suivante.
    expect(selectHasNextRound(st())).toBe(false);
  });

  it('a snapshot during the interlude restores the round-end board', () => {
    hydrate();
    useLiveSessionStore.getState().applySocketSnapshot({
      session: {
        sessionId: '1',
        slugShort: 'ABCD',
        state: 'running',
        totalPlayers: 0,
        audioMuted: false,
      },
      players: [],
      round: null,
      gameView: null,
      gameSeq: 0,
      roundEnded: { roundId: '7', position: 1, totalRounds: 2, scoreboard: [] },
    });
    const st = useLiveSessionStore.getState();
    expect(selectInterlude(st)).toMatchObject({ roundId: '7' });
    expect(selectRoundLabel(st)).toBe('Manche 1/2 — Quiz ciné');
  });
});

describe('live-session-store — moteur sondage (B6)', () => {
  it('poll views validated by the poll schema, poll rules for the header and force-advance', () => {
    startRunning();
    apply('round:started', { ...ROUND, roundId: '9', engineKey: 'poll' });
    const view = {
      phase: 'results',
      questionIndex: 0,
      totalQuestions: 2,
      question: {
        id: 'q1',
        text: 'Film ?',
        options: [
          { id: 'a', text: 'Alien' },
          { id: 'b', text: 'Brazil' },
        ],
        durationMs: 20000,
      },
      endsAt: new Date(Date.now() + 5000).toISOString(),
      pausedRemainingMs: null,
      totalVotes: 2,
      totalPlayers: 2,
      counts: [
        { optionId: 'a', votes: 1 },
        { optionId: 'b', votes: 1 },
      ],
    };
    apply('game:state', { ...gameState(1, view, '9'), engineKey: 'poll' });
    let s = useLiveSessionStore.getState();
    expect(s.gameViewInvalid).toBe(false);
    expect(s.gameView).toMatchObject({ phase: 'results', totalVotes: 2 });
    expect(selectProgressLabel(s)).toBe('Sondage — question 1 / 2');
    expect(selectCanForceAdvance(s)).toBe(true);

    apply('game:state', { ...gameState(2, { ...view, phase: 'done' }, '9'), engineKey: 'poll' });
    s = useLiveSessionStore.getState();
    expect(selectCanForceAdvance(s)).toBe(false);

    // Une vue de quiz sur une manche sondage : repli.
    apply('game:state', { ...gameState(3, questionView(), '9'), engineKey: 'poll' });
    expect(useLiveSessionStore.getState().gameViewInvalid).toBe(true);
  });
});
