'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TOWER_ENGINE_KEY } from '@quiz-app/validation';
import { api } from '../../../../../lib/api';
import { getNavItem } from '../../../../../lib/nav-items';
import { GAME_STATUS_LABEL } from '../../../../../lib/poll-api';
import { towerErrorMessage, type TowerGameRow } from '../../../../../lib/tower-api';
import { PageHeader } from '../../../../components/page-header';
import { TowerForm } from '../../../../components/tower-form';

/** Modification d'une tour de livres (même formulaire que la création) et publication. */
export function EditTowerClient({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const {
    data: game,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['games', 'detail', slug],
    queryFn: () => api.get<TowerGameRow>(`/api/games/${encodeURIComponent(slug)}`),
  });

  const publish = useMutation({
    mutationFn: () => api.post<TowerGameRow>(`/api/games/${encodeURIComponent(slug)}/publish`),
    onSuccess: (updated) => {
      setPublishError(null);
      qc.setQueryData(['games', 'detail', slug], updated);
      void qc.invalidateQueries({ queryKey: ['games', TOWER_ENGINE_KEY] });
    },
    onError: (err) => setPublishError(towerErrorMessage(err)),
  });

  if (isLoading) return <p className="text-gray-400">Chargement…</p>;
  if (error || !game) return <p className="text-red-600">Jeu introuvable.</p>;
  if (game.engineKey !== TOWER_ENGINE_KEY || !game.configJson) {
    return <p className="text-gray-600">Ce jeu n&apos;est pas une tour de livres.</p>;
  }

  const status = GAME_STATUS_LABEL[game.status];

  return (
    <div className="max-w-3xl">
      <Link href="/towers" className="text-sm text-gray-500 hover:text-gray-700">
        ← Tour de livres
      </Link>
      <div className="mt-2">
        <PageHeader
          icon={getNavItem('/towers')!.icon}
          title={game.title}
          subtitle={
            <span className="inline-flex items-center gap-2">
              {status && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                  {status.label}
                </span>
              )}
              <span>{game.slug}</span>
            </span>
          }
          actions={
            game.status === 'draft' ? (
              <button
                type="button"
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Publier
              </button>
            ) : null
          }
        />
      </div>
      {publishError && <p className="mt-3 text-sm text-red-600">{publishError}</p>}
      {saved && <p className="mt-3 text-sm text-green-700">Modifications enregistrées.</p>}
      <TowerForm
        key={game.updatedAt}
        initial={{ title: game.title, config: game.configJson }}
        submitLabel="Enregistrer"
        onSubmit={async ({ title, config }) => {
          setSaved(false);
          try {
            const updated = await api.patch<TowerGameRow>(
              `/api/games/${encodeURIComponent(slug)}`,
              {
                title,
                configJson: config,
              },
            );
            qc.setQueryData(['games', 'detail', slug], updated);
            void qc.invalidateQueries({ queryKey: ['games', TOWER_ENGINE_KEY] });
            setSaved(true);
          } catch (err) {
            throw new Error(towerErrorMessage(err));
          }
        }}
      />
    </div>
  );
}
