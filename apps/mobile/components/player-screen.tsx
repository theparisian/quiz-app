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
import SponsorBadge from '@/components/sponsor-badge';
import { displayedRoundSponsor } from '@quiz-app/validation';

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
  const round = usePlayerStore((s) => s.round);
  const sessionSponsor = usePlayerStore((s) => s.sessionSponsor);

  if (uiState === 'game') {
    // C4 : bandeau fin du sponsor, seulement pendant une manche sponsorisée.
    const roundSponsor = displayedRoundSponsor(round);
    return (
      <>
        <GameStage socket={socket} />
        {roundSponsor && <SponsorBadge sponsor={roundSponsor} variant="banner" />}
      </>
    );
  }

  let screen;
  switch (uiState) {
    case 'lobby':
      screen = (
        <>
          <LobbyWaiting />
          {sessionSponsor && <SponsorBadge sponsor={sessionSponsor} />}
        </>
      );
      break;
    case 'paused':
      screen = <PausedScreen />;
      break;
    case 'round_end':
      screen = <RoundEndScreen />;
      break;
    case 'final_results':
      screen = (
        <>
          <FinalScreen />
          {sessionSponsor && <SponsorBadge sponsor={sessionSponsor} />}
        </>
      );
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
