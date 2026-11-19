'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogGame, CatalogListResponse } from '@quiz-app/validation';
import { api } from '@/lib/api';
import { GameCard } from './game-card';
import { GameDetailDrawer } from './game-detail-drawer';
import { ENGINE_LABEL } from './format';

interface CatalogPickerProps {
  cinemaSlug: string;
  /** Jeux choisis, dans l'ordre des manches. */
  selectedSlugs: string[];
  /** Séance pleine : aucun nouveau jeu ne peut être choisi. */
  maxReached: boolean;
  onChoose: (game: CatalogGame) => void;
  onRemove: (slug: string) => void;
}

const ENGINE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les jeux' },
  ...Object.entries(ENGINE_LABEL).map(([value, label]) => ({ value, label })),
];

/** Catalogue des jeux disponibles pour le cinéma : cartes, filtres, fiche en panneau latéral. */
export function CatalogPicker({
  cinemaSlug,
  selectedSlugs,
  maxReached,
  onChoose,
  onRemove,
}: CatalogPickerProps) {
  const [search, setSearch] = useState('');
  const [engineKey, setEngineKey] = useState('');
  const [opened, setOpened] = useState<CatalogGame | null>(null);

  const { data, isLoading, isError } = useQuery<CatalogListResponse>({
    queryKey: ['catalog', cinemaSlug, search, engineKey],
    queryFn: () => {
      const params = new URLSearchParams({ cinemaSlug });
      if (search.trim()) params.set('search', search.trim());
      if (engineKey) params.set('engineKey', engineKey);
      return api.get<CatalogListResponse>(`/api/catalog?${params}`);
    },
    staleTime: 30_000,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Rechercher un jeu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-1 rounded-md bg-gray-100 p-1 text-sm">
          {ENGINE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setEngineKey(f.value)}
              className={`rounded px-3 py-1 ${
                engineKey === f.value ? 'bg-white font-medium shadow-sm' : 'text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement du catalogue...</p>
      ) : isError ? (
        <p className="text-sm text-red-600">
          Le catalogue n&apos;a pas pu être chargé. Réessayez dans un instant.
        </p>
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((game) => {
            const order = selectedSlugs.indexOf(game.slug);
            return (
              <GameCard
                key={game.slug}
                game={game}
                order={order >= 0 ? order : null}
                onOpen={setOpened}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun jeu disponible dans votre catalogue.</p>
      )}

      {opened && (
        <GameDetailDrawer
          game={opened}
          cinemaSlug={cinemaSlug}
          selected={selectedSlugs.includes(opened.slug)}
          maxReached={maxReached}
          onChoose={(game) => {
            onChoose(game);
            setOpened(null);
          }}
          onRemove={(slug) => {
            onRemove(slug);
            setOpened(null);
          }}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}
