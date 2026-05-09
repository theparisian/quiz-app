'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSessionsByScreen } from '@/hooks/use-sessions';
import { SessionRow } from '@/components/session-row';

export default function ScreenDetailPage() {
  const { screenId } = useParams<{ screenId: string }>();
  const { data, isLoading } = useSessionsByScreen(screenId);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
          ← Mes salles
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Salle</h1>
        <Link
          href={`/sessions/new?screenId=${screenId}`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nouvelle session
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-800">Sessions passées</h2>

        {isLoading ? (
          <p className="mt-4 text-gray-400">Chargement...</p>
        ) : data && data.items.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border bg-white">
            <div className="grid grid-cols-[1fr_1fr_80px_80px] gap-2 border-b bg-gray-50 px-4 py-2 text-xs font-medium uppercase text-gray-500">
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
          <p className="mt-4 text-sm text-gray-400">Aucune session passée.</p>
        )}
      </div>
    </div>
  );
}
