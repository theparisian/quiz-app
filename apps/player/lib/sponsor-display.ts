import type { NucDisplay } from '@/lib/stores/nuc-store';

/** Durée du carton d'ouverture d'une manche sponsorisée (C4). */
export const OPENING_CARD_MS = 3000;

/**
 * Le carton d'ouverture (« <jeu> — présenté par <sponsor> ») recouvre seulement ce que l'écran
 * garde pendant le départ de la manche (lobby ou classement de la manche précédente, compte à
 * rebours du quiz) : dès que le jeu s'affiche (première question), il disparaît pour ne rien
 * cacher. Un moteur sans compte à rebours (sondage) n'a donc pas de carton, seulement le badge.
 */
export function isOpeningCardVisible(params: {
  display: NucDisplay;
  isPaused: boolean;
  withinWindow: boolean;
  hasSponsor: boolean;
}): boolean {
  if (!params.hasSponsor || !params.withinWindow || params.isPaused) return false;
  return params.display === 'lobby' || params.display === 'round_end';
}

/** Couleur de liseré acceptée : `#RRGGBB` uniquement (sinon liseré neutre). */
export function borderColorOf(brandColorPrimary: string | null): string | null {
  return brandColorPrimary && /^#[0-9a-fA-F]{6}$/.test(brandColorPrimary)
    ? brandColorPrimary
    : null;
}
