'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

interface SessionDetail {
  id: string;
  slugShort: string;
  state: string;
  totalPlayers: number;
  totalQuestions: number;
  quizTitle: string;
  screenId: string;
  screenName: string;
  cinemaName: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  winnerPlayerId: string | null;
  projectionistUserId: string | null;
  top3Prizes?: {
    prizeId: string;
    playerId: string;
    rank: number;
    label: string;
    shortCode: string;
    emailSentAt: string | null;
    redeemedAt: string | null;
    hasPlayerEmail: boolean;
  }[];
  players: {
    id: string;
    pseudo: string;
    scoreTotal: number;
    status: string;
    joinedAt: string;
  }[];
}

function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return '–';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PastSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data, isLoading } = useQuery<SessionDetail>({
    queryKey: ['session-detail', sessionId],
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${sessionId}/full`),
    enabled: !!sessionId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  const sortedPlayers = [...data.players].sort((a, b) => b.scoreTotal - a.scoreTotal);
  const stateLabel =
    data.state === 'ended' ? 'Terminée ✅' : data.state === 'aborted' ? 'Abandonnée ✕' : data.state;

  return (
    <div>
      <Link
        href={`/screens/${data.screenId}`}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← {data.screenName}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        Session du {formatDate(data.createdAt)}
      </h1>

      <div className="mt-6 rounded-lg border bg-white p-5">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Quiz</dt>
            <dd className="font-medium text-gray-900">{data.quizTitle}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Salle</dt>
            <dd className="font-medium text-gray-900">{data.screenName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Durée</dt>
            <dd className="font-medium text-gray-900">
              {formatDuration(data.startedAt, data.endedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Joueurs</dt>
            <dd className="font-medium text-gray-900">{data.totalPlayers}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Statut</dt>
            <dd className="font-medium text-gray-900">{stateLabel}</dd>
          </div>
        </dl>
      </div>

      {sortedPlayers.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-800">Scoreboard final</h2>
          <div className="mt-3 rounded-lg border bg-white">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between border-b px-4 py-2.5 last:border-b-0 ${
                  i === 0 ? 'bg-yellow-50' : ''
                }`}
              >
                <span className="text-sm text-gray-700">
                  <span className="mr-3 inline-block w-6 text-right font-semibold text-gray-500">
                    #{i + 1}
                  </span>
                  {p.pseudo}
                </span>
                <span className="font-mono text-sm font-medium text-gray-800">
                  {p.scoreTotal} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.top3Prizes && data.top3Prizes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-800">Lots podium</h2>
          <div className="mt-3 space-y-2">
            {data.top3Prizes.map((p) => {
              const player = sortedPlayers.find((pl) => pl.id === p.playerId);
              const status = p.redeemedAt
                ? `Utilisé ✓ (${formatDate(p.redeemedAt)})`
                : !p.hasPlayerEmail
                  ? 'Email non saisi'
                  : p.emailSentAt
                    ? 'Email envoyé ✓'
                    : "Échec d'envoi ⚠";
              return (
                <div key={p.prizeId} className="rounded-lg border bg-white px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      #{p.rank} {player?.pseudo ?? '—'}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{p.shortCode}</span>
                  </div>
                  <p className="mt-1 text-gray-600">{p.label}</p>
                  <p className="text-xs text-gray-500">{status}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
