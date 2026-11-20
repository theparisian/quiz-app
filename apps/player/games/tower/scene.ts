import { TOWER_BASE_WIDTH } from '@quiz-app/validation';

/**
 * Mise en scène des tours sur l'écran cinéma (sans JSX, testable) : les tours sont alignées
 * sur une étagère, la plus haute au centre, les suivantes alternant à gauche et à droite.
 * L'échelle (px par cm) se règle pour que la plus haute tour tienne dans la hauteur disponible.
 */

/** Largeur d'une colonne (cm) : le socle et un peu de marge pour les livres en porte-à-faux. */
export const COLUMN_WIDTH_CM = TOWER_BASE_WIDTH + 14;

/** Colonne d'un rang (0 = premier) parmi `count` : la plus haute au centre. */
export function columnFor(rankIndex: number, count: number): number {
  const center = Math.floor((count - 1) / 2);
  const step = Math.ceil(rankIndex / 2);
  // 0, +1, -1, +2, -2… (nombre pair : le côté droit a une colonne de plus).
  const offset = rankIndex % 2 === 1 ? step : -step;
  return Math.max(0, Math.min(count - 1, center + offset));
}

/**
 * Échelle (px/cm) : les colonnes tiennent dans la largeur, la plus haute tour (avec une marge
 * de 20 cm pour la voir grandir) tient dans la hauteur, sans dépasser `maxScale`.
 */
export function stageScale(
  count: number,
  topHeightCm: number,
  widthPx: number,
  heightPx: number,
  maxScale = 6,
): number {
  const byWidth = widthPx / (Math.max(1, count) * COLUMN_WIDTH_CM);
  const byHeight = heightPx / (Math.max(50, topHeightCm) + 20);
  return Math.max(0.5, Math.min(maxScale, byWidth, byHeight));
}
