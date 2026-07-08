'use client';

import Link from 'next/link';
import { ProjectorScreen } from '@phosphor-icons/react';

interface ScreenCardProps {
  id: string;
  name: string;
  capacity: number | null;
  nucStatus: string | null;
  lastSeenAt: string | null;
}

export function ScreenCard({ id, name, capacity, nucStatus, lastSeenAt }: ScreenCardProps) {
  const isOnline = nucStatus === 'online';
  const statusDot = isOnline ? 'bg-green-500' : 'bg-red-500';
  const statusLabel = isOnline ? 'NUC online' : 'NUC offline';

  const lastSeenLabel = lastSeenAt ? formatRelative(lastSeenAt) : 'Jamais vu';

  return (
    <Link
      href={`/screens/${id}`}
      className="block rounded-lg border bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <ProjectorScreen className="shrink-0 text-gray-500" size={22} weight="duotone" />
        {name}
      </h3>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot}`} />
        <span className="text-sm text-gray-600">{statusLabel}</span>
      </div>
      {capacity != null && <p className="mt-1 text-sm text-gray-500">Capacité : {capacity}</p>}
      <p className="mt-1 text-xs text-gray-400">Dernière activité : {lastSeenLabel}</p>
      <p className="mt-3 text-sm font-medium text-blue-600">Voir la salle →</p>
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
