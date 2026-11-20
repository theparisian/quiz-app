import type { BurgerConfig } from '@quiz-app/validation';
import type { GameRow } from './poll-api';

/** Jeu burger renvoyé par `/api/games`. */
export type BurgerGameRow = Omit<GameRow, 'configJson'> & { configJson: BurgerConfig | null };

/** Messages des refus de l'API des jeux pour le burger, en vouvoiement. */
export function burgerErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'GAME_IN_USE':
      return 'Ce jeu est programmé ou en cours dans une séance : ses réglages ne peuvent plus être modifiés (le titre, si).';
    case 'SLUG_TAKEN':
      return 'Cet identifiant est déjà utilisé par un quiz ou un jeu.';
    case 'BURGER_CONFIG_INVALID':
    case 'VALIDATION_ERROR':
      return 'Les réglages sont invalides. Vérifiez les durées et les points.';
    case 'GAME_INVALID_TRANSITION':
      return 'Ce jeu est déjà publié.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}
