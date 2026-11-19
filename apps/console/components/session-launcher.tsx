'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Play, X } from '@phosphor-icons/react';
import type { CatalogGame } from '@quiz-app/validation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CatalogPicker } from '@/components/catalog/catalog-picker';
import { estimateGameSeconds, formatDuration } from '@/components/catalog/format';

/** Nombre maximal de jeux (manches) d'une séance (même limite que l'API). */
export const MAX_GAMES_PER_SESSION = 5;

interface SessionLauncherProps {
  screenId: string;
  onLaunched: (sessionId: string) => void;
}

/** Message d'un refus de création de séance, en vouvoiement. */
function launchErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'GAME_NOT_AVAILABLE') {
    return 'Un des jeux choisis n’est plus disponible pour votre cinéma. Retirez-le et réessayez.';
  }
  return err instanceof Error ? err.message : 'Erreur lors de la création';
}

/**
 * Lancement d'une séance : un ou plusieurs jeux du catalogue du cinéma (5 au maximum), joués
 * dans l'ordre choisi. La séance est toujours créée par `gameSlugs`.
 */
export function SessionLauncher({ screenId, onLaunched }: SessionLauncherProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cinemaSlug = user?.cinemaSlug ?? null;
  const [selected, setSelected] = useState<CatalogGame[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const maxReached = selected.length >= MAX_GAMES_PER_SESSION;
  const totalSeconds = selected.reduce((acc, g) => acc + estimateGameSeconds(g), 0);

  const choose = (game: CatalogGame) => {
    setSelected((prev) => {
      if (prev.some((g) => g.slug === game.slug)) return prev;
      if (prev.length >= MAX_GAMES_PER_SESSION) return prev;
      return [...prev, game];
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    setSelected((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const remove = (slug: string) => setSelected((prev) => prev.filter((g) => g.slug !== slug));

  const handleCreate = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    setError('');
    try {
      const session = await api.post<{ id: string }>('/api/sessions', {
        gameSlugs: selected.map((g) => g.slug),
        screenId,
      });
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'screen', screenId] });
      onLaunched(session.id);
    } catch (err) {
      setError(launchErrorMessage(err));
      setCreating(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Lancer une session</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choisissez dans votre catalogue un ou plusieurs jeux ({MAX_GAMES_PER_SESSION} au maximum) à
        projeter sur cette salle, dans l&apos;ordre des manches. Cliquez sur un jeu pour voir sa
        fiche.
      </p>

      {selected.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <div className="flex items-center justify-between text-xs font-medium uppercase text-gray-500">
            <span>
              {selected.length === 1 ? '1 manche' : `${selected.length} manches`}
              {maxReached && ' (maximum atteint)'}
            </span>
            <span>Durée totale estimée : {formatDuration(totalSeconds)}</span>
          </div>
          <ol className="mt-2 space-y-1.5">
            {selected.map((game, i) => (
              <li
                key={game.slug}
                className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm shadow-sm"
              >
                <span className="w-16 shrink-0 text-xs font-semibold text-blue-700">
                  Manche {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-900">{game.title}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDuration(estimateGameSeconds(game))}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Monter"
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label="Descendre"
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(game.slug)}
                  aria-label="Retirer"
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4">
        {cinemaSlug ? (
          <CatalogPicker
            cinemaSlug={cinemaSlug}
            selectedSlugs={selected.map((g) => g.slug)}
            maxReached={maxReached}
            onChoose={choose}
            onRemove={remove}
          />
        ) : (
          <p className="text-sm text-gray-400">Aucun cinéma associé à votre compte.</p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={selected.length === 0 || creating}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Play size={16} weight="fill" />
          {creating ? 'Création...' : 'Lancer la session'}
        </button>
      </div>
    </div>
  );
}
