import type { PollConfig } from '@quiz-app/validation';

/** Jeu renvoyé par `/api/games` (B6 : sondages). */
export interface GameRow {
  id: string;
  slug: string;
  title: string;
  engineKey: string;
  status: 'draft' | 'published' | 'archived';
  configJson: PollConfig | null;
  durationEstimateSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Messages des refus de l'API des jeux, en vouvoiement. */
export function gameErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'GAME_IN_USE':
      return 'Ce sondage est programmé ou en cours dans une séance : son contenu ne peut plus être modifié (le titre, si).';
    case 'SLUG_TAKEN':
      return 'Cet identifiant est déjà utilisé par un quiz ou un jeu.';
    case 'POLL_CONFIG_INVALID':
    case 'VALIDATION_ERROR':
      return 'Le sondage est incomplet ou invalide. Vérifiez les questions et les options.';
    case 'GAME_INVALID_TRANSITION':
      return 'Ce sondage est déjà publié.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}

export const GAME_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-yellow-100 text-yellow-800' },
  published: { label: 'Publié', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archivé', className: 'bg-gray-100 text-gray-600' },
};
