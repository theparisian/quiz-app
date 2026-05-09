'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../../lib/api';

interface PrizeRow {
  id: string;
  redeemCode: string;
  rank: number;
  label: string;
  emailSentAt: string | null;
  redeemedAt: string | null;
  playerPseudo: string;
  playerEmail: string | null;
  sessionSlugShort: string;
  quizTitle: string;
  sessionEndedAt: string | null;
  redeemFullUrl: string;
}

interface ListResponse {
  items: PrizeRow[];
  total: number;
  page: number;
  limit: number;
}

function statusLabel(row: PrizeRow): { text: string; className: string } {
  if (!row.emailSentAt) return { text: 'Échec envoi', className: 'text-red-600' };
  if (row.redeemedAt) return { text: 'Envoyé · Utilisé', className: 'text-green-700' };
  return { text: 'Envoyé', className: 'text-amber-700' };
}

export default function CinemaPrizesHistoryPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PrizeRow | null>(null);

  const q = useQuery<ListResponse>({
    queryKey: ['cinema-prizes-list', slug, status, search, page],
    queryFn: () => {
      const sp = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) sp.set('status', status);
      if (search.trim()) sp.set('search', search.trim());
      return api.get<ListResponse>(`/api/cinemas/${slug}/prizes?${sp.toString()}`);
    },
    enabled: !!slug,
  });

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  if (q.isLoading) return <p className="text-gray-500">Chargement…</p>;
  if (q.error || !q.data)
    return <p className="text-red-600">Impossible de charger l&apos;historique.</p>;

  const { items, total } = q.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/cinemas/${slug}/prizes`} className="text-sm text-blue-600 hover:underline">
          ← Lots
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Historique des lots</h1>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border bg-white p-4 shadow-sm">
        <label className="text-sm">
          Statut
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="sent">Email envoyé</option>
            <option value="failed">Échec envoi</option>
            <option value="redeemed">Utilisé</option>
          </select>
        </label>
        <label className="text-sm">
          Recherche pseudo
          <input
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="pseudo"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Fin session</th>
              <th className="px-3 py-2">Joueur</th>
              <th className="px-3 py-2">Rang</th>
              <th className="px-3 py-2">Lot</th>
              <th className="px-3 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const st = statusLabel(row);
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b hover:bg-gray-50"
                  onClick={() => setSelected(row)}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {row.sessionEndedAt
                      ? new Date(row.sessionEndedAt).toLocaleString('fr-FR')
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{row.playerPseudo}</td>
                  <td className="px-3 py-2">#{row.rank}</td>
                  <td className="max-w-[200px] truncate px-3 py-2">{row.label}</td>
                  <td className={`px-3 py-2 font-medium ${st.className}`}>{st.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">Aucun lot pour le moment.</p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {total} résultat(s) · page {page}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Précédent
          </button>
          <button
            type="button"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>

      {selected && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex justify-end bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">Détail du lot</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Joueur</dt>
                <dd>{selected.playerPseudo}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Email (lot)</dt>
                <dd>{selected.playerEmail ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Quiz</dt>
                <dd>{selected.quizTitle}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Code session</dt>
                <dd>{selected.sessionSlugShort}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Redeem code</dt>
                <dd className="font-mono text-xs">{selected.redeemCode}</dd>
              </div>
              <div>
                <dt className="text-gray-500">URL redeem</dt>
                <dd className="break-all font-mono text-xs">{selected.redeemFullUrl}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Email envoyé</dt>
                <dd>{selected.emailSentAt ?? 'Non'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Utilisé</dt>
                <dd>{selected.redeemedAt ?? 'Non'}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="mt-4 w-full rounded border py-2 text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(selected.redeemFullUrl);
              }}
            >
              Copier l&apos;URL redeem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
