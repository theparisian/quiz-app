'use client';

import Link from 'next/link';
import { ProjectorScreen, Users, ArrowRight } from '@phosphor-icons/react';
import type { ActiveSessionItem } from '@/hooks/use-active-sessions';

interface ScreenCardProps {
  id: string;
  name: string;
  capacity: number | null;
  nucStatus: string | null;
  lastSeenAt: string | null;
  liveSession?: ActiveSessionItem | null;
}

const LIVE_STATE_CONFIG: Record<
  string,
  { label: string; dotClass: string; badgeClass: string; description: string }
> = {
  running: {
    label: 'En cours',
    dotClass: 'bg-green-500 animate-live-pulse',
    badgeClass: 'bg-green-100 text-green-700',
    description: 'Quiz en cours',
  },
  lobby: {
    label: 'Lobby',
    dotClass: 'bg-amber-400 animate-live-pulse',
    badgeClass: 'bg-amber-100 text-amber-700',
    description: 'En attente de joueurs',
  },
  paused: {
    label: 'Pause',
    dotClass: 'bg-orange-500 animate-live-pulse',
    badgeClass: 'bg-orange-100 text-orange-700',
    description: 'Session en pause',
  },
};

export function ScreenCard({
  id,
  name,
  capacity,
  nucStatus,
  lastSeenAt,
  liveSession,
}: ScreenCardProps) {
  const isOnline = nucStatus === 'online';
  const liveConfig = liveSession ? LIVE_STATE_CONFIG[liveSession.state] : null;
  const lastSeenLabel = lastSeenAt ? formatRelative(lastSeenAt) : 'Jamais vu';

  return (
    <Link
      href={`/screens/${id}`}
      className={`group flex flex-col rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        liveSession ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              liveSession ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
            }`}
          >
            <ProjectorScreen size={22} weight="duotone" />
          </span>
          <h3 className="truncate text-lg font-semibold text-gray-900">{name}</h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isOnline ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
          title={isOnline ? 'NUC connecté' : 'NUC hors ligne'}
        >
          <span
            className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {liveSession && liveConfig ? (
        <div className="mt-4 rounded-lg bg-green-50/70 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${liveConfig.dotClass}`} />
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${liveConfig.badgeClass}`}
            >
              {liveConfig.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-green-700">
              <Users size={12} weight="bold" />
              {liveSession.totalPlayers}
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-green-900">
            {liveSession.quizTitle}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5">
          <span className="text-sm text-gray-400">Aucune session en cours</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
        <span>{capacity != null ? `Capacité : ${capacity}` : 'Capacité inconnue'}</span>
        {!isOnline && <span>Vu {lastSeenLabel}</span>}
      </div>

      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition group-hover:gap-2">
        Voir la salle
        <ArrowRight size={14} weight="bold" />
      </span>
    </Link>
  );
}

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
