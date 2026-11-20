import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizMobileView, RoundInfo } from '@quiz-app/validation';

const reportGameIssue = vi.fn();
vi.mock('@/lib/report-issue', () => ({
  reportGameIssue: (...args: unknown[]) => reportGameIssue(...args),
}));

const { usePlayerStore } = await import('./player-store');

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
  imageUrl: '/media/q.png',
  timeLimitMs: 15000,
  answers: [
    { id: '1', position: 'A', text: 'Paris' },
    { id: '2', position: 'B', text: 'Lyon' },
    { id: '3', position: 'C', text: 'Marseille' },
    { id: '4', position: 'D', text: 'Bordeaux' },
  ],
};

const NO_ME = { answerId: null, locked: false, result: null };

function questionView(overrides: Partial<QuizMobileView> = {}): QuizMobileView {
  return {
    phase: 'question',
    questionIndex: 1,
    totalQuestions: 5,
    endsAt: new Date(Date.now() + 10_000).toISOString(),
    pausedRemainingMs: null,
    answeredCount: 0,
    totalPlayers: 3,
    question: QUESTION,
    me: NO_ME,
    ...overrides,
  } as QuizMobileView;
}

function revealView(me: QuizMobileView['me']): QuizMobileView {
  return {
    phase: 'reveal',
    questionIndex: 1,
    totalQuestions: 5,
    endsAt: new Date(Date.now() + 5_000).toISOString(),
    pausedRemainingMs: null,
    answeredCount: 2,
    totalPlayers: 3,
    question: QUESTION,
    correctAnswerId: '1',
    explanation: null,
    revealedAt: new Date().toISOString(),
    me,
  };
}

function gameState(seq: number, view: unknown, serverNow = new Date().toISOString()) {
  return { roundId: ROUND.roundId, engineKey: 'quiz', seq, serverNow, view };
}

function snapshot(state: string, extra: Record<string, unknown> = {}) {
  return {
    player: { playerId: 'p1', pseudo: 'Alice', scoreTotal: 0, currentRank: null },
    session: { sessionId: 's1', slugShort: 'ABC123', state, totalPlayers: 3 },
    round: null,
    gameView: null,
    gameSeq: 0,
    ...extra,
  };
}

const store = () => usePlayerStore.getState();

