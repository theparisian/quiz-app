/**
 * Mise en scène de la course sur l'écran cinéma (logique pure, testable) : les plus avancés au
 * premier plan, en grand ; les suivants de plus en plus loin, petits et assombris.
 */

export interface DepthRow {
  /** Nombre de places dans la rangée. */
  count: number;
  /** Échelle des burgers de la rangée. */
  scale: number;
  /** Bas de la rangée, en % de la hauteur de la scène. */
  bottom: number;
  /** Largeur occupée par la rangée, en % de la largeur de la scène. */
  spread: number;
  /** Luminosité (1 = normale). */
  brightness: number;
  blurPx: number;
}

/** Du premier plan vers le fond. 4 + 5 + 7 + 8 = 24 places (`BURGER_SCREEN_RACERS`). */
export const DEPTH_ROWS: DepthRow[] = [
  { count: 4, scale: 1, bottom: 1, spread: 78, brightness: 1, blurPx: 0 },
  { count: 5, scale: 0.64, bottom: 40, spread: 70, brightness: 0.8, blurPx: 0 },
  { count: 7, scale: 0.45, bottom: 62, spread: 76, brightness: 0.62, blurPx: 0.6 },
  { count: 8, scale: 0.32, bottom: 77, spread: 72, brightness: 0.48, blurPx: 1.2 },
];

export interface Slot {
  /** Centre horizontal (% de la largeur). */
  left: number;
  bottom: number;
  scale: number;
  brightness: number;
  blurPx: number;
  /** Plus grand = devant. */
  zIndex: number;
}

/** Place du concurrent de rang `index` (0 = le plus avancé), ou null au-delà des rangées. */
export function slotFor(index: number): Slot | null {
  let start = 0;
  for (let r = 0; r < DEPTH_ROWS.length; r++) {
    const row = DEPTH_ROWS[r]!;
    if (index < start + row.count) {
      const i = index - start;
      // Le meilleur de la rangée au centre, puis alternativement à gauche et à droite.
      const centered = centerOut(i, row.count);
      const step = row.count > 1 ? row.spread / (row.count - 1) : 0;
      const left = 50 - row.spread / 2 + centered * step;
      return {
        left: row.count > 1 ? left : 50,
        bottom: row.bottom,
        scale: row.scale,
        brightness: row.brightness,
        blurPx: row.blurPx,
        zIndex: (DEPTH_ROWS.length - r) * 100 - i,
      };
    }
    start += row.count;
  }
  return null;
}

/** Position (0..count-1, de gauche à droite) du i-ème meilleur : centre, puis en éventail. */
export function centerOut(i: number, count: number): number {
  const mid = (count - 1) / 2;
  const offset = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
  const pos = Math.round(mid + offset);
  return Math.max(0, Math.min(count - 1, pos));
}

/**
 * Ordre d'affichage des étages posés d'un concurrent pendant la course. Les pains restent en bas
 * et en haut ; les étages du milieu sont dans un ordre décoratif FIXE, qui n'est pas la recette :
 * la salle voit le burger grandir sans pouvoir lire la solution sur le grand écran.
 */
export const DISPLAY_ORDER = [
  'bun_bottom',
  'lettuce',
  'onion',
  'patty_cheese',
  'pickles',
  'tomato',
  'sauce',
  'bun_top',
] as const;

export function displayLayers(placed: readonly string[]): string[] {
  const set = new Set(placed);
  return DISPLAY_ORDER.filter((id) => set.has(id));
}
