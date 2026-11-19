import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizScreenView, RoundInfo } from '@quiz-app/validation';

const reportGameIssue = vi.fn();
vi.mock('@/lib/report-issue', () => ({
  reportGameIssue: (...args: unknown[]) => reportGameIssue(...args),
}));

const { useNucStore, selectScreenDisplay } = await import('./nuc-store');
const { subscribeGameCues } = await import('@/lib/game-cues');

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

function questionView(overrides: Partial<Record<string, unknown>> = {}): QuizScreenView {
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
  } as QuizScreenView;
}

function revealView(overrides: Partial<Record<string, unknown>> = {}): QuizScreenView {
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
    ],
    ...overrides,
  } as QuizScreenView;
}

function countdownView(): QuizScreenView {
  return {
    phase: 'countdown',
    questionIndex: -1,
    totalQuestions: 5,
    endsAt: new Date(Date.now() + 5_000).toISOString(),
    pausedRemainingMs: null,
    answeredCount: 0,
    totalPlayers: 3,
    question: null,
  };
}

function gameState(seq: number, view: unknown, roundId = ROUND.roundId, serverNow?: string) {
  return {
    roundId,
    engineKey: 'quiz',
    seq,
    serverNow: serverNow ?? new Date().toISOString(),
    view,
  };
}

function startLobby() {
  const s = useNucStore.getState();
  s.setSessionContext({ sessionId: '1', slugShort: 'ABCD', joinToken: 'tok' });
  s.applyEvent('session:started', { sessionId: '1', audio: null });
  s.applyEvent('round:started', ROUND);
}

beforeEach(() => {
  useNucStore.getState().reset();
  useNucStore.setState({ uiState: 'idle', isPaused: false });
  reportGameIssue.mockClear();
});

