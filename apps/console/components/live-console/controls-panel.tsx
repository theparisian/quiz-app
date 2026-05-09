'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

interface ControlsPanelProps {
  onPause: () => void;
  onResume: () => void;
  onForceEnd: () => void;
  onAbort: () => void;
}

export function ControlsPanel({ onPause, onResume, onForceEnd, onAbort }: ControlsPanelProps) {
  const state = useLiveSessionStore((s) => s.state);
  const showingResults = useLiveSessionStore((s) => s.showingResults);

  if (state !== 'running' && state !== 'paused') return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
      {state === 'running' && (
        <button
          type="button"
          onClick={onPause}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ⏸ Pause
        </button>
      )}
      {state === 'paused' && (
        <button
          type="button"
          onClick={onResume}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          ▶ Reprendre
        </button>
      )}
      {state === 'running' && (
        <button
          type="button"
          onClick={onForceEnd}
          disabled={showingResults}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ⏭ Forcer la fin
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onAbort}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        ✕ Abandonner
      </button>
    </div>
  );
}
