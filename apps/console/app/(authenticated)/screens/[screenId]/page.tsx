'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProjectorScreen, Play, Plus } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';
import { useScreens } from '@/hooks/use-screens';
import { useSessionsByScreen } from '@/hooks/use-sessions';
import { activeSessionByScreen, useActiveSessions } from '@/hooks/use-active-sessions';
import { SessionRow } from '@/components/session-row';

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ProjectorScreen className="text-gray-500" size={28} weight="duotone" />
            <h1 className="text-2xl font-bold text-gray-900">{screen?.name ?? 'Salle'}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {screen?.capacity != null && <span>Capacité : {screen.capacity}</span>}
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${isNucOnline ? 'bg-green-500' : 'bg-red-400'}`}
              />
              {isNucOnline ? 'NUC connecté' : 'NUC hors ligne'}
              {nuc?.lastSeenAt && !isNucOnline && (
                <span className="text-xs text-gray-400">(vu {formatRelative(nuc.lastSeenAt)})</span>
              )}
            </span>
          </div>
        </div>

        {!liveSession && (
          <Link
            href={`/sessions/new?screenId=${screenId}`}
            className="flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <Plus size={16} weight="bold" />
            Nouvelle session
          </Link>
        )}
      </div>

      {liveSession && (
        <div className="mt-5 overflow-hidden rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="animate-live-pulse mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Session active — {liveSession.quizTitle}
                </p>
                <p className="mt-0.5 text-xs text-green-600">
                  {liveSession.state === 'running'
                    ? 'Quiz en cours'
                    : liveSession.state === 'lobby'
                      ? 'En attente de joueurs'
                      : 'En pause'}{' '}
                  · {liveSession.totalPlayers} joueur
                  {liveSession.totalPlayers > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Link
              href={`/sessions/${liveSession.id}/live`}
              className="flex shrink-0 items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
            >
              <Play size={16} weight="fill" />
              Ouvrir la console
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800">Historique des sessions</h2>

        {isLoading ? (
          <p className="mt-4 text-gray-400">Chargement...</p>
        ) : data && data.items.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_1fr_80px_110px] gap-2 border-b bg-gray-50 px-4 py-2 text-xs font-medium uppercase text-gray-500">
              <span>Date</span>
              <span>Quiz</span>
              <span className="text-center">Joueurs</span>
              <span className="text-center">État</span>
            </div>
            {data.items.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed bg-white px-6 py-10 text-center">
            <p className="text-sm text-gray-400">Aucune session pour cette salle.</p>
            {!liveSession && (
              <Link
                href={`/sessions/new?screenId=${screenId}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus size={14} weight="bold" />
                Lancer la première session
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
