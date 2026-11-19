'use client';

import { useEffect, useRef, useState } from 'react';
import { useNucInit } from '@/hooks/use-nuc-init';
import { useAudioDirector } from '@/hooks/use-audio-director';
import { selectScreenDisplay, useNucStore } from '@/lib/stores/nuc-store';
import GameStage from '@/games/game-stage';
import IdleState from '@/components/states/idle-state';
import LobbyState from '@/components/states/lobby-state';
import RoundEndState from '@/components/states/round-end-state';
import FinalResultsState from '@/components/states/final-results-state';
import AbortedState from '@/components/states/aborted-state';
import PausedOverlay from '@/components/states/paused-overlay';
import { NucConnectionBanner } from '@/components/shared/nuc-connection-banner';
import LobbyBackground from '@/components/shared/lobby-background';
import LateJoinQrBadge from '@/components/shared/late-join-qr-badge';
import { displayedRoundSponsor } from '@quiz-app/validation';
import SponsorBadge from '@/components/sponsor/sponsor-badge';
import RoundOpeningCard from '@/components/sponsor/round-opening-card';

const IDLE_FADE_MS = 500;

export default function ScreenPage() {
  useNucInit();
  useAudioDirector();
  // Ce que l'écran affiche (le lobby reste à l'écran pendant une vue qui le demande, ex. le
  // compte à rebours d'avant la première question du quiz).
  const uiState = useNucStore(selectScreenDisplay);
  const isPaused = useNucStore((s) => s.isPaused);
  const slugShort = useNucStore((s) => s.slugShort);
  const joinToken = useNucStore((s) => s.joinToken);
  const lateJoinQrEnabled = useNucStore((s) => s.lateJoinQrEnabled);
  const round = useNucStore((s) => s.round);
  const prevUiStateRef = useRef(uiState);
  const [idleFadingOut, setIdleFadingOut] = useState(false);

  useEffect(() => {
    const prev = prevUiStateRef.current;
    if (prev === 'idle' && uiState === 'lobby') {
      setIdleFadingOut(true);
      const timer = setTimeout(() => setIdleFadingOut(false), IDLE_FADE_MS);
      prevUiStateRef.current = uiState;
      return () => clearTimeout(timer);
    }
    prevUiStateRef.current = uiState;
  }, [uiState]);

  const showIdle = uiState === 'idle' || idleFadingOut;

  const showLateJoinQr = lateJoinQrEnabled && slugShort != null && (uiState === 'game' || isPaused);
  // C4 : sponsor de la manche en cours, dans le coin bas droit (jamais hors manche sponsorisée).
  const roundSponsor = uiState === 'game' ? displayedRoundSponsor(round) : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950 text-white">
      <NucConnectionBanner />
      {uiState === 'lobby' && <LobbyBackground />}
      {showIdle && (
        <IdleState
          className={
            idleFadingOut
              ? 'animate-content-fade-out pointer-events-none absolute inset-0 z-30 bg-gray-950'
              : 'relative z-10'
          }
        />
      )}
      {uiState === 'lobby' && <LobbyState />}
      {uiState === 'game' && <GameStage />}
      {uiState === 'round_end' && <RoundEndState />}
      {uiState === 'final_results' && <FinalResultsState />}
      {uiState === 'aborted' && <AbortedState />}
      {roundSponsor && (
        <SponsorBadge
          sponsor={roundSponsor}
          size="sm"
          className={`pointer-events-none fixed bottom-8 z-30 ${showLateJoinQr ? 'right-56' : 'right-8'}`}
        />
      )}
      <RoundOpeningCard />
      {isPaused && <PausedOverlay />}
      {showLateJoinQr && <LateJoinQrBadge slugShort={slugShort} joinToken={joinToken} />}
    </div>
  );
}
