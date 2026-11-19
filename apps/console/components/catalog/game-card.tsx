'use client';

import type { CatalogGame } from '@quiz-app/validation';
import { Clock, Image as ImageIcon } from '@phosphor-icons/react';
import { resolveMediaUrl } from '@/lib/media-url';
import { ENGINE_LABEL, estimateGameSeconds, formatDuration, revenueLabel } from './format';

interface GameCardProps {
  game: CatalogGame;
  /** Position dans la séance (0-based), null si le jeu n'est pas choisi. */
  order: number | null;
  /** Ouvre la fiche du jeu. */
  onOpen: (game: CatalogGame) => void;
}

/** Carte d'un jeu du catalogue : couverture, titre, durée, pastille « Sponsorisé ». */
export function GameCard({ game, order, onOpen }: GameCardProps) {
  const coverUrl = resolveMediaUrl(game.coverImageUrl);
  const logoUrl = resolveMediaUrl(game.sponsor?.logoUrl);
  const isSelected = order !== null;

  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      aria-label={`${game.title} : voir la fiche`}
      className={`relative overflow-hidden rounded-lg border-2 bg-white text-left shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-blue-600' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {isSelected && (
        <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {order + 1}
        </span>
      )}
      {game.kind === 'sponsored' && (
        <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 shadow-sm">
          {logoUrl && <img src={logoUrl} alt="" className="h-4 w-4 rounded-full object-cover" />}
          Sponsorisé
        </span>
      )}
      <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <ImageIcon size={40} weight="duotone" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">{game.title}</p>
        {game.tagline && (
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{game.tagline}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span>{ENGINE_LABEL[game.engineKey] ?? game.engineKey}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock size={12} />
            {formatDuration(estimateGameSeconds(game))}
          </span>
          {game.sponsor && <span>{game.sponsor.name}</span>}
        </div>
        {game.revenue && (
          <p className="mt-1 text-xs font-medium text-emerald-700">{revenueLabel(game.revenue)}</p>
        )}
      </div>
    </button>
  );
}
