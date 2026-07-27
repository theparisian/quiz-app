'use client';

import { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { usePlayerStore, type PlayerUiState } from '@/lib/stores/player-store';
import {
  DEV_PLAY_SCREENS,
  parseDevPlayScreen,
  seedDevPlayScreen,
} from '@/lib/dev-play-fixtures';
import LateWaitScreen from '@/components/late-wait-screen';
import LobbyWaiting from '@/components/lobby-waiting';
import QuestionScreen from '@/components/question-screen';
import WaitingOthers from '@/components/waiting-others';
import ResultScreen from '@/components/result-screen';
import PausedScreen from '@/components/paused-screen';
import FinalScreen from '@/components/final-screen';
import AbortedScreen from '@/components/aborted-screen';
import { ScreenTransition } from '@/components/screen-transition';

const IS_DEV = process.env.NODE_ENV === 'development';

const DEV_SOCKET = { emit: () => undefined } as unknown as Socket;

function renderScreen(state: PlayerUiState, lateWaitTimerMs: number | null) {
  switch (state) {
    case 'lobby':
      return <LobbyWaiting />;
    case 'late_wait':
      return <LateWaitScreen timerRemainingMs={lateWaitTimerMs} />;
    case 'question_active':
      return <QuestionScreen socket={DEV_SOCKET} />;
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

function DevPlayContent() {
  const router = useRouter();
  const params = useSearchParams();
  const screen = useMemo(() => parseDevPlayScreen(params.get('screen')), [params]);
  const uiState = usePlayerStore((s) => s.uiState);
  const lateWaitTimerMs = usePlayerStore((s) => s.lateWaitTimerMs);

  useEffect(() => {
    if (!IS_DEV) return;
    seedDevPlayScreen(screen);
  }, [screen]);

  useEffect(() => {
    if (!IS_DEV) return;
    if (params.get('screen') === screen) return;
    router.replace(`/dev/play?screen=${screen}`);
  }, [params, router, screen]);

  if (!IS_DEV) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-gray-400">
        Mode démo indisponible en production.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <div className="bg-brand-500/10 border-brand-500/30 shrink-0 border-b px-4 py-2 text-center text-xs text-brand-300">
        Mode démo — aucune connexion serveur
      </div>

      <ScreenTransition screenKey={uiState}>{renderScreen(uiState, lateWaitTimerMs)}</ScreenTransition>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-gray-950/95 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto px-2 py-2">
          {DEV_PLAY_SCREENS.map(({ id, label }) => {
            const active = screen === id;
            return (
              <Link
                key={id}
                href={`/dev/play?screen=${id}`}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function DevPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-gray-500">
          Chargement...
        </div>
      }
    >
      <DevPlayContent />
    </Suspense>
  );
}
