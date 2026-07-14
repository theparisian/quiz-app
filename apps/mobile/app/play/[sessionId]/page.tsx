'use client';

import { useParams } from 'next/navigation';
import { usePlayerStore } from '@/lib/stores/player-store';
import { usePlayerSession } from '@/hooks/use-player-session';
import LateWaitScreen from '@/components/late-wait-screen';
import LobbyWaiting from '@/components/lobby-waiting';
import QuestionScreen from '@/components/question-screen';
import WaitingOthers from '@/components/waiting-others';
import ResultScreen from '@/components/result-screen';
import PausedScreen from '@/components/paused-screen';
import FinalScreen from '@/components/final-screen';
import AbortedScreen from '@/components/aborted-screen';
import { ConnectionBanner } from '@/components/connection-banner';
import { ScreenTransition } from '@/components/screen-transition';
import type { PlayerUiState } from '@/lib/stores/player-store';

export default function PlayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { socket } = usePlayerSession(sessionId);
  const uiState = usePlayerStore((s) => s.uiState);
  const lateWaitTimerMs = usePlayerStore((s) => s.lateWaitTimerMs);

  function renderScreen(state: PlayerUiState) {
    switch (state) {
      case 'lobby':
        return <LobbyWaiting />;
      case 'late_wait':
        return <LateWaitScreen timerRemainingMs={lateWaitTimerMs} />;
      case 'question_active':
        return <QuestionScreen socket={socket} />;
      case 'waiting_others':
        return <WaitingOthers />;
      case 'question_results':
        return <ResultScreen />;
      case 'paused':
        return <PausedScreen />;
      case 'final_results':
        return <FinalScreen />;
      case 'aborted':
        return <AbortedScreen />;
      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ConnectionBanner />
      <ScreenTransition screenKey={uiState}>{renderScreen(uiState)}</ScreenTransition>
    </div>
  );
}
