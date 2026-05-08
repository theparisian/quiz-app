'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../../../lib/api';

interface UsageBlock {
  generations: number;
  tokensInput: number;
  tokensOutput: number;
  costEur: number;
}

interface StatsRes {
  month: UsageBlock;
  last7Days: UsageBlock;
  allTime: UsageBlock;
}

interface GenRow {
  id: string;
  userId: string;
  status: string;
  modelUsed: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costEstimateEur: number | null;
  createdAt: string;
  user: { id: string; email: string | null; displayName: string | null };
}

interface GenDetail extends GenRow {
  quizId: string | null;
  inputSummary: string | null;
  inputFull: string | null;
  outputJson: unknown;
  errorDetails: unknown;
  errorMessage: string | null;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function modelLabel(m: string | null): string {
  if (m === 'claude-opus-4-7') return 'Opus';
  if (m === 'claude-sonnet-4-6') return 'Sonnet';
  return m ?? '—';
}

function StatMini({ title, b }: { title: string; b: UsageBlock }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{b.generations} générations</p>
      <p className="mt-1 text-sm text-gray-600">
        {fmtTok(b.tokensInput)} tokens in · {fmtTok(b.tokensOutput)} tokens out
      </p>
      <p className="mt-1 text-sm font-medium text-gray-800">≈ {b.costEur.toFixed(2)} €</p>
    </div>
  );
}

export default function AiUsagePage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statsQ = useQuery({
    queryKey: ['ai-usage-stats'],
    queryFn: () => api.get<StatsRes>('/api/ai/usage/stats'),
  });

  const listQ = useQuery({
    queryKey: ['ai-generations', page, status, model, search],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('limit', '15');
      if (status) q.set('status', status);
      if (model) q.set('model', model);
      if (search.trim()) q.set('search', search.trim());
      return api.get<{ items: GenRow[]; total: number; page: number; limit: number }>(
        `/api/ai/generations?${q.toString()}`,
      );
    },
  });

  const detailQ = useQuery({
    queryKey: ['ai-generation', selectedId],
    queryFn: () => api.get<GenDetail>(`/api/ai/generations/${selectedId}`),
    enabled: !!selectedId,
  });

  const totalPages = useMemo(() => {
    if (!listQ.data) return 1;
    return Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit));
  }, [listQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usage IA</h1>
        <p className="mt-1 text-sm text-gray-500">Générations Claude et coûts estimés</p>
      </div>

      {statsQ.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatMini title="Ce mois" b={statsQ.data.month} />
          <StatMini title="7 derniers jours" b={statsQ.data.last7Days} />
          <StatMini title="Total" b={statsQ.data.allTime} />
        </div>
      ) : (
        <p className="text-gray-400">Chargement des stats…</p>
      )}

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Historique des générations</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <select
            className="rounded border px-2 py-1.5 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="success">Succès</option>
            <option value="failed">Échec</option>
            <option value="partial">Partiel</option>
          </select>
          <select
            className="rounded border px-2 py-1.5 text-sm"
            value={model}
            onChange={(e) => {
              setPage(1);
              setModel(e.target.value);
            }}
          >
            <option value="">Tous les modèles</option>
            <option value="claude-sonnet-4-6">Sonnet</option>
            <option value="claude-opus-4-7">Opus</option>
          </select>
          <input
            type="search"
            placeholder="Recherche (résumé source)"
            className="min-w-[200px] flex-1 rounded border px-3 py-1.5 text-sm"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Utilisateur</th>
                <th className="pb-2 pr-3">Modèle</th>
                <th className="pb-2 pr-3">Tokens</th>
                <th className="pb-2 pr-3">Coût</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="whitespace-nowrap py-2 pr-3">
                    {new Date(row.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2 pr-3">
                    {(row.user.displayName ?? row.user.email ?? row.user.id).slice(0, 24)}
                  </td>
                  <td className="py-2 pr-3">{modelLabel(row.modelUsed)}</td>
                  <td className="py-2 pr-3">
                    {(row.tokensInput ?? 0) + (row.tokensOutput ?? 0) > 0
                      ? fmtTok((row.tokensInput ?? 0) + (row.tokensOutput ?? 0))
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {row.costEstimateEur != null ? `${row.costEstimateEur.toFixed(2)} €` : '—'}
                  </td>
                  <td className="py-2">{row.status === 'success' ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Précédent
          </button>
          <span className="text-gray-600">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </div>
      </div>

      {selectedId && detailQ.data && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold text-gray-900">Détail génération</h3>
            <button type="button" className="text-gray-500" onClick={() => setSelectedId(null)}>
              Fermer
            </button>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <p>
              <span className="text-gray-500">ID</span> {detailQ.data.id}
            </p>
            <p>
              <span className="text-gray-500">Statut</span> {detailQ.data.status}
            </p>
            <p>
              <span className="text-gray-500">Modèle</span> {modelLabel(detailQ.data.modelUsed)}
            </p>
            <p>
              <span className="text-gray-500">Tokens</span> in {detailQ.data.tokensInput ?? '—'} ·
              out {detailQ.data.tokensOutput ?? '—'}
            </p>
            <p>
              <span className="text-gray-500">Coût estimé</span>{' '}
              {detailQ.data.costEstimateEur != null
                ? `${detailQ.data.costEstimateEur.toFixed(4)} €`
                : '—'}
            </p>
            <div>
              <p className="text-gray-500">Source (complet)</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">
                {detailQ.data.inputFull ?? detailQ.data.inputSummary ?? '—'}
              </pre>
            </div>
            {detailQ.data.outputJson != null && (
              <details>
                <summary className="cursor-pointer font-medium text-gray-800">Output JSON</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-xs">
                  {JSON.stringify(detailQ.data.outputJson, null, 2)}
                </pre>
              </details>
            )}
            {detailQ.data.errorDetails != null && (
              <details>
                <summary className="cursor-pointer font-medium text-red-700">Erreur</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-50 p-2 text-xs">
                  {JSON.stringify(detailQ.data.errorDetails, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      <div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
