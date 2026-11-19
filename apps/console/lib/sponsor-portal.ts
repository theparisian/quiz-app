/**
 * Portail sponsor (C4) : aides sans rendu (période, courbe des participants par jour).
 */

export interface DayPoint {
  day: string;
  sessions: number;
  participants: number;
}

export interface ChartGeometry {
  /** Valeur du haut de l'axe (arrondie). */
  yMax: number;
  /** Graduations de l'axe des participants (0 compris). */
  ticks: number[];
  points: { x: number; y: number; point: DayPoint }[];
}

/** Haut d'axe « rond » (1, 2, 5 × 10^n) au-dessus de `max`. */
export function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * pow >= max) return step * pow;
  }
  return 10 * pow;
}

/** Positions des points de la courbe dans un cadre `width` × `height` (origine en haut à gauche). */
export function chartGeometry(days: DayPoint[], width: number, height: number): ChartGeometry {
  const max = days.reduce((m, d) => Math.max(m, d.participants), 0);
  const yMax = niceCeil(max);
  const ticks = [0, yMax / 2, yMax];
  const step = days.length > 1 ? width / (days.length - 1) : 0;
  const points = days.map((point, i) => ({
    x: days.length > 1 ? i * step : width / 2,
    y: height - (point.participants / yMax) * height,
    point,
  }));
  return { yMax, ticks, points };
}

/** Requête de période (`from`, `to` : jours de Paris, bornes incluses) ; vide = toute la campagne. */
export function periodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
