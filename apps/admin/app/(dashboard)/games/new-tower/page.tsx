'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { TOWER_ENGINE_KEY } from '@quiz-app/validation';
import { api } from '../../../../lib/api';
import { getNavItem } from '../../../../lib/nav-items';
import { towerErrorMessage, type TowerGameRow } from '../../../../lib/tower-api';
import { PageHeader } from '../../../components/page-header';
import { TowerForm } from '../../../components/tower-form';

/** Création d'une tour de livres (brouillon), puis passage à sa page de modification et de publication. */
export default function NewTowerPage() {
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <div className="max-w-3xl">
      <Link href="/towers" className="text-sm text-gray-500 hover:text-gray-700">
        ← Tour de livres
      </Link>
      <div className="mt-2">
        <PageHeader
          icon={getNavItem('/towers')!.icon}
          title="Nouvelle tour de livres"
          subtitle="Jeu d’équilibre : empiler des livres, la plus haute tour gagne."
        />
      </div>
      <TowerForm
        submitLabel="Créer le jeu"
        onSubmit={async ({ title, config }) => {
          try {
            const game = await api.post<TowerGameRow>('/api/games', {
              engineKey: TOWER_ENGINE_KEY,
              title,
              configJson: config,
            });
            void qc.invalidateQueries({ queryKey: ['games'] });
            router.push(`/games/${game.slug}/edit-tower`);
          } catch (err) {
            throw new Error(towerErrorMessage(err));
          }
        }}
      />
    </div>
  );
}
