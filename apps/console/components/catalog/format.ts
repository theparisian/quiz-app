import { formatEuroCents, type CatalogGame, type CatalogRevenue } from '@quiz-app/validation';

/** Durée retenue pour un jeu sans durée estimée (secondes). */
export const FALLBACK_GAME_SECONDS = 5 * 60;

/** Durée estimée d'un jeu (secondes) : celle du catalogue, sinon une valeur par défaut. */
export function estimateGameSeconds(game: Pick<CatalogGame, 'durationEstimateSeconds'>): number {
  return game.durationEstimateSeconds ?? FALLBACK_GAME_SECONDS;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${minutes} min`;
}

export const ENGINE_LABEL: Record<string, string> = {
  quiz: 'Quiz',
  poll: 'Sondage',
  burger: 'Burger',
};

/** « Vous rapporte 4,00 € par séance » / « … par participant » (campagne active, C3). */
export function revenueLabel(revenue: CatalogRevenue): string {
  const unit = revenue.pricing === 'per_participant' ? 'par participant' : 'par séance';
  return `Vous rapporte ${formatEuroCents(revenue.cinemaAmountCents)} ${unit}`;
}
