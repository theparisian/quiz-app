import type { GameAudienceValue, GameKindValue } from '@quiz-app/validation';
import type { GameRow } from './poll-api';

/** Jeu renvoyé par `/api/games` avec les champs du catalogue (C1). */
export interface CatalogGameRow extends GameRow {
  description: string | null;
  kind: GameKindValue;
  quizId: string | null;
  coverImageUrl: string | null;
  tagline: string | null;
  rulesText: string | null;
  catalogEnabled: boolean;
  audience: GameAudienceValue;
  minPlayers: number | null;
  tags: string[];
  sponsorId: string | null;
  sponsor: { id: string; name: string; logoUrl: string | null } | null;
  cinemas: { id: string; slug: string; name: string }[];
}

export interface CatalogGameListResponse {
  items: CatalogGameRow[];
  total: number;
  page: number;
  limit: number;
}

export const ENGINE_LABEL: Record<string, string> = {
  quiz: 'Quiz',
  poll: 'Sondage',
  burger: 'Burger',
};

export const KIND_LABEL: Record<GameKindValue, string> = {
  internal: 'Interne',
  sponsored: 'Sponsorisé',
};

export const AUDIENCE_LABEL: Record<GameAudienceValue, string> = {
  all_cinemas: 'Tous les cinémas',
  selected_cinemas: 'Cinémas choisis',
};

/** Page d'édition du contenu d'un jeu : éditeur de quiz, de sondage ou de burger. */
export function contentEditorHref(game: Pick<CatalogGameRow, 'engineKey' | 'slug'>): string | null {
  if (game.engineKey === 'quiz') return `/quizzes/${encodeURIComponent(game.slug)}/edit`;
  if (game.engineKey === 'poll') return `/games/${encodeURIComponent(game.slug)}/edit-poll`;
  if (game.engineKey === 'burger') return `/games/${encodeURIComponent(game.slug)}/edit-burger`;
  return null;
}

/** Messages des refus de l'API du catalogue, en vouvoiement. */
export function catalogErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'SPONSOR_REQUIRED':
      return 'Un jeu sponsorisé doit avoir un sponsor.';
    case 'SPONSOR_NOT_FOUND':
      return 'Ce sponsor n’existe plus.';
    case 'CINEMA_NOT_FOUND':
      return 'Un des cinémas choisis n’existe plus.';
    case 'GAME_MANAGED_BY_QUIZ':
      return 'Ce champ est géré par l’éditeur de quiz.';
    case 'VALIDATION_ERROR':
      return 'Certains champs sont invalides. Vérifiez le formulaire.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}
