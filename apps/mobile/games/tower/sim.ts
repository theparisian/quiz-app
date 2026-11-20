import {
  TOWER_BASE_WIDTH,
  TOWER_BOOKS,
  towerInterfaces,
  type TowerBook,
} from '@quiz-app/validation';

/**
 * Animation de la tour sur le téléphone (sans DOM, testable) : chute du livre lâché, oscillation
 * de la tour, basculement puis chute libre des livres qui tombent. La règle d'équilibre elle-même
 * est `towerSettle` (partagée avec le serveur) : ce fichier ne fait que la mettre en mouvement.
 *
 * Repère : centimètres, x vers la droite (0 = milieu du socle), y vers le haut (0 = dessus du
 * socle). Les angles sont en radians, positifs dans le sens horaire (vers la droite).
 */

/** Gravité de jeu (cm/s²) : plus forte que la vraie, pour un lâcher nerveux. */
export const GRAVITY = 2400;
/** Hauteur du livre qui glisse au-dessus de la tour (cm). */
export const SLIDER_GAP_CM = 16;

/** Bas de chaque livre (cm). */
export function bookBottoms(books: readonly TowerBook[]): number[] {
  const out: number[] = [];
  let y = 0;
  for (const b of books) {
    out.push(y);
    y += TOWER_BOOKS[b.k].thickness;
  }
  return out;
}

export function stackTop(books: readonly TowerBook[]): number {
  let y = 0;
  for (const b of books) y += TOWER_BOOKS[b.k].thickness;
  return y;
}

/** Un livre en chute libre (après basculement). */
export interface Debris {
  book: TowerBook;
  /** Centre du livre. */
  cx: number;
  cy: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
}

/** Une pile qui bascule d'un bloc autour du bord de son support. */
export interface Tipping {
  books: TowerBook[];
  /** Bas de chaque livre au moment de la chute (cm). */
  bottoms: number[];
  pivotX: number;
  pivotY: number;
  side: -1 | 1;
  angle: number;
  omega: number;
}

/** Début d'un basculement : `fallen` reposait sur `kept` (le socle si `kept` est vide). */
export function startTipping(
  kept: readonly TowerBook[],
  fallen: readonly TowerBook[],
  side: -1 | 1,
): Tipping {
  const support = kept.at(-1);
  const supportX = support ? support.x : 0;
  const supportHalf = (support ? TOWER_BOOKS[support.k].width : TOWER_BASE_WIDTH) / 2;
  const y0 = stackTop(kept);
  const bottoms = bookBottoms(fallen).map((b) => b + y0);
  return {
    books: [...fallen],
    bottoms,
    pivotX: supportX + side * supportHalf,
    pivotY: y0,
    side,
    angle: 0,
    // Une petite poussée initiale : un livre lâché très loin part tout de suite.
    omega: side * 0.8,
  };
}

/** Angle au-delà duquel la pile se disloque en livres libres. */
export const TIP_RELEASE_ANGLE = 0.55;

/**
 * Avance un basculement de `dt` secondes. Renvoie les débris quand la pile se disloque (et
 * null tant qu'elle pivote encore).
 */
export function stepTipping(t: Tipping, dt: number): Debris[] | null {
  // Couple croissant avec l'angle : ça démarre doucement, puis ça part.
  const alpha = t.side * (7 + 26 * Math.abs(t.angle));
  t.omega += alpha * dt;
  t.angle += t.omega * dt;
  if (Math.abs(t.angle) < TIP_RELEASE_ANGLE) return null;
  return t.books.map((book, i) => {
    const spec = TOWER_BOOKS[book.k];
    const p = tippedCenter(t, i);
    // Vitesse d'un point du solide en rotation : ω × r (r depuis le pivot).
    const rx = p.cx - t.pivotX;
    const ry = p.cy - t.pivotY;
    const spread = 0.75 + ((i * 37) % 10) / 20;
    return {
      book,
      cx: p.cx,
      cy: p.cy,
      angle: t.angle,
      vx: t.omega * ry * spread + t.side * 15,
      vy: -t.omega * rx * spread,
      omega: t.omega * (0.6 + ((i * 53) % 10) / 12) + (spec.width > 30 ? 0 : t.side * 1.5),
    };
  });
}

/** Centre du livre i d'une pile qui bascule (rotation autour du pivot, sens horaire). */
export function tippedCenter(t: Tipping, i: number): { cx: number; cy: number } {
  const book = t.books[i]!;
  const spec = TOWER_BOOKS[book.k];
  const x = book.x - t.pivotX;
  const y = t.bottoms[i]! + spec.thickness / 2 - t.pivotY;
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  return { cx: t.pivotX + x * c + y * s, cy: t.pivotY - x * s + y * c };
}

export function stepDebris(d: Debris, dt: number): void {
  d.vy -= GRAVITY * dt;
  d.cx += d.vx * dt;
  d.cy += d.vy * dt;
  d.angle += d.omega * dt;
}

/** Oscillation de la tour (ressort amorti), en radians. */
export interface Sway {
  angle: number;
  omega: number;
}

/** Avance l'oscillation ; plus la tour est haute, plus elle oscille lentement. */
export function stepSway(s: Sway, dt: number, heightCm: number): void {
  const k = 260 / Math.max(1, 1 + heightCm / 60);
  const c = 3.2;
  s.omega += (-k * s.angle - c * s.omega) * dt;
  s.angle += s.omega * dt;
}

/**
 * Impulsion d'oscillation à l'atterrissage d'un livre : proportionnelle à son décalage par
 * rapport au livre du dessous (rapporté à la demi-largeur de celui-ci).
 */
export function landingImpulse(books: readonly TowerBook[]): number {
  const n = books.length;
  if (n === 0) return 0;
  const top = books[n - 1]!;
  const below = books[n - 2];
  const supportX = below ? below.x : 0;
  const supportHalf = (below ? TOWER_BOOKS[below.k].width : TOWER_BASE_WIDTH) / 2;
  const ratio = (top.x - supportX) / supportHalf;
  return Math.max(-1, Math.min(1, ratio)) * 0.9;
}

/**
 * Inclinaison de repos d'une tour (radians) : elle penche du côté où son équilibre est le plus
 * tendu, d'autant plus qu'elle est près de tomber.
 */
export function restingLean(books: readonly TowerBook[]): number {
  const checks = towerInterfaces(books);
  let worst = 0;
  for (const c of checks) if (Math.abs(c.stress) > Math.abs(worst)) worst = c.stress;
  return Math.sign(worst) * Math.pow(Math.min(1, Math.abs(worst)), 3) * 0.035;
}

/** Libellé de stabilité pour la jauge. */
export function stabilityLabel(stress: number): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  if (stress < 0.5) return { label: 'Stable', tone: 'ok' };
  if (stress < 0.8) return { label: 'Ça penche…', tone: 'warn' };
  return { label: 'Ça va tomber !', tone: 'danger' };
}
