import type { CSSProperties } from 'react';
import { TOWER_BASE_WIDTH, TOWER_BOOKS, type TowerBook } from '@quiz-app/validation';

/**
 * Visuels (provisoires) de la tour de livres, partagés par le mobile et l'écran cinéma : chaque
 * livre est un aplat de couleur avec son titre sur la tranche, dessiné à l'échelle (cm → px).
 * Remplaçables plus tard par des images sans toucher au moteur.
 */

export interface BookTowerProps {
  /** Livres du bas vers le haut. */
  books: readonly TowerBook[];
  /** Échelle (px par cm). */
  scale: number;
  /** Dessine le socle (étagère) sous la tour. */
  base?: boolean;
  /** Inclinaison de la tour (radians, + vers la droite), répartie selon la hauteur. */
  lean?: number;
  /** Les livres tombent un à un à l'apparition. */
  dropIn?: boolean;
  /** Largeur du cadre (cm) : la tour est centrée dedans. Par défaut, la largeur du socle + marges. */
  frameWidthCm?: number;
  className?: string;
  style?: CSSProperties;
}

/** Épaisseur du socle (cm). */
export const TOWER_BASE_THICKNESS_CM = 4;

/** Le livre, en aplat (sans position). */
export function BookFace({
  book,
  scale,
  style,
}: {
  book: Pick<TowerBook, 'k'>;
  scale: number;
  style?: CSSProperties;
}) {
  const spec = TOWER_BOOKS[book.k];
  const w = spec.width * scale;
  const h = spec.thickness * scale;
  const font = Math.max(6, Math.min(h * 0.62, w * 0.12));
  return (
    <div
      style={{
        width: w,
        height: h,
        background: `linear-gradient(180deg, rgba(255,255,255,.18), transparent 35%, rgba(0,0,0,.22)), ${spec.color}`,
        borderRadius: Math.max(1, h * 0.14),
        boxShadow: `inset ${Math.max(2, w * 0.04)}px 0 0 rgba(0,0,0,.18), inset -${Math.max(2, w * 0.04)}px 0 0 rgba(0,0,0,.18), 0 1px 0 rgba(0,0,0,.35)`,
        color: spec.ink,
        fontSize: font,
        fontWeight: 900,
        letterSpacing: '0.12em',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {h >= 7 ? spec.spine : null}
    </div>
  );
}

/** Hauteur d'une pile (cm). */
function stackHeightCm(books: readonly TowerBook[]): number {
  return books.reduce((s, b) => s + TOWER_BOOKS[b.k].thickness, 0);
}

/**
 * Tour de livres posée sur son socle, alignée en bas. Les livres sont placés à leur vraie
 * position (x en cm depuis le centre du socle).
 */
export function BookTower({
  books,
  scale,
  base = true,
  lean = 0,
  dropIn = false,
  frameWidthCm = TOWER_BASE_WIDTH + 30,
  className,
  style,
}: BookTowerProps) {
  const heightCm = stackHeightCm(books);
  const baseCm = base ? TOWER_BASE_THICKNESS_CM : 0;
  const width = frameWidthCm * scale;
  const height = (heightCm + baseCm) * scale + 2;
  let y = 0;
  return (
    <div
      className={className}
      style={{ position: 'relative', width, height, ...style }}
      aria-hidden
    >
      {base && (
        <div
          style={{
            position: 'absolute',
            left: width / 2 - (TOWER_BASE_WIDTH / 2) * scale,
            bottom: 0,
            width: TOWER_BASE_WIDTH * scale,
            height: baseCm * scale,
            borderRadius: 3,
            background: 'linear-gradient(180deg, #a16207, #713f12)',
            boxShadow: '0 6px 14px rgba(0,0,0,.45)',
          }}
        />
      )}
      {books.map((b, i) => {
        const spec = TOWER_BOOKS[b.k];
        const bottomCm = y;
        y += spec.thickness;
        const mid = bottomCm + spec.thickness / 2;
        const dx = lean * mid;
        return (
          <BookFace
            key={i}
            book={b}
            scale={scale}
            style={{
              position: 'absolute',
              left: width / 2 + (b.x + dx - spec.width / 2) * scale,
              bottom: (baseCm + bottomCm) * scale,
              transform: lean ? `rotate(${lean}rad)` : undefined,
              transition: 'left 300ms ease-out, transform 300ms ease-out',
              animation: dropIn
                ? `tower-book-drop 480ms cubic-bezier(.3,1.4,.5,1) ${i * 90}ms both`
                : undefined,
              zIndex: i + 1,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Keyframes de `dropIn` et des chutes, à inclure une fois dans la page (balise <style>). Une
 * chute (`tower-fall-right` / `-left`) lit `--fall-dx` (écart horizontal) et `--fall-dy` (chute).
 */
export const TOWER_KEYFRAMES_CSS = `
@keyframes tower-book-drop {
  0% { transform: translateY(-90px); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes tower-fall-right {
  0% { transform: rotate(0deg); opacity: 1; }
  35% { transform: translate(calc(var(--fall-dx, 120px) * 0.15), 0) rotate(30deg); opacity: 1; }
  100% { transform: translate(var(--fall-dx, 120px), var(--fall-dy, 400px)) rotate(120deg); opacity: 0; }
}
@keyframes tower-fall-left {
  0% { transform: rotate(0deg); opacity: 1; }
  35% { transform: translate(calc(var(--fall-dx, 120px) * -0.15), 0) rotate(-30deg); opacity: 1; }
  100% { transform: translate(calc(var(--fall-dx, 120px) * -1), var(--fall-dy, 400px)) rotate(-120deg); opacity: 0; }
}
@keyframes tower-sway {
  0%, 100% { transform: rotate(-1.2deg); }
  50% { transform: rotate(1.2deg); }
}`;
