import { usePlayerStore } from '@/lib/stores/player-store';
import type {
  PollMobileView,
  QuizMobileView,
  RoundInfo,
  SessionPrizesDisplay,
} from '@quiz-app/validation';

const DEV_PLAYER = {
  playerId: 'dev-player-1',
  pseudo: 'CinéFan42',
  avatarUrl: null as string | null,
  sessionId: 'dev-session',
  slugShort: '0000',
};

const DEV_ROUND: RoundInfo = {
  roundId: '1',
  position: 1,
  totalRounds: 1,
  engineKey: 'quiz',
  game: { slug: 'quiz-demo', title: 'Quiz Cinéma — Démo', kind: 'internal', sponsor: null },
};

const DEMO_QUESTION = {
  id: '3',
  position: 3,
  text: 'Quel réalisateur a dirigé « Inception » ?',
  imageUrl: null,
  timeLimitMs: 20000,
  answers: [
    { id: '11', position: 'A', text: 'Le Parrain' },
    { id: '12', position: 'B', text: 'Pulp Fiction' },
    { id: '13', position: 'C', text: 'Forrest Gump' },
    { id: '14', position: 'D', text: 'La Liste de Schindler' },
  ],
};

const DEMO_PRIZES: SessionPrizesDisplay = {
  rank1: { label: 'Mega Popcorn', isSuperPrize: true },
  rank2: { label: 'Place VIP' },
  rank3: { label: 'Soda XL' },
  all: { label: 'Bon réduction confiserie' },
};

export type DevPlayScreen =
  | 'lobby'
  | 'countdown'
  | 'late_wait'
  | 'question_active'
  | 'waiting_others'
  | 'question_results'
  | 'paused'
  | 'round_end'
  | 'final_results'
  | 'aborted'
  | 'kicked'
  | 'unknown_game'
  | 'poll_question'
  | 'poll_voted'
  | 'poll_results';

export const DEV_PLAY_SCREENS: { id: DevPlayScreen; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'countdown', label: 'Départ' },
  { id: 'late_wait', label: 'Late' },
  { id: 'question_active', label: 'Question' },
  { id: 'waiting_others', label: 'Attente' },
  { id: 'question_results', label: 'Résultat' },
  { id: 'paused', label: 'Pause' },
  { id: 'round_end', label: 'Fin manche' },
  { id: 'final_results', label: 'Final' },
  { id: 'aborted', label: 'Abort' },
  { id: 'kicked', label: 'Exclu' },
  { id: 'unknown_game', label: 'Repli' },
  { id: 'poll_question', label: 'Sondage' },
  { id: 'poll_voted', label: 'Sondage voté' },
  { id: 'poll_results', label: 'Sondage résultats' },
];

const DEFAULT_SCREEN: DevPlayScreen = 'lobby';

function baseSnapshot(sessionState: string) {
  return {
    player: {
      playerId: DEV_PLAYER.playerId,
      pseudo: DEV_PLAYER.pseudo,
      scoreTotal: 1250,
      currentRank: 2,
      avatarUrl: DEV_PLAYER.avatarUrl,
    },
    session: {
      sessionId: DEV_PLAYER.sessionId,
      slugShort: DEV_PLAYER.slugShort,
      state: sessionState,
      totalPlayers: 38,
    },
    round: null as RoundInfo | null,
    gameView: null as unknown,
    gameSeq: 0,
  };
}

