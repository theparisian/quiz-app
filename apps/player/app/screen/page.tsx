'use client';

import { useEffect, useRef, useState } from 'react';
import { useNucInit } from '@/hooks/use-nuc-init';
import { useAudioDirector } from '@/hooks/use-audio-director';
import { useNucStore } from '@/lib/stores/nuc-store';
import AnsweredFlashes from '@/components/shared/answered-flashes';
import IdleState from '@/components/states/idle-state';
import LobbyState from '@/components/states/lobby-state';
import QuestionState from '@/components/states/question-state';
import FinalResultsState from '@/components/states/final-results-state';
import AbortedState from '@/components/states/aborted-state';
import PausedOverlay from '@/components/states/paused-overlay';
import { NucConnectionBanner } from '@/components/shared/nuc-connection-banner';
import LobbyBackground from '@/components/shared/lobby-background';
import LateJoinQrBadge from '@/components/shared/late-join-qr-badge';

const IDLE_FADE_MS = 500;

export default function ScreenPage() {
  useNucInit();
  useAudioDirector();
  const uiState = useNucStore((s) => s.uiState);
  const isPaused = useNucStore((s) => s.isPaused);
  const slugShort = useNucStore((s) => s.slugShort);
  const joinToken = useNucStore((s) => s.joinToken);
  const lateJoinQrEnabled = useNucStore((s) => s.lateJoinQrEnabled);
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

  const showLateJoinQr =
    lateJoinQrEnabled &&
    slugShort != null &&
    (uiState === 'question' || uiState === 'question_results' || isPaused);

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
      {(uiState === 'question' || uiState === 'question_results') && <QuestionState />}
      {uiState === 'final_results' && <FinalResultsState />}
      {uiState === 'aborted' && <AbortedState />}
      {isPaused && <PausedOverlay />}
      {showLateJoinQr && <LateJoinQrBadge slugShort={slugShort} joinToken={joinToken} />}
      <AnsweredFlashes />
    </div>
  );
}
