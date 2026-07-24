'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLiveSession } from '@/hooks/use-live-session';
import { useLiveSessionStore, type SessionFullResponse } from '@/lib/stores/live-session-store';
import { LobbyView } from './lobby-view';
import { LiveHeader } from './live-header';
import { QuestionPreview } from './question-preview';
import { TimerBar } from './timer-bar';
import { PlayersList } from './players-list';
import { ControlsPanel } from './controls-panel';
import { EndedView } from './ended-view';
import { AbortedView } from './aborted-view';
import { ConfirmAbortModal } from '../confirm-abort-modal';
import { LiveConnectionBanner } from './connection-banner';
import { SessionPrizesReminder } from './session-prizes-reminder';

interface LiveConsoleProps {
  sessionId: string;
  screenId: string | null;
  onExit: () => void;
  exitLabel?: string;
}

const STATE_LABEL: Record<string, string> = {
  lobby: 'LOBBY',
  running: 'LIVE',
  paused: 'PAUSE',
  ended: 'TERMINÉE',
  aborted: 'ABANDONNÉE',
};

const STATE_COLOR: Record<string, string> = {
  lobby: 'bg-yellow-100 text-yellow-800',
  running: 'bg-green-100 text-green-800',
  paused: 'bg-orange-100 text-orange-800',
  ended: 'bg-gray-100 text-gray-800',
  aborted: 'bg-red-100 text-red-800',
};

export function LiveConsole({
  sessionId,
  screenId,
  onExit,
  exitLabel = 'Terminer',
}: LiveConsoleProps) {
  const queryClient = useQueryClient();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [abortModalOpen, setAbortModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const state = useLiveSessionStore((s) => s.state);
  const slugShort = useLiveSessionStore((s) => s.slugShort);
  const quiz = useLiveSessionStore((s) => s.quiz);
  const hydrateFromSession = useLiveSessionStore((s) => s.hydrateFromSession);
  const reset = useLiveSessionStore((s) => s.reset);

  const { socketError } = useLiveSession(sessionId);

  useEffect(() => {
    if (!sessionId) return;
    api
      .get<SessionFullResponse>(`/api/sessions/${sessionId}/full`)
      .then((data) => hydrateFromSession(data))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Erreur de chargement'));

    return () => reset();
  }, [sessionId, hydrateFromSession, reset]);

  useEffect(() => {
    if (state === 'ended' || state === 'aborted') {
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      if (screenId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', 'screen', screenId] });
      }
    }
  }, [state, screenId, queryClient]);

  const doAction = async (path: string, body?: unknown) => {
    setActionLoading(true);
    try {
      await api.post(path, body);
    } catch {
      // errors handled via socket events
    } finally {
      setActionLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <p className="text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={onExit}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          {exitLabel ?? 'Fermer'}
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-xl border bg-white">
        <p className="text-gray-400">Chargement de la session...</p>
      </div>
    );
  }

  const stateLabel = STATE_LABEL[state] ?? state.toUpperCase();
  const stateColor = STATE_COLOR[state] ?? 'bg-gray-100 text-gray-800';

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-bold text-gray-900">{quiz?.title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {slugShort && <span className="font-mono text-sm text-gray-500">{slugShort}</span>}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateColor}`}>
            {stateLabel}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <LiveConnectionBanner />
      </div>

      <div className="mt-1">
        <SessionPrizesReminder />
      </div>

      {socketError && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{socketError}</div>
      )}

      <div className="mt-4">
        {state === 'lobby' && (
          <LobbyView
            onStart={() => doAction(`/api/sessions/${sessionId}/start`)}
            onAbort={() => setAbortModalOpen(true)}
            starting={actionLoading}
          />
        )}

        {state === 'running' && (
          <div className="space-y-4">
            <LiveHeader onToggleMute={() => doAction(`/api/sessions/${sessionId}/toggle-mute`)} />
            <QuestionPreview />
            <TimerBar />
            <PlayersList />
            <ControlsPanel
              onPause={() => doAction(`/api/sessions/${sessionId}/pause`)}
              onResume={() => doAction(`/api/sessions/${sessionId}/resume`)}
              onForceEnd={() => doAction(`/api/sessions/${sessionId}/force-end-question`)}
              onAbort={() => setAbortModalOpen(true)}
            />
          </div>
        )}

        {state === 'paused' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-4xl text-gray-400">⏸</p>
              <h3 className="text-xl font-bold text-gray-900">Session en pause</h3>
              <p className="text-center text-sm text-gray-500">
                Le timer est arrêté. Les joueurs voient un écran &quot;En pause&quot;.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => doAction(`/api/sessions/${sessionId}/resume`)}
                  disabled={actionLoading}
                  className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  ▶ Reprendre la session
                </button>
                <button
                  type="button"
                  onClick={() => setAbortModalOpen(true)}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  ✕ Abandonner
                </button>
              </div>
            </div>
            <PlayersList />
          </div>
        )}

        {state === 'ended' && (
          <EndedView sessionId={sessionId} onExit={onExit} exitLabel={exitLabel} />
        )}

        {state === 'aborted' && <AbortedView onExit={onExit} exitLabel={exitLabel} />}
      </div>

      <ConfirmAbortModal
        open={abortModalOpen}
        onClose={() => setAbortModalOpen(false)}
        onConfirm={(reason) => {
          setAbortModalOpen(false);
          doAction(`/api/sessions/${sessionId}/abort`, { reason });
        }}
        loading={actionLoading}
      />
    </div>
  );
}
