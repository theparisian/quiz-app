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

export default function PlayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { socket } = usePlayerSession(sessionId);
  const uiState = usePlayerStore((s) => s.uiState);
  const lateWaitTimerMs = usePlayerStore((s) => s.lateWaitTimerMs);

  return (
    <div className="flex min-h-screen flex-col">
      <ConnectionBanner />
      {uiState === 'lobby' && <LobbyWaiting />}
      {uiState === 'late_wait' && <LateWaitScreen timerRemainingMs={lateWaitTimerMs} />}
      {uiState === 'question_active' && <QuestionScreen socket={socket} />}
      {uiState === 'waiting_others' && <WaitingOthers />}
      {uiState === 'question_results' && <ResultScreen />}
      {uiState === 'paused' && <PausedScreen />}
      {uiState === 'final_results' && <FinalScreen />}
      {uiState === 'aborted' && <AbortedScreen />}
    </div>
  );
}
