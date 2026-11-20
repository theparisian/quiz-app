'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, MagnifyingGlass } from '@phosphor-icons/react';
import { api } from '../../../lib/api';
import { resolveMediaUrl } from '../../../lib/media-url';
import { getNavItem } from '../../../lib/nav-items';
import { GAME_STATUS_LABEL } from '../../../lib/poll-api';
import {
  AUDIENCE_LABEL,
  ENGINE_LABEL,
  KIND_LABEL,
  catalogErrorMessage,
  type CatalogGameListResponse,
  type CatalogGameRow,
} from '../../../lib/games-api';
import { GamesTabs } from '../../components/games-tabs';
import { PageHeader } from '../../components/page-header';

const PAGE_SIZE = 25;

const selectClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

/** Catalogue des jeux (C1) : tous les moteurs, présence dans le catalogue des cinémas. */
export default function GamesCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [engineKey, setEngineKey] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [catalog, setCatalog] = useState('');
  const [page, setPage] = useState(1);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search.trim()) params.set('search', search.trim());
  if (engineKey) params.set('engineKey', engineKey);
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  if (catalog) params.set('catalogEnabled', catalog);
  const queryString = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ['games', 'catalog', queryString],
    queryFn: () => api.get<CatalogGameListResponse>(`/api/games?${queryString}`),
  });

  const toggle = useMutation({
    mutationFn: (game: CatalogGameRow) =>
      api.post<CatalogGameRow>(
        `/api/games/${encodeURIComponent(game.slug)}/${game.catalogEnabled ? 'disable' : 'enable'}`,
      ),
    onSuccess: () => {
      setToggleError(null);
      void qc.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err) => setToggleError(catalogErrorMessage(err)),
  });

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <GamesTabs />
      <PageHeader
        icon={getNavItem('/games')!.icon}
        title="Catalogue"
        subtitle={`${total} jeu${total > 1 ? 'x' : ''} · les cinémas voient les jeux publiés présents dans le catalogue`}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          aria-label="Moteur"
          value={engineKey}
          onChange={(e) => resetPage(setEngineKey)(e.target.value)}
          className={selectClass}
        >
          <option value="">Tous les moteurs</option>
          {Object.entries(ENGINE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Type"
          value={kind}
          onChange={(e) => resetPage(setKind)(e.target.value)}
          className={selectClass}
        >
          <option value="">Tous les types</option>
          {Object.entries(KIND_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Statut"
          value={status}
          onChange={(e) => resetPage(setStatus)(e.target.value)}
          className={selectClass}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(GAME_STATUS_LABEL).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Catalogue"
          value={catalog}
          onChange={(e) => resetPage(setCatalog)(e.target.value)}
          className={selectClass}
        >
          <option value="">Dans le catalogue ou non</option>
          <option value="true">Dans le catalogue</option>
          <option value="false">Hors catalogue</option>
        </select>
      </div>

      {toggleError && <p className="mt-3 text-sm text-red-600">{toggleError}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Jeu</th>
              <th className="px-4 py-3">Moteur</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Sponsor</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Dans le catalogue</th>
              <th className="px-4 py-3">Audience</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Aucun jeu ne correspond à ces filtres.
                </td>
              </tr>
            )}
            {data?.items.map((game) => {
              const cover = resolveMediaUrl(game.coverImageUrl);
              const gameStatus = GAME_STATUS_LABEL[game.status];
              return (
                <tr key={game.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {cover ? (
                        <img src={cover} alt="" className="h-10 w-14 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-14 items-center justify-center rounded bg-gray-100 text-gray-300">
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/games/${encodeURIComponent(game.slug)}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {game.title}
                        </Link>
                        <div className="text-xs text-gray-400">{game.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{ENGINE_LABEL[game.engineKey] ?? game.engineKey}</td>
                  <td className="px-4 py-3">{KIND_LABEL[game.kind]}</td>
                  <td className="px-4 py-3 text-gray-600">{game.sponsor?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {gameStatus && (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${gameStatus.className}`}>
                        {gameStatus.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={game.catalogEnabled}
                      aria-label={`Dans le catalogue : ${game.title}`}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(game)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                        game.catalogEnabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          game.catalogEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    {game.catalogEnabled && game.status !== 'published' && (
                      <div className="mt-1 text-xs text-yellow-700">Visible une fois publié</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {game.audience === 'selected_cinemas'
                      ? `${game.cinemas.length} cinéma${game.cinemas.length > 1 ? 's' : ''}`
                      : AUDIENCE_LABEL.all_cinemas}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-gray-500">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
