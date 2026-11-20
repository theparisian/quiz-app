'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BURGER_ENGINE_KEY } from '@quiz-app/validation';
import { api } from '../../../../lib/api';
import { getNavItem } from '../../../../lib/nav-items';
import { burgerErrorMessage, type BurgerGameRow } from '../../../../lib/burger-api';
import { PageHeader } from '../../../components/page-header';
import { BurgerForm } from '../../../components/burger-form';

/** Création d'un jeu burger (brouillon), puis passage à sa page de modification et de publication. */
export default function NewBurgerPage() {
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <div className="max-w-3xl">
      <Link href="/burgers" className="text-sm text-gray-500 hover:text-gray-700">
        ← Burger express
      </Link>
      <div className="mt-2">
        <PageHeader
          icon={getNavItem('/burgers')!.icon}
          title="Nouveau jeu burger"
          subtitle="Course de vitesse : remettre les étages du burger dans l’ordre."
        />
      </div>
      <BurgerForm
        submitLabel="Créer le jeu"
        onSubmit={async ({ title, config }) => {
          try {
            const game = await api.post<BurgerGameRow>('/api/games', {
              engineKey: BURGER_ENGINE_KEY,
              title,
              configJson: config,
            });
            void qc.invalidateQueries({ queryKey: ['games'] });
            router.push(`/games/${game.slug}/edit-burger`);
          } catch (err) {
            throw new Error(burgerErrorMessage(err));
          }
        }}
      />
    </div>
  );
}
