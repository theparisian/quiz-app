'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

interface LiveHeaderProps {
  onToggleMute: () => void;
}

export function LiveHeader({ onToggleMute }: LiveHeaderProps) {
  const currentQuestionPosition = useLiveSessionStore((s) => s.currentQuestionPosition);
  const totalQuestions = useLiveSessionStore((s) => s.totalQuestions);
  const audioMuted = useLiveSessionStore((s) => s.audioMuted);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border bg-white p-3">
        <p className="text-xs font-medium uppercase text-gray-500">Session</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">
          Question {currentQuestionPosition ?? '–'} / {totalQuestions}
        </p>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <p className="text-xs font-medium uppercase text-gray-500">Joueurs</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">
          {useLiveSessionStore.getState().totalPlayers}
        </p>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <p className="text-xs font-medium uppercase text-gray-500">Audio</p>
        <button
          type="button"
          onClick={onToggleMute}
          className="mt-1 text-sm font-semibold text-gray-900 hover:text-blue-600"
        >
          {audioMuted ? '🔇 Coupé' : '🔊 Activé'}
        </button>
      </div>
    </div>
  );
}
