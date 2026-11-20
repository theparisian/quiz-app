/**
 * Logique pure du constructeur de burger (testable hors navigateur).
 *
 * Deux sens : l'ordre du jeu (`order`) va du bas vers le haut (index 0 = pain du bas) ; l'écran
 * l'affiche de haut en bas (rangée 0 = étage du haut). `row = n - 1 - index`.
 */

/** Ordre d'affichage (haut en premier) depuis l'ordre du jeu (bas en premier). */
export function toRows<T>(order: readonly T[]): T[] {
  return [...order].reverse();
}

/** Ordre du jeu depuis l'ordre d'affichage. */
export function fromRows<T>(rows: readonly T[]): T[] {
  return [...rows].reverse();
}

/** Déplace l'élément d'index `from` à l'index `to` (les autres glissent d'un cran). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/**
 * Rangée visée pendant un glissement : celle sous le centre de l'étage déplacé, bornée.
 * `offsetY` : déplacement du doigt depuis le début du geste (px).
 */
export function targetRow(fromRow: number, offsetY: number, rowHeight: number, rows: number) {
  if (rowHeight <= 0) return fromRow;
  const raw = fromRow + Math.round(offsetY / rowHeight);
  return Math.max(0, Math.min(rows - 1, raw));
}

/**
 * Rangée affichée de chaque étage pendant un glissement : l'étage déplacé occupe `overRow`, les
 * autres se décalent pour lui faire de la place.
 */
export function previewRows<T>(rows: readonly T[], dragged: T | null, overRow: number): T[] {
  if (dragged === null) return [...rows];
  const from = rows.indexOf(dragged);
  if (from < 0) return [...rows];
  return moveItem(rows, from, overRow);
}

/** Les ordres sont identiques. */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Largeur du burger à l'écran selon la place disponible (px). */
export function burgerWidth(containerWidth: number, rowHeight: number): number {
  return Math.max(120, Math.min(containerWidth * 0.8, rowHeight * 3.1, 380));
}
