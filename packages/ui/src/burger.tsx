import type { CSSProperties } from 'react';

/**
 * Visuels du mini-jeu burger, partagés par le mobile et l'écran cinéma. Les images sont servies
 * par chaque app sous `/games/burger/` (PNG/WebP transparents, rognés).
 *
 * Un étage est un « lot » d'une à trois pièces (2 tomates, 3 cornichons…) : chaque pièce a sa
 * position et sa largeur relatives à la largeur du burger, ce qui permet de les animer
 * séparément (léger décalage quand on déplace l'étage).
 */

export const BURGER_ASSET_BASE = '/games/burger';

export interface BurgerPiece {
  src: string;
  /** Rapport hauteur / largeur de l'image. */
  aspect: number;
  /** Largeur, en fraction de la largeur du burger. */
  w: number;
  /** Centre horizontal, décalage depuis le milieu (fraction de la largeur du burger). */
  x: number;
  /** Décalage vertical du centre (fraction de la largeur du burger, + vers le bas). */
  y: number;
  /** Rotation de repos (degrés). */
  rot: number;
}

export interface BurgerLayerVisual {
  pieces: BurgerPiece[];
  /** Épaisseur de l'étage dans un burger monté (fraction de la largeur du burger). */
  thick: number;
}

const img = (name: string) => `${BURGER_ASSET_BASE}/${name}.webp`;

export const BURGER_LAYER_VISUALS: Record<string, BurgerLayerVisual> = {
  bun_bottom: {
    thick: 0.2,
    pieces: [{ src: img('bun-bottom'), aspect: 0.402, w: 0.9, x: 0, y: 0, rot: 0 }],
  },
  sauce: {
    thick: 0.045,
    pieces: [{ src: img('sauce'), aspect: 0.218, w: 0.86, x: 0, y: 0, rot: 0 }],
  },
  lettuce: {
    thick: 0.09,
    pieces: [{ src: img('lettuce'), aspect: 0.42, w: 1.02, x: 0, y: 0, rot: 0 }],
  },
  tomato: {
    thick: 0.08,
    pieces: [
      { src: img('tomato-1'), aspect: 0.656, w: 0.5, x: -0.21, y: 0, rot: -4 },
      { src: img('tomato-2'), aspect: 0.678, w: 0.5, x: 0.21, y: 0.01, rot: 5 },
    ],
  },
  patty_cheese: {
    thick: 0.2,
    pieces: [{ src: img('patty-cheese'), aspect: 0.514, w: 0.92, x: 0, y: 0, rot: 0 }],
  },
  onion: {
    thick: 0.06,
    pieces: [
      { src: img('onion-1'), aspect: 0.597, w: 0.42, x: -0.2, y: 0, rot: 6 },
      { src: img('onion-2'), aspect: 0.614, w: 0.42, x: 0.22, y: -0.01, rot: -5 },
    ],
  },
  pickles: {
    thick: 0.06,
    pieces: [
      { src: img('pickles-1'), aspect: 0.65, w: 0.3, x: -0.29, y: 0.01, rot: -8 },
      { src: img('pickles-2'), aspect: 0.589, w: 0.3, x: 0.01, y: -0.01, rot: 4 },
      { src: img('pickles-3'), aspect: 0.672, w: 0.3, x: 0.3, y: 0.01, rot: 10 },
    ],
  },
  bun_top: {
    thick: 0.3,
    pieces: [{ src: img('bun-top'), aspect: 0.521, w: 0.94, x: 0, y: 0, rot: 0 }],
  },
};

/** Toutes les images du burger (préchargement). */
export const BURGER_ASSET_URLS: string[] = Object.values(BURGER_LAYER_VISUALS).flatMap((l) =>
  l.pieces.map((p) => p.src),
);

export interface BurgerStackProps {
  /** Étages du bas vers le haut. */
  layers: readonly string[];
  /** Largeur du burger (px). */
  width: number;
  /**
   * Écart supplémentaire entre étages (fraction de la largeur) : 0 = burger monté, > 0 =
   * burger « éclaté ». Animé si `animated`.
   */
  spread?: number;
  /** Les étages tombent un à un à l'apparition (révélation de la recette). */
  dropIn?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Burger monté (ou éclaté), sans interaction : les étages sont empilés selon leur épaisseur, le
 * plus haut dessiné par-dessus. Hauteur calculée, alignée en bas.
 */
export function BurgerStack({
  layers,
  width,
  spread = 0,
  dropIn = false,
  className,
  style,
}: BurgerStackProps) {
  const visuals = layers
    .map((id) => BURGER_LAYER_VISUALS[id])
    .filter((v): v is BurgerLayerVisual => !!v);
  // Bas de chaque étage (fraction de la largeur, depuis le bas).
  const bases: number[] = [];
  let acc = 0;
  for (const v of visuals) {
    bases.push(acc);
    acc += v.thick + spread;
  }
  const top = visuals.at(-1);
  // Marge haute : la moitié de l'image du dernier étage dépasse son épaisseur.
  const overflow = top ? Math.max(...top.pieces.map((p) => p.w * p.aspect)) / 2 : 0;
  const height = (acc + overflow + 0.05) * width;

  return (
    <div
      className={className}
      style={{ position: 'relative', width, height, ...style }}
      aria-hidden
    >
      {visuals.map((v, i) => {
        const centerFromBottom = (bases[i]! + v.thick / 2 + 0.03) * width;
        return v.pieces.map((p, j) => {
          const w = p.w * width;
          const h = w * p.aspect;
          return (
            <img
              key={`${layers[i]}-${j}`}
              src={p.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                width: w,
                height: h,
                left: width / 2 + p.x * width - w / 2,
                bottom: centerFromBottom - h / 2 - p.y * width,
                transform: `rotate(${p.rot}deg)`,
                ['--rot' as string]: `${p.rot}deg`,
                zIndex: i + 1,
                transition: 'bottom 450ms cubic-bezier(.2,1.4,.4,1)',
                animation: dropIn
                  ? `burger-drop 520ms cubic-bezier(.2,1.3,.4,1) ${i * 160 + j * 40}ms both`
                  : undefined,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          );
        });
      })}
    </div>
  );
}

/** Keyframes de `dropIn`, à inclure une fois dans la page (balise <style>). */
export const BURGER_KEYFRAMES_CSS = `
@keyframes burger-drop {
  0% { transform: translateY(-120px) rotate(var(--rot, 0deg)) scale(1.05); opacity: 0; }
  60% { opacity: 1; }
  100% { transform: translateY(0) rotate(var(--rot, 0deg)) scale(1); opacity: 1; }
}`;
