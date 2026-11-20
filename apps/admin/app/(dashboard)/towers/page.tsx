'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { TOWER_ENGINE_KEY } from '@quiz-app/validation';
import { api } from '../../../lib/api';
import { getNavItem } from '../../../lib/nav-items';
import { GAME_STATUS_LABEL } from '../../../lib/poll-api';
import type { TowerGameRow } from '../../../lib/tower-api';
import { PageHeader } from '../../components/page-header';

/** Liste des mini-jeux tour de livres, avec création et modification. */
export default function TowersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['games', TOWER_ENGINE_KEY],
    queryFn: () =>
      api.get<{ items: TowerGameRow[]; total: number }>(
        `/api/games?engineKey=${TOWER_ENGINE_KEY}&limit=100`,
      ),
  });

  return (
    <div>
      <PageHeader
        icon={getNavItem('/towers')!.icon}
        title="Tour de livres"
        subtitle={`${data?.total ?? 0} jeu${(data?.total ?? 0) > 1 ? 'x' : ''}`}
        actions={
          <Link
            href="/games/new-tower"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} weight="bold" />
            Créer une tour de livres
          </Link>
        }
      />

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Titre</th>
              <th className="px-4 py-3 font-medium">Construction</th>
              <th className="px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Aucune tour de livres pour le moment.
                </td>
              </tr>
            )}
            {data?.items.map((game) => {
              const status = GAME_STATUS_LABEL[game.status];
              return (
                <tr key={game.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/games/${game.slug}/edit-tower`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {game.title}
                    </Link>
                    <div className="text-xs text-gray-400">{game.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    {game.configJson ? `${game.configJson.durationSeconds} s` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {status && (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
