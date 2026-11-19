'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import type {
  CatalogGame,
  CatalogListResponse,
  GameKindValue,
  ScreenProgram,
} from '@quiz-app/validation';
import { api } from '@/lib/api';
import { GameCard } from '@/components/catalog/game-card';
import { AddToScreensMenu } from './add-to-screens-menu';

/** Identifiant de glisser-déposer d'une carte du catalogue. */
export function catalogDndId(gameSlug: string): string {
  return `catalog:${gameSlug}`;
}

const KIND_FILTERS: { value: GameKindValue | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'internal', label: 'Maison' },
  { value: 'sponsored', label: 'Sponsorisés' },
];

interface ProgramsCatalogProps {
  cinemaSlug: string;
  programs: ScreenProgram[];
  canEdit: boolean;
  onOpen: (game: CatalogGame) => void;
  onToggleScreen: (game: CatalogGame, screenId: string, checked: boolean) => void;
}

/** Catalogue du cinéma (colonne droite) : recherche, filtres, cartes à glisser vers une salle. */
export function ProgramsCatalog({
  cinemaSlug,
  programs,
  canEdit,
  onOpen,
  onToggleScreen,
}: ProgramsCatalogProps) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<GameKindValue | ''>('');
  const searchId = useId();

  const { data, isLoading, isError } = useQuery<CatalogListResponse>({
    queryKey: ['catalog', cinemaSlug, search, kind],
    queryFn: () => {
      const params = new URLSearchParams({ cinemaSlug });
      if (search.trim()) params.set('search', search.trim());
      if (kind) params.set('kind', kind);
      return api.get<CatalogListResponse>(`/api/catalog?${params}`);
    },
    staleTime: 30_000,
  });

  return (
    <section aria-labelledby="programs-catalog-title">
      <h2 id="programs-catalog-title" className="text-lg font-semibold text-gray-900">
        Catalogue
      </h2>
      {canEdit && (
        <p className="mt-0.5 text-xs text-gray-500">
          Glissez un jeu sur une salle, ou utilisez « Ajouter à… ».
        </p>
      )}

      <div className="mt-3 space-y-2">
        <label htmlFor={searchId} className="sr-only">
          Rechercher un jeu
        </label>
        <input
          id={searchId}
          type="search"
          placeholder="Rechercher un jeu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div
          className="flex gap-1 rounded-md bg-gray-100 p-1 text-sm"
          role="group"
          aria-label="Type de jeu"
        >
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => setKind(f.value)}
              className={`min-h-9 flex-1 rounded px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                kind === f.value ? 'bg-white font-medium shadow-sm' : 'text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement du catalogue…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">
            Le catalogue n&apos;a pas pu être chargé. Réessayez dans un instant.
          </p>
        ) : data && data.items.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            {data.items.map((game) => (
              <CatalogItem
                key={game.slug}
                game={game}
                programs={programs}
                canEdit={canEdit}
                onOpen={onOpen}
                onToggleScreen={onToggleScreen}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Aucun jeu ne correspond à votre recherche.</p>
        )}
      </div>
    </section>
  );
}

function CatalogItem({
  game,
  programs,
  canEdit,
  onOpen,
  onToggleScreen,
}: {
  game: CatalogGame;
  programs: ScreenProgram[];
  canEdit: boolean;
  onOpen: (game: CatalogGame) => void;
  onToggleScreen: (game: CatalogGame, screenId: string, checked: boolean) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: catalogDndId(game.slug),
    data: { type: 'catalog', game, label: `« ${game.title} »` },
    disabled: !canEdit,
  });
  // Glisser à la souris ou au doigt seulement : au clavier, Entrée ouvre la fiche et
  // « Ajouter à… » remplace le glisser-déposer.
  const pointerListeners = { ...listeners };
  delete pointerListeners.onKeyDown;

  return (
    <li className={`flex flex-col gap-2 ${isDragging ? 'opacity-40' : ''}`}>
      <div
        ref={setNodeRef}
        {...pointerListeners}
        className={`grid ${canEdit ? 'cursor-grab' : ''}`}
      >
        <GameCard game={game} order={null} onOpen={onOpen} />
      </div>
      {canEdit && (
        <AddToScreensMenu
          game={game}
          programs={programs}
          onToggle={(screenId, checked) => onToggleScreen(game, screenId, checked)}
        />
      )}
    </li>
  );
}
