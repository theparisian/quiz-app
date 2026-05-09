'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLiveSession } from '@/hooks/use-live-session';
import { useLiveSessionStore, type SessionFullResponse } from '@/lib/stores/live-session-store';
import { LobbyView } from '@/components/live-console/lobby-view';
import { LiveHeader } from '@/components/live-console/live-header';
import { QuestionPreview } from '@/components/live-console/question-preview';
import { TimerBar } from '@/components/live-console/timer-bar';
import { PlayersList } from '@/components/live-console/players-list';
import { ControlsPanel } from '@/components/live-console/controls-panel';
import { EndedView } from '@/components/live-console/ended-view';
import { AbortedView } from '@/components/live-console/aborted-view';
import { ConfirmAbortModal } from '@/components/confirm-abort-modal';
import { LiveConnectionBanner } from '@/components/live-console/connection-banner';

export default function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [abortModalOpen, setAbortModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const state = useLiveSessionStore((s) => s.state);
  const screenId = useLiveSessionStore((s) => s.screenId);
  const screenName = useLiveSessionStore((s) => s.screenName);
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
      <div className="py-16 text-center">
        <p className="text-red-600">{loadError}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Retour au dashboard
        </Link>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-gray-400">Chargement de la session...</p>
      </div>
    );
  }

  const stateLabel =
    {
      lobby: 'LOBBY',
      running: 'LIVE',
      paused: 'PAUSE',
      ended: 'TERMINÉE',
      aborted: 'ABANDONNÉE',
    }[state] ?? state.toUpperCase();

  const stateColor =
    {
      lobby: 'bg-yellow-100 text-yellow-800',
      running: 'bg-green-100 text-green-800',
      paused: 'bg-orange-100 text-orange-800',
      ended: 'bg-gray-100 text-gray-800',
      aborted: 'bg-red-100 text-red-800',
    }[state] ?? 'bg-gray-100 text-gray-800';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={screenId ? `/screens/${screenId}` : '/dashboard'}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← {screenName ?? 'Retour'}
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            {screenName} — {quiz?.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {slugShort && <span className="font-mono text-sm text-gray-500">Code : {slugShort}</span>}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateColor}`}>
            {stateLabel}
          </span>
        </div>
      </div>

      <LiveConnectionBanner />

      {socketError && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {socketError}
        </div>
      )}

      <div className="mt-6">
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
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-4xl text-gray-400">⏸</p>
              <h2 className="text-xl font-bold text-gray-900">Session en pause</h2>
              <p className="text-sm text-gray-500">
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

        {state === 'ended' && <EndedView sessionId={sessionId} screenId={screenId} />}

        {state === 'aborted' && <AbortedView screenId={screenId} />}
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
