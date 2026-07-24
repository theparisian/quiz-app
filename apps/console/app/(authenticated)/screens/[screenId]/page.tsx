'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProjectorScreen, ArrowLeft, Users } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';
import { useScreens } from '@/hooks/use-screens';
import { useSessionsByScreen } from '@/hooks/use-sessions';
import { activeSessionByScreen, useActiveSessions } from '@/hooks/use-active-sessions';
import { SessionRow } from '@/components/session-row';
import { ScreenLivePanel } from '@/components/screen-live-panel';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function ScreenDetailPage() {
  const { screenId } = useParams<{ screenId: string }>();
  const { user } = useAuth();
  const cinemaSlug = user?.cinemaSlug ?? null;

  const { data: screens } = useScreens(cinemaSlug);
  const { data: activeSessions } = useActiveSessions(cinemaSlug);
  const { data, isLoading } = useSessionsByScreen(screenId);

  const screen = screens?.find((s) => s.id === screenId);
  const liveSession = activeSessionByScreen(activeSessions).get(screenId);
  const nuc = screen?.nucs[0];
  const isNucOnline = nuc?.status === 'online';

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-800"
      >
        <ArrowLeft size={16} weight="bold" />
        Retour au dashboard
      </Link>

      {/* Mini dashboard de la salle : état & santé */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                liveSession ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
              }`}
            >
              <ProjectorScreen size={24} weight="duotone" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{screen?.name ?? 'Salle'}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                {screen?.capacity != null && <span>Capacité : {screen.capacity}</span>}
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${isNucOnline ? 'bg-green-500' : 'bg-red-400'}`}
                  />
                  {isNucOnline ? 'NUC connecté' : 'NUC hors ligne'}
                  {nuc?.lastSeenAt && !isNucOnline && (
                    <span className="text-xs text-gray-400">
                      (vu {formatRelative(nuc.lastSeenAt)})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 ${
              liveSession ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'
            }`}
          >
            {liveSession ? (
              <>
                <span className="animate-live-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
                <div className="text-sm">
                  <p className="font-semibold">
                    {liveSession.state === 'running'
                      ? 'Session en cours'
                      : liveSession.state === 'lobby'
                        ? 'En attente de joueurs'
                        : 'Session en pause'}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-green-600">
                    <span className="truncate">{liveSession.quizTitle}</span>
                    <span className="flex items-center gap-1">
                      <Users size={12} weight="bold" />
                      {liveSession.totalPlayers}
                    </span>
                  </p>
                </div>
              </>
            ) : (
              <span className="text-sm">Aucune session en cours</span>
            )}
          </div>
        </div>
      </div>

      {/* Split : gauche = console (launcher → live), droite = historique */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <ScreenLivePanel screenId={screenId} liveSessionId={liveSession?.id ?? null} />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800">Historique des sessions</h2>

          {isLoading ? (
            <p className="mt-4 text-gray-400">Chargement...</p>
          ) : data && data.items.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-lg border bg-white shadow-sm">
              <div className="grid grid-cols-[1fr_1fr_70px_100px] gap-2 border-b bg-gray-50 px-4 py-2 text-xs font-medium uppercase text-gray-500">
                <span>Date</span>
                <span>Quiz</span>
                <span className="text-center">Joueurs</span>
                <span className="text-center">État</span>
              </div>
              {data.items.map((s) => (
                <SessionRow key={s.id} session={s} screenId={screenId} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed bg-white px-6 py-10 text-center">
              <p className="text-sm text-gray-400">Aucune session pour cette salle.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
