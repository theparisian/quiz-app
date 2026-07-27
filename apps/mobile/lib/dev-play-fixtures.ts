import type { PlayerUiState } from '@/lib/stores/player-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import type { SessionPrizesDisplay } from '@quiz-app/validation';

const DEV_PLAYER = {
  playerId: 'dev-player-1',
  pseudo: 'CinéFan42',
  avatarUrl: null as string | null,
  sessionId: 'dev-session',
  slugShort: '0000',
};

const DEMO_ANSWERS = [
  { id: 'a1', position: 'A', text: 'Le Parrain' },
  { id: 'a2', position: 'B', text: 'Pulp Fiction' },
  { id: 'a3', position: 'C', text: 'Forrest Gump' },
  { id: 'a4', position: 'D', text: 'La Liste de Schindler' },
];

const DEMO_PRIZES: SessionPrizesDisplay = {
  rank1: { label: 'Mega Popcorn', isSuperPrize: true },
  rank2: { label: 'Place VIP' },
  rank3: { label: 'Soda XL' },
  all: { label: 'Bon réduction confiserie' },
};

export const DEV_PLAY_SCREENS: { id: PlayerUiState; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'late_wait', label: 'Late' },
  { id: 'question_active', label: 'Question' },
  { id: 'waiting_others', label: 'Attente' },
  { id: 'question_results', label: 'Résultat' },
  { id: 'paused', label: 'Pause' },
  { id: 'final_results', label: 'Final' },
  { id: 'aborted', label: 'Abort' },
];

const DEFAULT_SCREEN: PlayerUiState = 'lobby';

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
      totalQuestions: 5,
      totalPlayers: 38,
    },
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

export function parseDevPlayScreen(raw: string | null): PlayerUiState {
  const match = DEV_PLAY_SCREENS.find((s) => s.id === raw);
  return match?.id ?? DEFAULT_SCREEN;
}

export function seedDevPlayScreen(screen: PlayerUiState): void {
  const store = usePlayerStore.getState();
  store.reset();
  seedBaseMetadata();

  switch (screen) {
    case 'lobby':
      store.applySnapshot({ ...baseSnapshot('lobby'), prizes: DEMO_PRIZES });
      break;

    case 'late_wait':
      store.applySnapshot({
        ...baseSnapshot('running'),
        lateJoinWait: { timerRemainingMs: 12000 },
      });
      break;

    case 'question_active':
      store.applySnapshot({
        ...baseSnapshot('running'),
        currentQuestion: {
          position: 3,
          questionId: 'q-dev-3',
          text: 'Quel réalisateur a dirigé « Inception » ?',
          imageUrl: null,
          timeLimitMs: 20000,
          remainingMs: 18000,
          alreadyAnsweredPosition: null,
          answers: DEMO_ANSWERS,
        },
      });
      break;

    case 'waiting_others':
      store.applySnapshot({
        ...baseSnapshot('running'),
        currentQuestion: {
          position: 3,
          questionId: 'q-dev-3',
          text: 'Quel réalisateur a dirigé « Inception » ?',
          imageUrl: null,
          timeLimitMs: 20000,
          remainingMs: 8000,
          alreadyAnsweredPosition: 'B',
          answers: DEMO_ANSWERS,
        },
      });
      break;

    case 'question_results':
      store.applySnapshot({
        ...baseSnapshot('running'),
        showingResults: {
          correctAnswerId: 'a2',
          pointsAwarded: 850,
          isCorrect: true,
          nextQuestionInMs: 5000,
        },
      });
      usePlayerStore.setState({
        selectedAnswerId: 'a2',
        selectedAnswerPosition: 'B',
        currentQuestionPosition: 3,
      });
      break;

    case 'paused':
      store.applySnapshot({
        ...baseSnapshot('paused'),
        currentQuestion: {
          position: 3,
          questionId: 'q-dev-3',
          text: 'Quel réalisateur a dirigé « Inception » ?',
          imageUrl: null,
          timeLimitMs: 20000,
          remainingMs: 10000,
          alreadyAnsweredPosition: null,
          answers: DEMO_ANSWERS,
        },
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
  }
}
