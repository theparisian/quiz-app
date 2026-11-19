'use client';

import type { Socket } from 'socket.io-client';
import { usePlayerStore } from '@/lib/stores/player-store';
import GameStage from '@/games/game-stage';
import LobbyWaiting from '@/components/lobby-waiting';
import PausedScreen from '@/components/paused-screen';
import RoundEndScreen from '@/components/round-end-screen';
import FinalScreen from '@/components/final-screen';
import AbortedScreen from '@/components/aborted-screen';
import KickedScreen from '@/components/kicked-screen';
import { ScreenTransition } from '@/components/screen-transition';

interface PlayerScreenProps {
  socket: Socket | null;
}

/**
 * Écran courant du joueur. Les écrans de plateforme (lobby, pause, fin de manche, final,
 * abandon, exclusion) sont ici ; la manche en cours est rendue par `<GameStage />`, qui gère
 * ses propres transitions.
 */
export default function PlayerScreen({ socket }: PlayerScreenProps) {
  const uiState = usePlayerStore((s) => s.uiState);

  if (uiState === 'game') {
    return <GameStage socket={socket} />;
  }

  let screen;
  switch (uiState) {
    case 'lobby':
      screen = <LobbyWaiting />;
      break;
    case 'paused':
      screen = <PausedScreen />;
      break;
    case 'round_end':
      screen = <RoundEndScreen />;
      break;
    case 'final_results':
      screen = <FinalScreen />;
      break;
    case 'aborted':
      screen = <AbortedScreen />;
      break;
    case 'kicked':
      screen = <KickedScreen />;
      break;
    default:
      screen = null;
  }
  return <ScreenTransition screenKey={uiState}>{screen}</ScreenTransition>;
}
