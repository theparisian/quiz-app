'use client';

import Link from 'next/link';
import type { SessionListItem } from '@/hooks/use-sessions';

function isLive(state: string) {
  return ['lobby', 'running', 'paused'].includes(state);
}

const SESSION_STATE_CONFIG: Record<string, { label: string; className: string }> = {
  ended: { label: 'Terminée', className: 'bg-gray-100 text-gray-700' },
  aborted: { label: 'Abandonnée', className: 'bg-red-100 text-red-700' },
  lobby: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
  running: { label: 'En cours', className: 'bg-green-100 text-green-700' },
  paused: { label: 'En pause', className: 'bg-orange-100 text-orange-800' },
};

function SessionStateBadge({ state }: { state: string }) {
  const config = SESSION_STATE_CONFIG[state] ?? {
    label: state,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionRow({
  session,
  screenId,
}: {
  session: SessionListItem;
  screenId?: string;
}) {
  const href =
    isLive(session.state) && screenId ? `/screens/${screenId}` : `/sessions/${session.id}`;

  return (
    <Link
      href={href}
      className="grid grid-cols-[1fr_1fr_70px_100px] items-center gap-2 border-b px-4 py-3 text-sm hover:bg-gray-50"
    >
      <span className="text-gray-700">{formatDate(session.createdAt)}</span>
      <span className="truncate text-gray-700">{session.quizTitle}</span>
      <span className="text-center text-gray-600">{session.playersCount}</span>
      <span className="text-center">
        <SessionStateBadge state={session.state} />
      </span>
    </Link>
  );
}
