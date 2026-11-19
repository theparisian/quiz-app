'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { POLL_ENGINE_KEY } from '@quiz-app/validation';
import { api } from '../../../../lib/api';
import { getNavItem } from '../../../../lib/nav-items';
import { gameErrorMessage, type GameRow } from '../../../../lib/poll-api';
import { PageHeader } from '../../../components/page-header';
import { PollForm } from '../../../components/poll-form';

/** Création d'un sondage (brouillon), puis passage à sa page de modification et de publication. */
export default function NewPollPage() {
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <div className="max-w-3xl">
      <Link href="/polls" className="text-sm text-gray-500 hover:text-gray-700">
        ← Sondages
      </Link>
      <div className="mt-2">
        <PageHeader
          icon={getNavItem('/polls')!.icon}
          title="Nouveau sondage"
          subtitle="De 1 à 10 questions, 2 à 4 options chacune, sans bonne réponse."
        />
      </div>
      <PollForm
        submitLabel="Créer le sondage"
        onSubmit={async ({ title, config }) => {
          try {
            const game = await api.post<GameRow>('/api/games', {
              engineKey: POLL_ENGINE_KEY,
              title,
              configJson: config,
            });
            void qc.invalidateQueries({ queryKey: ['games'] });
            router.push(`/games/${game.slug}/edit-poll`);
          } catch (err) {
            throw new Error(gameErrorMessage(err));
          }
        }}
      />
    </div>
  );
}
