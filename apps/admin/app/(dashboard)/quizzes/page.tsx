'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass, PencilSimple, Plus } from '@phosphor-icons/react';
import { api } from '../../../lib/api';

interface QuizRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  language: string;
  createdAt: string;
  sponsor: { slug: string; name: string } | null;
  questionsCount: number;
}

interface ListResponse {
  items: QuizRow[];
  total: number;
}

const STATUS_OPTS = [
  { value: '', label: 'Tous statuts' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publié' },
  { value: 'archived', label: 'Archivé' },
];

const TYPE_OPTS = [
  { value: '', label: 'Tous types' },
  { value: 'standard', label: 'Standard' },
  { value: 'sponsored', label: 'Sponsorisé' },
  { value: 'custom', label: 'Custom' },
];

function buildQuizzesQuery(params: {
  search: string;
  status: string;
  type: string;
  sponsorId: string;
}): string {
  const q = new URLSearchParams();
  q.set('limit', '50');
  if (params.search.trim()) q.set('search', params.search.trim());
  if (params.status) q.set('status', params.status);
  if (params.type) q.set('type', params.type);
  if (params.sponsorId) q.set('sponsorId', params.sponsorId);
  return q.toString();
}

export default function QuizzesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sponsorId, setSponsorId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'standard' | 'sponsored' | 'custom'>('standard');
  const [newSponsorId, setNewSponsorId] = useState('');

  const sponsorsQ = useQuery({
    queryKey: ['sponsors', 'filter'],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; slug: string }[] }>(
        '/api/sponsors?limit=500&active=true',
      ),
  });

  const queryStr = buildQuizzesQuery({ search, status, type, sponsorId });

  const { data, isLoading } = useQuery({
    queryKey: ['quizzes', queryStr],
    queryFn: () => api.get<ListResponse>(`/api/quizzes?${queryStr}`),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post<{ slug: string }>('/api/quizzes', {
        title: newTitle,
        type: newType,
        ...(newSponsorId ? { sponsorId: newSponsorId } : {}),
        language: 'fr',
      }),
    onSuccess: (q) => {
      void qc.invalidateQueries({ queryKey: ['quizzes'] });
      setShowCreate(false);
      setNewTitle('');
      setNewType('standard');
      setNewSponsorId('');
      router.push(`/quizzes/${q.slug}/edit`);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quizz</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.total ?? 0} quizz</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} weight="bold" />
          Créer un quizz
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {STATUS_OPTS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {TYPE_OPTS.map((o) => (
            <option key={o.value || 'all-t'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={sponsorId}
          onChange={(e) => setSponsorId(e.target.value)}
          className="min-w-[180px] rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Tous sponsors</option>
          {sponsorsQ.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouveau quizz</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Titre"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as typeof newType)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="standard">Standard</option>
              <option value="sponsored">Sponsorisé</option>
              <option value="custom">Custom</option>
            </select>
            <select
              value={newSponsorId}
              onChange={(e) => setNewSponsorId(e.target.value)}
              className="min-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Sans sponsor</option>
              {sponsorsQ.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!newTitle.trim() || createMut.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-6 text-gray-400">Chargement…</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Titre
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Sponsor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Questions
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.items.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{q.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{q.status}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{q.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{q.sponsor?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{q.questionsCount}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    <Link
                      href={`/quizzes/${q.slug}/edit`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <PencilSimple size={14} />
                      Éditer
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.items.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">Aucun résultat.</p>
          )}
        </div>
      )}
    </div>
  );
}
