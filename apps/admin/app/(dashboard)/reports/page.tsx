'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChartBar } from '@phosphor-icons/react';
import { api } from '../../../lib/api';

interface ReportableSession {
  id: string;
  slugShort: string;
  state: 'ended' | 'aborted';
  createdAt: string;
  endedAt: string | null;
  quizTitle: string;
  quizSlug: string;
  cinemaName: string;
  cinemaSlug: string;
  screenName: string;
  sponsorName: string | null;
  players: number;
  lateJoined: number;
  completionRate: number | null;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPct(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)} %`;
}

export default function ReportsPage() {
  const [cinemaFilter, setCinemaFilter] = useState('');
  const [quizFilter, setQuizFilter] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reportable-sessions'],
    queryFn: () => api.get<{ items: ReportableSession[] }>('/api/sessions/reports'),
  });

  const items = data?.items ?? [];

  const cinemaOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of items) map.set(s.cinemaSlug, s.cinemaName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const quizOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of items) map.set(s.quizSlug, s.quizTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (s) =>
          (cinemaFilter === '' || s.cinemaSlug === cinemaFilter) &&
          (quizFilter === '' || s.quizSlug === quizFilter),
      ),
    [items, cinemaFilter, quizFilter],
  );

  const csvHref =
    cinemaFilter !== ''
      ? `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/cinemas/${cinemaFilter}/sessions/report.csv`
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports de session</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} session{filtered.length > 1 ? 's' : ''} terminée
            {filtered.length > 1 ? 's' : ''}
          </p>
        </div>
        {csvHref ? (
          <a
            href={csvHref}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV du cinéma
          </a>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <select
          value={cinemaFilter}
          onChange={(e) => setCinemaFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Tous les cinémas</option>
          {cinemaOptions.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={quizFilter}
          onChange={(e) => setQuizFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Tous les quiz</option>
          {quizOptions.map(([slug, title]) => (
            <option key={slug} value={slug}>
              {title}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="mt-6 text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="mt-6 text-sm text-red-600">Impossible de charger les rapports.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Cinéma / salle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Quiz
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Sponsor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Joueurs
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Complétion
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((s) => (
                <tr key={s.id} className="group hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      {formatDate(s.endedAt ?? s.createdAt)}
                      {s.state === 'aborted' ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                          Interrompue
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{s.cinemaName}</div>
                    <div className="text-xs text-gray-500">{s.screenName}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{s.quizTitle}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{s.sponsorName ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {s.players}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {formatPct(s.completionRate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/reports/${s.id}`}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      Voir le rapport
                      <ArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <ChartBar size={32} className="mx-auto text-gray-300" />
                    <p className="mt-2 text-sm text-gray-400">
                      Aucune session terminée à afficher.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