function inSeconds(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

const COMMON = {
  totalQuestions: 5,
  answeredCount: 12,
  totalPlayers: 38,
  pausedRemainingMs: null,
};

function questionView(me: QuizMobileView['me'], remainingMs: number): QuizMobileView {
  return {
    phase: 'question',
    questionIndex: 2,
    ...COMMON,
    endsAt: inSeconds(remainingMs),
    question: DEMO_QUESTION,
    me,
  };
}

function gameSnapshot(sessionState: string, view: unknown, round: RoundInfo = DEV_ROUND) {
  return { ...baseSnapshot(sessionState), round, gameView: view, gameSeq: 1 };
}

const DEV_POLL_ROUND: RoundInfo = {
  roundId: '2',
  position: 2,
  totalRounds: 2,
  engineKey: 'poll',
  game: { slug: 'sondage-demo', title: 'Sondage — Démo', kind: 'internal', sponsor: null },
};

const POLL_COMMON = {
  questionIndex: 1,
  totalQuestions: 3,
  question: {
    id: 'q2',
    text: 'Quel genre voir la semaine prochaine ?',
    options: [
      { id: 'a', text: 'Science-fiction' },
      { id: 'b', text: 'Comédie' },
      { id: 'c', text: 'Horreur' },
      { id: 'd', text: 'Animation' },
    ],
    durationMs: 20000,
  },
  pausedRemainingMs: null,
  totalVotes: 21,
  totalPlayers: 38,
};

function pollView(phase: 'question' | 'results', myVote: string | null): PollMobileView {
  if (phase === 'question') {
    return { phase, ...POLL_COMMON, endsAt: inSeconds(15000), myVote };
  }
  return {
    phase,
    ...POLL_COMMON,
    endsAt: inSeconds(6000),
    myVote,
    counts: [
      { optionId: 'a', votes: 9 },
      { optionId: 'b', votes: 6 },
      { optionId: 'c', votes: 2 },
      { optionId: 'd', votes: 4 },
    ],
  };
}

function seedBaseMetadata() {
  usePlayerStore.setState({
    playerId: DEV_PLAYER.playerId,
    pseudo: DEV_PLAYER.pseudo,
    sessionId: DEV_PLAYER.sessionId,
    slugShort: DEV_PLAYER.slugShort,
    cinemaName: 'Cinéma Le Majestic',
    quizTitle: 'Quiz Cinéma — Démo',
    connectionStatus: 'connected',
  });
}

export function parseDevPlayScreen(raw: string | null): DevPlayScreen {
  const match = DEV_PLAY_SCREENS.find((s) => s.id === raw);
  return match?.id ?? DEFAULT_SCREEN;
}

export function seedDevPlayScreen(screen: DevPlayScreen): void {
  const store = usePlayerStore.getState();
  store.reset();
  seedBaseMetadata();

  switch (screen) {
    case 'lobby':
      store.applySnapshot({ ...baseSnapshot('lobby'), prizes: DEMO_PRIZES });
      break;

    case 'countdown':
      store.applySnapshot(
        gameSnapshot('running', {
          phase: 'countdown',
          questionIndex: -1,
          ...COMMON,
          answeredCount: 0,
          endsAt: inSeconds(8000),
          question: null,
          me: { answerId: null, locked: false, result: null },
        } satisfies QuizMobileView),
      );
      break;

    case 'late_wait':
      store.applySnapshot(
        gameSnapshot(
          'running',
          questionView({ answerId: null, locked: true, result: null }, 12000),
        ),
      );
      break;

    case 'question_active':
      store.applySnapshot(
        gameSnapshot(
          'running',
          questionView({ answerId: null, locked: false, result: null }, 18000),
        ),
      );
      break;

    case 'waiting_others':
      store.applySnapshot(
        gameSnapshot(
          'running',
          questionView({ answerId: '12', locked: false, result: null }, 8000),
        ),
      );
      break;

    case 'question_results':
      store.applySnapshot(
        gameSnapshot('running', {
          phase: 'reveal',
          questionIndex: 2,
          ...COMMON,
          endsAt: inSeconds(5000),
          question: DEMO_QUESTION,
          correctAnswerId: '12',
          explanation: null,
          revealedAt: new Date().toISOString(),
          me: {
            answerId: '12',
            locked: false,
            result: { isCorrect: true, points: 850, rank: 2, scoreTotal: 1250 },
          },
        } satisfies QuizMobileView),
      );
      break;

    case 'paused':
      store.applySnapshot(
        gameSnapshot('paused', {
          ...questionView({ answerId: null, locked: false, result: null }, 0),
          endsAt: null,
          pausedRemainingMs: 10000,
        }),
      );
      break;

    case 'round_end':
      store.applySnapshot(baseSnapshot('running'));
      store.applyEvent('round:ended', {
        roundId: '1',
        position: 1,
        totalRounds: 2,
        scoreboard: [
          {
            playerId: 'p2',
            pseudo: 'Bob',
            avatarUrl: null,
            scoreTotal: 3100,
            scoreThisRound: 3100,
          },
          {
            playerId: DEV_PLAYER.playerId,
            pseudo: DEV_PLAYER.pseudo,
            avatarUrl: null,
            scoreTotal: 1250,
            scoreThisRound: 1250,
          },
        ],
      });
      break;

    case 'final_results':
      store.applySnapshot({
        ...baseSnapshot('ended'),
        finalResults: {
          rank: 1,
          finalScoreboard: [
            {
              playerId: DEV_PLAYER.playerId,
              pseudo: DEV_PLAYER.pseudo,
              scoreTotal: 4200,
              rank: 1,
            },
            { playerId: 'p2', pseudo: 'Bob', scoreTotal: 3100, rank: 2 },
            { playerId: 'p3', pseudo: 'Clara', scoreTotal: 2800, rank: 3 },
          ],
        },
        prizeAvailabilityByRank: { rank1: true, rank2: true, rank3: true },
        prizes: DEMO_PRIZES,
      });
      break;

    case 'aborted':
      store.applySnapshot(baseSnapshot('aborted'));
      break;

    case 'kicked':
      store.markKicked();
      break;

    case 'unknown_game':
      store.applySnapshot(gameSnapshot('running', { phase: 'mystery' }));
      break;

    case 'poll_question':
      store.applySnapshot(gameSnapshot('running', pollView('question', null), DEV_POLL_ROUND));
      break;

    case 'poll_voted':
      store.applySnapshot(gameSnapshot('running', pollView('question', 'b'), DEV_POLL_ROUND));
      break;

    case 'poll_results':
      store.applySnapshot(gameSnapshot('running', pollView('results', 'b'), DEV_POLL_ROUND));
      break;
  }
}