describe('nuc store — manche', () => {
  it('keeps the lobby on screen during the quiz countdown, then shows the game', () => {
    startLobby();
    const s = useNucStore.getState();
    s.applyEvent('game:state', gameState(1, countdownView()));
    expect(useNucStore.getState().uiState).toBe('game');
    expect(selectScreenDisplay(useNucStore.getState())).toBe('lobby');

    s.applyEvent('game:state', gameState(2, questionView()));
    expect(selectScreenDisplay(useNucStore.getState())).toBe('game');
    expect(useNucStore.getState().gameView).toMatchObject({ phase: 'question', questionIndex: 1 });
  });

  it('ignores a stale or equal seq (late view)', () => {
    startLobby();
    const s = useNucStore.getState();
    s.applyEvent('game:state', gameState(5, revealView()));
    s.applyEvent('game:state', gameState(4, questionView()));
    s.applyEvent('game:state', gameState(5, questionView()));
    expect(useNucStore.getState().gameSeq).toBe(5);
    expect(useNucStore.getState().gameView).toMatchObject({ phase: 'reveal' });
  });

  it('ignores a view of another round', () => {
    startLobby();
    useNucStore.getState().applyEvent('game:state', gameState(1, questionView(), '99'));
    expect(useNucStore.getState().gameView).toBeNull();
    expect(useNucStore.getState().uiState).toBe('lobby');
  });

  it('full-view property: the last message alone gives the same state as all messages', () => {
    const views = [
      countdownView(),
      questionView({ answeredCount: 0 }),
      questionView({ answeredCount: 1 }),
      questionView({ answeredCount: 2, pausedRemainingMs: 4000, endsAt: null }),
      revealView(),
      questionView({ questionIndex: 2, answeredCount: 0 }),
    ];

    startLobby();
    views.forEach((v, i) => useNucStore.getState().applyEvent('game:state', gameState(i + 1, v)));
    const all = useNucStore.getState();
    const allPick = {
      gameView: all.gameView,
      gameSeq: all.gameSeq,
      uiState: all.uiState,
      display: selectScreenDisplay(all),
    };

    useNucStore.getState().reset();
    startLobby();
    // Un message sur trois, puis le dernier.
    views.forEach((v, i) => {
      if (i % 3 === 0 || i === views.length - 1) {
        useNucStore.getState().applyEvent('game:state', gameState(i + 1, v));
      }
    });
    const some = useNucStore.getState();
    expect({
      gameView: some.gameView,
      gameSeq: some.gameSeq,
      uiState: some.uiState,
      display: selectScreenDisplay(some),
    }).toEqual(allPick);
  });

  it('applies the snapshot round fields, then ignores views with seq <= gameSeq', () => {
    useNucStore.getState().applySnapshot({
      nuc: {
        nucId: '3',
        screenId: '4',
        cinemaSlug: 'c',
        cinemaName: 'Ciné',
        cinemaLogoUrl: null,
        backgroundMusicUrl: null,
      },
      session: {
        sessionId: '1',
        slugShort: 'ABCD',
        joinToken: 'tok',
        state: 'paused',
        totalPlayers: 3,
      },
      audioMuted: false,
      players: [],
      scoreboard: [],
      round: ROUND,
      gameView: questionView({ pausedRemainingMs: 6000, endsAt: null }),
      gameSeq: 8,
    });
    let st = useNucStore.getState();
    expect(st.uiState).toBe('game');
    expect(st.isPaused).toBe(true);
    expect(st.joinToken).toBe('tok');
    expect(st.gameSeq).toBe(8);

    st.applyEvent('game:state', gameState(8, revealView()));
    st = useNucStore.getState();
    expect(st.gameView).toMatchObject({ phase: 'question', pausedRemainingMs: 6000 });

    st.applyEvent('session:resumed', {});
    st.applyEvent('game:state', gameState(9, questionView()));
    st = useNucStore.getState();
    expect(st.isPaused).toBe(false);
    expect(st.gameSeq).toBe(9);
  });

  it('running snapshot without a view keeps the lobby', () => {
    useNucStore.getState().applySnapshot({
      session: { sessionId: '1', slugShort: 'ABCD', state: 'running', totalPlayers: 0 },
      round: null,
      gameView: null,
      gameSeq: 0,
    });
    expect(useNucStore.getState().uiState).toBe('lobby');
  });

  it('invalid view: fallback state and a single Sentry message, never an exception', () => {
    startLobby();
    const s = useNucStore.getState();
    expect(() =>
      s.applyEvent('game:state', gameState(1, { phase: 'question', nonsense: true })),
    ).not.toThrow();
    s.applyEvent('game:state', gameState(2, { phase: 'nope' }));
    const st = useNucStore.getState();
    expect(st.gameViewInvalid).toBe(true);
    expect(st.gameView).toBeNull();
    expect(selectScreenDisplay(st)).toBe('game');
    expect(reportGameIssue).toHaveBeenCalledTimes(1);

    // La vue valide suivante reprend la main.
    s.applyEvent('game:state', gameState(3, questionView()));
    expect(useNucStore.getState().gameViewInvalid).toBe(false);
  });

  it('unknown engine: fallback and Sentry', () => {
    const s = useNucStore.getState();
    s.setSessionContext({ sessionId: '1', slugShort: 'ABCD' });
    s.applyEvent('round:started', { ...ROUND, engineKey: 'mystery' });
    s.applyEvent('game:state', { ...gameState(1, {}), engineKey: 'mystery' });
    expect(useNucStore.getState().gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledWith(
      'screen: invalid game view',
      expect.objectContaining({ reason: 'unknown_engine' }),
    );
  });

  it('estimates the clock offset from serverNow (median)', () => {
    startLobby();
    const ahead = new Date(Date.now() + 2000).toISOString();
    useNucStore.getState().applyEvent('game:state', gameState(1, questionView(), '7', ahead));
    const offset = useNucStore.getState().clockOffsetMs;
    expect(offset).toBeGreaterThan(1900);
    expect(offset).toBeLessThan(2100);
  });

  it('relays cues of the active round only, without storing them', () => {
    startLobby();
    const received: unknown[] = [];
    const unsubscribe = subscribeGameCues((c) => received.push(c));
    const s = useNucStore.getState();
    const data = { playerId: '10', pseudo: 'Alice', avatarUrl: null };
    s.applyEvent('game:cue', { roundId: '7', cue: 'player_answered', data });
    s.applyEvent('game:cue', { roundId: '99', cue: 'player_answered', data });
    s.applyEvent('game:cue', { nonsense: true });
    unsubscribe();
    expect(received).toEqual([{ roundId: '7', engineKey: 'quiz', cue: 'player_answered', data }]);
  });

  it('last round: round:ended keeps the game until session:ended shows the final results', () => {
    startLobby();
    const s = useNucStore.getState();
    s.applyEvent('game:state', gameState(1, revealView({ endsAt: null })));
    const board = {
      roundId: '7',
      position: 1,
      totalRounds: 1,
      scoreboard: [
        { playerId: '10', pseudo: 'Alice', avatarUrl: null, scoreTotal: 900, scoreThisRound: 900 },
      ],
    };
    s.applyEvent('round:ended', board);
    expect(useNucStore.getState().uiState).toBe('game');
    expect(useNucStore.getState().roundScoreboard).toEqual(board);
    s.applyEvent('session:ended', {
      finalScoreboard: [
        { playerId: '10', pseudo: 'Alice', avatarUrl: null, scoreTotal: 900, rank: 1 },
      ],
      winnerPlayerId: '10',
    });
    expect(useNucStore.getState().uiState).toBe('final_results');
  });

  it('round:ended before the last round shows the round-end scoreboard', () => {
    startLobby();
    useNucStore.getState().applyEvent('round:started', { ...ROUND, totalRounds: 2 });
    useNucStore.getState().applyEvent('game:state', gameState(1, revealView({ endsAt: null })));
    useNucStore
      .getState()
      .applyEvent('round:ended', { roundId: '7', position: 1, totalRounds: 2, scoreboard: [] });
    expect(useNucStore.getState().uiState).toBe('round_end');

    // La manche suivante reprend l'écran.
    const next = { ...ROUND, roundId: '8', position: 2, totalRounds: 2 };
    useNucStore.getState().applyEvent('round:started', next);
    expect(useNucStore.getState().gameSeq).toBe(0);
    useNucStore.getState().applyEvent('game:state', gameState(1, questionView(), '8'));
    expect(useNucStore.getState().uiState).toBe('game');
  });

  it('pause is an overlay over the current state', () => {
    startLobby();
    const s = useNucStore.getState();
    s.applyEvent('game:state', gameState(1, questionView()));
    s.applyEvent('session:paused', {});
    expect(useNucStore.getState().isPaused).toBe(true);
    expect(useNucStore.getState().uiState).toBe('game');
  });
});

describe('nuc store — plusieurs manches (B5)', () => {
  const ROUND2: RoundInfo = { ...ROUND, roundId: '8', position: 2, totalRounds: 2 };
  const BOARD = {
    roundId: '7',
    position: 1,
    totalRounds: 2,
    scoreboard: [
      { playerId: '10', pseudo: 'Alice', avatarUrl: null, scoreTotal: 900, scoreThisRound: 900 },
    ],
  };

  it('round 2 countdown keeps the round-end board on screen (no lobby), then the game', () => {
    startLobby();
    const s = useNucStore.getState();
    s.applyEvent('round:started', { ...ROUND, totalRounds: 2 });
    s.applyEvent('game:state', gameState(1, revealView()));
    s.applyEvent('round:ended', BOARD);
    expect(selectScreenDisplay(useNucStore.getState())).toBe('round_end');

    s.applyEvent('round:started', ROUND2);
    expect(useNucStore.getState().roundScoreboard).toEqual(BOARD);
    s.applyEvent('game:state', gameState(1, countdownView(), '8'));
    expect(useNucStore.getState().uiState).toBe('game');
    expect(selectScreenDisplay(useNucStore.getState())).toBe('round_end');

    s.applyEvent('game:state', gameState(2, questionView(), '8'));
    expect(selectScreenDisplay(useNucStore.getState())).toBe('game');
  });

  it('session:theme_changed applies the backgrounds and sounds of the next round', () => {
    startLobby();
    useNucStore.getState().applyEvent('session:theme_changed', {
      quiz: {
        backgroundMediaUrl: 'https://cdn.example/bg2.jpg',
        backgroundMediaType: 'image',
        backgroundOverlayOpacity: 30,
        lobbyBackgroundMediaUrl: null,
        lobbyBackgroundMediaType: null,
        lobbyBackgroundOverlayOpacity: 0,
        brandingJson: null,
      },
      audio: null,
    });
    const st = useNucStore.getState();
    expect(st.quizBackgroundMediaUrl).toBe('https://cdn.example/bg2.jpg');
    expect(st.quizBackgroundOverlayOpacity).toBe(30);
    expect(st.uiState).toBe('lobby');
  });

  it('a snapshot during the interlude shows the round-end board', () => {
    useNucStore.getState().applySnapshot({
      nuc: {
        nucId: '3',
        screenId: '4',
        cinemaSlug: 'c',
        cinemaName: 'Ciné',
        cinemaLogoUrl: null,
        backgroundMusicUrl: null,
      },
      session: {
        sessionId: '1',
        slugShort: 'ABCD',
        joinToken: 'tok',
        state: 'running',
        totalPlayers: 1,
      },
      audioMuted: false,
      players: [],
      scoreboard: [],
      round: null,
      gameView: null,
      gameSeq: 0,
      roundEnded: BOARD,
    });
    const st = useNucStore.getState();
    expect(st.uiState).toBe('round_end');
    expect(st.roundScoreboard).toEqual(BOARD);
  });
});
