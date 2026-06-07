'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { api } from '../../../lib/api';
import { resolveMediaUrl } from '../../../lib/media-url';

interface SponsorRow {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  active: boolean;
  brandColorPrimary: string | null;
  brandColorSecondary: string | null;
  quizzesCount?: number;
}

interface ListResponse {
  items: SponsorRow[];
  total: number;
}

export default function SponsorsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const queryKey = ['sponsors', search, activeOnly] as const;
  const queryStr = (() => {
    const q = new URLSearchParams();
    q.set('limit', '50');
    if (search.trim()) q.set('search', search.trim());
    if (activeOnly) q.set('active', 'true');
    return q.toString();
  })();

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<ListResponse>(`/api/sponsors?${queryStr}`),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post<{ slug: string }>('/api/sponsors', {
        name: newName,
        ...(newSlug.trim() ? { slug: newSlug.trim() } : {}),
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['sponsors'] });
      setShowCreate(false);
      setNewName('');
      setNewSlug('');
      router.push(`/sponsors/${s.slug}`);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sponsors</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.total ?? 0} sponsor(s)</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} weight="bold" />
          Créer un sponsor
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-xs">
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
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Actifs uniquement
        </label>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouveau sponsor</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Nom"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Slug (optionnel)"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
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
                  Sponsor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  État
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Quizz
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.items.map((s) => {
                const logo = resolveMediaUrl(s.logoUrl);
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {logo ? (
                          <img src={logo} alt="" className="h-10 w-10 rounded-md object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-gray-100" />
                        )}
                        <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.slug}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.active ? 'actif' : 'inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.quizzesCount ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        href={`/sponsors/${s.slug}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        Fiche
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
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
