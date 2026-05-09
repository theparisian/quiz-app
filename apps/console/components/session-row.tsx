'use client';

import Link from 'next/link';
import type { SessionListItem } from '@/hooks/use-sessions';

function isLive(state: string) {
  return ['lobby', 'running', 'paused'].includes(state);
}

function stateLabel(state: string) {
  switch (state) {
    case 'ended':
      return '✅';
    case 'aborted':
      return '✕';
    case 'lobby':
      return '⏳';
    case 'running':
      return '▶';
    case 'paused':
      return '⏸';
    default:
      return state;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionRow({ session }: { session: SessionListItem }) {
  const href = isLive(session.state) ? `/sessions/${session.id}/live` : `/sessions/${session.id}`;

  return (
    <Link
      href={href}
      className="grid grid-cols-[1fr_1fr_80px_80px] items-center gap-2 border-b px-4 py-3 text-sm hover:bg-gray-50"
    >
      <span className="text-gray-700">{formatDate(session.createdAt)}</span>
      <span className="truncate text-gray-700">{session.quizTitle}</span>
      <span className="text-center text-gray-600">{session.playersCount}</span>
      <span className="text-center">{stateLabel(session.state)}</span>
    </Link>
  );
}
