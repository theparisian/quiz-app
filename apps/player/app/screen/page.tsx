'use client';

import { useNucInit } from '@/hooks/use-nuc-init';
import { useNucStore } from '@/lib/stores/nuc-store';
import IdleState from '@/components/states/idle-state';
import LobbyState from '@/components/states/lobby-state';
import QuestionState from '@/components/states/question-state';
import FinalResultsState from '@/components/states/final-results-state';
import AbortedState from '@/components/states/aborted-state';
import PausedOverlay from '@/components/states/paused-overlay';
import { NucConnectionBanner } from '@/components/shared/nuc-connection-banner';
import LobbyBackground from '@/components/shared/lobby-background';
import LateJoinQrBadge from '@/components/shared/late-join-qr-badge';

export default function ScreenPage() {
  useNucInit();
  const uiState = useNucStore((s) => s.uiState);
  const isPaused = useNucStore((s) => s.isPaused);
  const slugShort = useNucStore((s) => s.slugShort);
  const lateJoinQrEnabled = useNucStore((s) => s.lateJoinQrEnabled);

  const showLateJoinQr =
    lateJoinQrEnabled &&
    slugShort != null &&
    (uiState === 'question' || uiState === 'question_results' || isPaused);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950 text-white">
      <NucConnectionBanner />
      {uiState === 'lobby' && <LobbyBackground />}
      {uiState === 'idle' && <IdleState />}
      {uiState === 'lobby' && <LobbyState />}
      {(uiState === 'question' || uiState === 'question_results') && <QuestionState />}
      {uiState === 'final_results' && <FinalResultsState />}
      {uiState === 'aborted' && <AbortedState />}
      {isPaused && <PausedOverlay />}
      {showLateJoinQr && <LateJoinQrBadge slugShort={slugShort} />}
    </div>
  );
}
