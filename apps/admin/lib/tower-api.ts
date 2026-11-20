import type { TowerConfig } from '@quiz-app/validation';
import type { GameRow } from './poll-api';

/** Jeu tour de livres renvoyé par `/api/games`. */
export type TowerGameRow = Omit<GameRow, 'configJson'> & { configJson: TowerConfig | null };

/** Messages des refus de l'API des jeux pour la tour de livres, en vouvoiement. */
export function towerErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'GAME_IN_USE':
      return 'Ce jeu est programmé ou en cours dans une séance : ses réglages ne peuvent plus être modifiés (le titre, si).';
    case 'SLUG_TAKEN':
      return 'Cet identifiant est déjà utilisé par un quiz ou un jeu.';
    case 'TOWER_CONFIG_INVALID':
    case 'VALIDATION_ERROR':
      return 'Les réglages sont invalides. Vérifiez les durées et les points.';
    case 'GAME_INVALID_TRANSITION':
      return 'Ce jeu est déjà publié.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}
