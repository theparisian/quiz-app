'use client';

import {
  selectRoundLabel,
  selectProgressLabel,
  useLiveSessionStore,
} from '@/lib/stores/live-session-store';

interface LiveHeaderProps {
  onToggleMute: () => void;
}

export function LiveHeader({ onToggleMute }: LiveHeaderProps) {
  const progressLabel = useLiveSessionStore(selectProgressLabel);
  const audioMuted = useLiveSessionStore((s) => s.audioMuted);
  const roundLabel = useLiveSessionStore(selectRoundLabel);

  return (
    <div className="space-y-3">
      {roundLabel && (
        <p className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-900">
          {roundLabel}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs font-medium uppercase text-gray-500">Session</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{progressLabel ?? '–'}</p>
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
    </div>
  );
}