describe('usePlayerStore', () => {
  beforeEach(() => {
    store().reset();
    reportGameIssue.mockClear();
    store().applySnapshot(snapshot('lobby'));
  });

  it('applies the question view from game:state after round:started', () => {
    store().applyEvent('round:started', ROUND);
    expect(store().round).toEqual(ROUND);
    expect(store().uiState).toBe('lobby');

    store().applyEvent('game:state', gameState(1, questionView()));

    const s = store();
    expect(s.uiState).toBe('game');
    expect(s.gameSeq).toBe(1);
    const view = s.gameView as QuizMobileView;
    expect(view.phase).toBe('question');
    expect(view.question?.text).toBe('Quelle est la capitale ?');
    expect(view.question?.imageUrl).toBe('/media/q.png');
    expect(view.question?.timeLimitMs).toBe(15000);
    expect(view.question?.answers.map((a) => a.text)).toEqual([
      'Paris',
      'Lyon',
      'Marseille',
      'Bordeaux',
    ]);
  });

  it('restores the question from the snapshot gameView', () => {
    store().applySnapshot(
      snapshot('running', { round: ROUND, gameView: questionView(), gameSeq: 4 }),
    );

    const s = store();
    expect(s.uiState).toBe('game');
    expect(s.round?.roundId).toBe('7');
    expect(s.gameSeq).toBe(4);
    expect((s.gameView as QuizMobileView).question?.answers.map((a) => a.text)).toEqual([
      'Paris',
      'Lyon',
      'Marseille',
      'Bordeaux',
    ]);
  });

  it('ignores an old seq received late (and an equal one)', () => {
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', gameState(1, questionView()));
    const answered = questionView({ me: { answerId: '2', locked: false, result: null } });
    store().applyEvent('game:state', gameState(3, answered));
    const reveal = revealView({
      answerId: '2',
      locked: false,
      result: { isCorrect: false, points: 0, rank: 2, scoreTotal: 100 },
    });
    store().applyEvent('game:state', gameState(4, reveal));

    // Vue 2 (question, sans réponse) arrivée en retard : ignorée.
    store().applyEvent('game:state', gameState(2, questionView()));
    // Même seq rejoué : ignoré.
    store().applyEvent('game:state', gameState(4, questionView()));

    expect(store().gameSeq).toBe(4);
    expect(store().gameView).toBe(reveal);
  });

  it('ignores game:state older than the snapshot gameSeq', () => {
    const fromSnapshot = questionView({ me: { answerId: '1', locked: false, result: null } });
    store().applySnapshot(
      snapshot('running', { round: ROUND, gameView: fromSnapshot, gameSeq: 5 }),
    );

    store().applyEvent('game:state', gameState(5, questionView()));
    expect(store().gameView).toBe(fromSnapshot);

    const next = revealView(NO_ME);
    store().applyEvent('game:state', gameState(6, next));
    expect(store().gameView).toBe(next);
  });

  it('ignores game:state for another round', () => {
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', { ...gameState(1, questionView()), roundId: '8' });
    expect(store().gameView).toBeNull();
    expect(store().uiState).toBe('lobby');
  });

  it('full view: receiving only the last game:state gives the same state as all of them', () => {
    const views = [
      questionView(),
      questionView({ me: { answerId: '1', locked: false, result: null } }),
      revealView({
        answerId: '1',
        locked: false,
        result: { isCorrect: true, points: 900, rank: 1, scoreTotal: 900 },
      }),
    ];
    store().applyEvent('round:started', ROUND);
    views.forEach((v, i) => store().applyEvent('game:state', gameState(i + 1, v)));
    const all = store();

    store().reset();
    store().applySnapshot(snapshot('lobby'));
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', gameState(3, views[2]));
    const last = store();

    expect(last.gameView).toEqual(all.gameView);
    expect(last.gameSeq).toBe(all.gameSeq);
    expect(last.uiState).toBe(all.uiState);
  });

  it('invalid view: fallback flag and one Sentry message, never a throw', () => {
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', gameState(1, { phase: 'question', question: 'oops' }));

    expect(store().gameViewInvalid).toBe(true);
    expect(store().gameView).toBeNull();
    expect(store().uiState).toBe('game');
    expect(reportGameIssue).toHaveBeenCalledTimes(1);

    // Une deuxième vue invalide de la même manche n'est pas signalée à nouveau.
    store().applyEvent('game:state', gameState(2, { phase: 'nope' }));
    expect(reportGameIssue).toHaveBeenCalledTimes(1);

    // La vue valide suivante remplace le repli.
    store().applyEvent('game:state', gameState(3, questionView()));
    expect(store().gameViewInvalid).toBe(false);
    expect((store().gameView as QuizMobileView).phase).toBe('question');
  });

  it('unknown engine: fallback and Sentry message', () => {
    store().applyEvent('round:started', { ...ROUND, engineKey: 'poll-v9' });
    store().applyEvent('game:state', { ...gameState(1, { anything: true }), engineKey: 'poll-v9' });
    expect(store().gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledTimes(1);
  });

  it('computes the clock offset (median) from serverNow', () => {
    store().applyEvent('round:started', ROUND);
    const ahead = new Date(Date.now() + 2000).toISOString();
    store().applyEvent('game:state', gameState(1, questionView(), ahead));
    expect(store().clockOffsetMs).toBeGreaterThan(1900);
    expect(store().clockOffsetMs).toBeLessThanOrEqual(2000);
  });

  it('pause and resume keep the view; round:ended on the last round waits for session:ended', () => {
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', gameState(1, questionView()));
    store().applyEvent('session:paused', {});
    expect(store().uiState).toBe('paused');
    store().applyEvent('session:resumed', {});
    expect(store().uiState).toBe('game');

    store().applyEvent('round:ended', {
      roundId: '7',
      position: 1,
      totalRounds: 1,
      scoreboard: [
        { playerId: 'p2', pseudo: 'Bob', avatarUrl: null, scoreTotal: 900, scoreThisRound: 900 },
        { playerId: 'p1', pseudo: 'Alice', avatarUrl: null, scoreTotal: 400, scoreThisRound: 400 },
      ],
    });
    expect(store().roundScoreboard?.scoreboard).toHaveLength(2);
    expect(store().scoreTotal).toBe(400);
    expect(store().currentRank).toBe(2);
    expect(store().uiState).toBe('game');

    store().applyEvent('session:ended', {
      finalScoreboard: [
        { playerId: 'p2', pseudo: 'Bob', scoreTotal: 900, rank: 1 },
        { playerId: 'p1', pseudo: 'Alice', scoreTotal: 400, rank: 2 },
      ],
      winnerPlayerId: 'p2',
    });
    expect(store().uiState).toBe('final_results');
    expect(store().finalRank).toBe(2);
  });

  it('round:ended before the last round shows the round-end screen', () => {
    store().applyEvent('round:started', { ...ROUND, totalRounds: 2 });
    store().applyEvent('game:state', gameState(1, questionView()));
    store().applyEvent('round:ended', {
      roundId: '7',
      position: 1,
      totalRounds: 2,
      scoreboard: [
        { playerId: 'p1', pseudo: 'Alice', avatarUrl: null, scoreTotal: 400, scoreThisRound: 400 },
      ],
    });
    expect(store().uiState).toBe('round_end');
  });

  it('PLAYER_KICKED: kicked screen that later events do not leave', () => {
    store().applyEvent('round:started', ROUND);
    store().applyEvent('game:state', gameState(1, questionView()));
    store().markKicked();
    expect(store().uiState).toBe('kicked');

    store().applyEvent('game:state', gameState(2, revealView(NO_ME)));
    store().applyEvent('session:ended', { finalScoreboard: [], winnerPlayerId: null });
    store().applySnapshot(snapshot('running'));
    expect(store().uiState).toBe('kicked');
  });

  it('late join: the snapshot joinedLate flag survives a page reload (final screen label)', () => {
    // Rechargement : store vierge, seul le snapshot de player:resume est appliqué.
    store().reset();
    store().applySnapshot(
      snapshot('ended', {
        player: {
          playerId: 'p1',
          pseudo: 'Alice',
          scoreTotal: 0,
          currentRank: null,
          joinedLate: true,
        },
        finalResults: { rank: 2, finalScoreboard: [] },
      }),
    );
    expect(store().uiState).toBe('final_results');
    expect(store().joinedLate).toBe(true);

    // Un joueur arrivé au lobby : false, même si le store disait l'inverse.
    store().applySnapshot(
      snapshot('ended', {
        player: {
          playerId: 'p1',
          pseudo: 'Alice',
          scoreTotal: 0,
          currentRank: null,
          joinedLate: false,
        },
        finalResults: { rank: 2, finalScoreboard: [] },
      }),
    );
    expect(store().joinedLate).toBe(false);
  });

  it('late join: hydrate with a locked question view goes straight to the game', () => {
    store().reset();
    const localStorageMock = { setItem: vi.fn() };
    vi.stubGlobal('localStorage', localStorageMock);
    store().hydrate({
      playerId: 'p9',
      pseudo: 'Zoé',
      resumeToken: 'tok',
      sessionId: 's1',
      slugShort: 'ABC123',
      joinedQuestionPosition: 2,
      stateSnapshot: {
        sessionState: 'running',
        round: ROUND,
        gameView: questionView({ me: { answerId: null, locked: true, result: null } }),
        gameSeq: 2,
      },
    });
    vi.unstubAllGlobals();

    const s = store();
    expect(s.uiState).toBe('game');
    expect(s.joinedLate).toBe(true);
    expect((s.gameView as QuizMobileView).me.locked).toBe(true);
    expect(s.gameSeq).toBe(2);
  });
});

describe('usePlayerStore — plusieurs manches (B5)', () => {
  const BOARD = {
    roundId: '7',
    position: 1,
    totalRounds: 2,
    scoreboard: [
      { playerId: 'p1', pseudo: 'Alice', avatarUrl: null, scoreTotal: 400, scoreThisRound: 400 },
    ],
  };

  beforeEach(() => {
    store().reset();
    store().applySnapshot(snapshot('lobby'));
  });

  it('round end screen during the interlude, then the next round takes over', () => {
    store().applyEvent('round:started', { ...ROUND, totalRounds: 2 });
    store().applyEvent('game:state', gameState(1, questionView()));
    store().applyEvent('round:ended', BOARD);
    expect(store().uiState).toBe('round_end');
    expect(store().roundScoreboard?.scoreboard[0]?.scoreThisRound).toBe(400);
    expect(store().scoreTotal).toBe(400);

    const next = { ...ROUND, roundId: '8', position: 2, totalRounds: 2 };
    store().applyEvent('round:started', next);
    store().applyEvent('game:state', { ...gameState(1, questionView()), roundId: '8' });
    expect(store().uiState).toBe('game');
    expect(store().round?.roundId).toBe('8');
  });

  it('a snapshot during the interlude (reload) shows the round end screen', () => {
    store().reset();
    store().applySnapshot(snapshot('running', { roundEnded: BOARD }));
    expect(store().uiState).toBe('round_end');
    expect(store().roundScoreboard).toEqual(BOARD);
  });
});

describe('usePlayerStore — moteur sondage (B6)', () => {
  const POLL_ROUND: RoundInfo = {
    ...ROUND,
    roundId: '9',
    engineKey: 'poll',
    game: { slug: 'sondage', title: 'Sondage', kind: 'internal', sponsor: null },
  };
  const pollQuestion = {
    phase: 'question',
    questionIndex: 0,
    totalQuestions: 1,
    question: {
      id: 'q1',
      text: 'Film ?',
      options: [
        { id: 'a', text: 'Alien' },
        { id: 'b', text: 'Brazil' },
      ],
      durationMs: 20000,
    },
    endsAt: new Date(Date.now() + 20_000).toISOString(),
    pausedRemainingMs: null,
    totalVotes: 0,
    totalPlayers: 2,
    myVote: null,
  };
  const pollState = (seq: number, view: unknown) => ({
    roundId: POLL_ROUND.roundId,
    engineKey: 'poll',
    seq,
    serverNow: new Date().toISOString(),
    view,
  });

  beforeEach(() => {
    store().reset();
    reportGameIssue.mockClear();
    store().applySnapshot(snapshot('lobby'));
  });

  it('applies poll views validated by the poll schema (vote, results)', () => {
    store().applyEvent('round:started', POLL_ROUND);
    store().applyEvent('game:state', pollState(1, pollQuestion));
    expect(store().uiState).toBe('game');
    expect(store().gameView).toMatchObject({ phase: 'question', myVote: null });

    store().applyEvent('game:state', pollState(2, { ...pollQuestion, myVote: 'b', totalVotes: 1 }));
    expect(store().gameView).toMatchObject({ myVote: 'b' });

    store().applyEvent(
      'game:state',
      pollState(3, {
        ...pollQuestion,
        phase: 'results',
        myVote: 'b',
        totalVotes: 1,
        counts: [
          { optionId: 'a', votes: 0 },
          { optionId: 'b', votes: 1 },
        ],
      }),
    );
    expect(store().gameView).toMatchObject({
      phase: 'results',
      counts: [{ votes: 0 }, { votes: 1 }],
    });
    expect(store().gameViewInvalid).toBe(false);
  });

  it('a results view without counts is invalid: fallback', () => {
    store().applyEvent('round:started', POLL_ROUND);
    store().applyEvent('game:state', pollState(1, { ...pollQuestion, phase: 'results' }));
    expect(store().gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerStore — moteur burger', () => {
  const BURGER_ROUND: RoundInfo = {
    ...ROUND,
    roundId: '11',
    engineKey: 'burger',
    game: { slug: 'burger', title: 'Burger', kind: 'internal', sponsor: null },
  };
  const build = {
    phase: 'build',
    endsAt: new Date(Date.now() + 30_000).toISOString(),
    pausedRemainingMs: null,
    durationMs: 60000,
    countdownMs: 4000,
    totalLayers: 8,
    totalPlayers: 2,
    finishedCount: 0,
    me: {
      order: [
        'pickles',
        'bun_top',
        'tomato',
        'sauce',
        'onion',
        'lettuce',
        'bun_bottom',
        'patty_cheese',
      ],
      correctCount: 0,
      finishMs: null,
      rank: null,
      points: null,
    },
  };
  const burgerState = (seq: number, view: unknown) => ({
    roundId: BURGER_ROUND.roundId,
    engineKey: 'burger',
    seq,
    serverNow: new Date().toISOString(),
    view,
  });

  beforeEach(() => {
    store().reset();
    reportGameIssue.mockClear();
    store().applySnapshot(snapshot('lobby'));
  });

  it('applies burger views validated by the burger schema; an unknown layer is invalid', () => {
    store().applyEvent('round:started', BURGER_ROUND);
    store().applyEvent('game:state', burgerState(1, build));
    expect(store().uiState).toBe('game');
    expect(store().gameView).toMatchObject({ phase: 'build', me: { correctCount: 0 } });
    expect(store().gameViewInvalid).toBe(false);

    store().applyEvent(
      'game:state',
      burgerState(2, { ...build, me: { ...build.me, order: ['bacon'] } }),
    );
    expect(store().gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerStore — moteur tour de livres', () => {
  const TOWER_ROUND: RoundInfo = {
    ...ROUND,
    roundId: '14',
    engineKey: 'tower',
    game: { slug: 'tour', title: 'Tour de livres', kind: 'internal', sponsor: null },
  };
  const build = {
    phase: 'build',
    endsAt: new Date(Date.now() + 30_000).toISOString(),
    pausedRemainingMs: null,
    durationMs: 60000,
    countdownMs: 5000,
    seed: 42,
    totalPlayers: 2,
    topHeight: 9.5,
    me: {
      books: [
        { k: 'roman', x: 0 },
        { k: 'poche', x: 2.5 },
      ],
      drops: 2,
      heightCm: 7.5,
      bestHeightCm: 7.5,
      collapses: 0,
      rank: null,
      points: null,
    },
  };
  const towerState = (seq: number, view: unknown) => ({
    roundId: TOWER_ROUND.roundId,
    engineKey: 'tower',
    seq,
    serverNow: new Date().toISOString(),
    view,
  });

  beforeEach(() => {
    store().reset();
    reportGameIssue.mockClear();
    store().applySnapshot(snapshot('lobby'));
  });

  it('applies tower views validated by the tower schema; an unknown book kind is invalid', () => {
    store().applyEvent('round:started', TOWER_ROUND);
    store().applyEvent('game:state', towerState(1, build));
    expect(store().uiState).toBe('game');
    expect(store().gameView).toMatchObject({ phase: 'build', me: { drops: 2 } });
    expect(store().gameViewInvalid).toBe(false);

    store().applyEvent(
      'game:state',
      towerState(2, { ...build, me: { ...build.me, books: [{ k: 'kindle', x: 0 }] } }),
    );
    expect(store().gameViewInvalid).toBe(true);
    expect(reportGameIssue).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerStore — sponsor (C4)', () => {
  const SPONSOR = { name: 'Popcorn & Co', logoUrl: null, brandColorPrimary: null };

  beforeEach(() => {
    store().reset();
  });

  it('reads sessionSponsor from the snapshot and keeps it on the final screen', () => {
    store().applySnapshot(snapshot('lobby', { sessionSponsor: SPONSOR }));
    expect(store().sessionSponsor).toEqual(SPONSOR);
    store().applySnapshot(
      snapshot('ended', {
        sessionSponsor: SPONSOR,
        finalResults: { rank: 1, finalScoreboard: [] },
      }),
    );
    expect(store().uiState).toBe('final_results');
    expect(store().sessionSponsor).toEqual(SPONSOR);
  });

  it('hydrates from by-code, and an explicit null snapshot clears it', () => {
    store().hydrate({
      playerId: 'p1',
      pseudo: 'Alice',
      resumeToken: 't',
      sessionId: 's1',
      slugShort: 'ABC123',
      sessionSponsor: SPONSOR,
    });
    expect(store().sessionSponsor).toEqual(SPONSOR);
    store().applySnapshot(snapshot('lobby'));
    expect(store().sessionSponsor).toEqual(SPONSOR);
    store().applySnapshot(snapshot('lobby', { sessionSponsor: null }));
    expect(store().sessionSponsor).toBeNull();
  });
});
