'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { BURGER_LAYER_VISUALS, type BurgerPiece } from '@quiz-app/ui';
import { burgerWidth, fromRows, previewRows, targetRow, toRows } from './layout';

interface BurgerBuilderProps {
  /** Étages du bas vers le haut. */
  order: readonly string[];
  /** Plus de glissement possible (burger terminé, course close). */
  disabled?: boolean;
  /** Un étage a été déposé à une nouvelle place : le nouvel ordre (bas vers le haut). */
  onCommit: (order: string[]) => void;
}

/** Retour des pièces à leur place : léger dépassement (effet ressort). */
const SETTLE_TRANSITION = 'transform 300ms cubic-bezier(.25,1.4,.45,1)';
/** Décalage entre les pièces d'un même lot (tomates, cornichons…) quand l'étage se déplace. */
const PIECE_STAGGER_MS = 35;
/** Raideur du suivi du doigt, par pièce : la première colle au doigt, les suivantes traînent. */
const PIECE_FOLLOW = [0.42, 0.3, 0.22];
/** Le burger suit un peu le doigt à l'horizontale (fraction du déplacement). */
const HORIZONTAL_FOLLOW = 0.3;
const DRAG_SCALE = 1.1;

interface Spring {
  x: number;
  y: number;
}

interface Gesture {
  id: string;
  pointerId: number;
  fromRow: number;
  overRow: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  springs: Spring[];
  frame: number;
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Pas de vibreur : rien à faire.
  }
}

/**
 * Le burger à remettre dans l'ordre : chaque étage se saisit sur toute la largeur de sa rangée
 * et se glisse vers le haut ou le bas ; les autres s'écartent avec un effet ressort, et les
 * pièces d'un même étage (2 tomates, 3 cornichons…) suivent le doigt avec un léger décalage.
 *
 * Pendant le geste, le rendu React ne bouge que lorsque l'étage change de rangée ; le suivi du
 * doigt est écrit directement dans le DOM à chaque image (fluidité sur les téléphones modestes).
 */
export default function BurgerBuilder({ order, disabled = false, onCommit }: BurgerBuilderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pieceEls = useRef(new Map<string, HTMLImageElement>());
  const gesture = useRef<Gesture | null>(null);
  const released = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ id: string; overRow: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = toRows(order);
  const n = rows.length;
  const rowH = n > 0 ? size.h / n : 0;
  const bw = burgerWidth(size.w, rowH);
  const shown = previewRows(rows, drag?.id ?? null, drag?.overRow ?? 0);

  // Géométrie lue par la boucle d'animation (toujours la dernière).
  const geo = useRef({ w: 0, rowH: 0, bw: 0 });
  geo.current = { w: size.w, rowH, bw };

  /** Position de repos d'une pièce dans une rangée (coin haut gauche, px). */
  const restPosition = useCallback((p: BurgerPiece, row: number) => {
    const { w, rowH: rh, bw: b } = geo.current;
    const pw = p.w * b;
    const ph = pw * p.aspect;
    return {
      x: w / 2 + p.x * b - pw / 2,
      y: row * rh + rh / 2 + p.y * b - ph / 2,
    };
  }, []);

  const restTransform = useCallback(
    (p: BurgerPiece, row: number) => {
      const { x, y } = restPosition(p, row);
      return `translate3d(${x}px, ${y}px, 0) rotate(${p.rot}deg)`;
    },
    [restPosition],
  );

  // Étage relâché : retour en douceur à sa rangée (même si React n'a rien à réécrire).
  useLayoutEffect(() => {
    const id = released.current;
    if (!id) return;
    released.current = null;
    const row = rows.indexOf(id);
    BURGER_LAYER_VISUALS[id]?.pieces.forEach((p, j) => {
      const el = pieceEls.current.get(`${id}:${j}`);
      if (!el) return;
      el.style.transition = `${SETTLE_TRANSITION} ${j * PIECE_STAGGER_MS}ms, filter 200ms`;
      el.style.transform = restTransform(p, row);
      el.style.filter = '';
    });
  });

  const tick = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    const pieces = BURGER_LAYER_VISUALS[g.id]?.pieces ?? [];
    pieces.forEach((p, j) => {
      const el = pieceEls.current.get(`${g.id}:${j}`);
      const s = g.springs[j];
      if (!el || !s) return;
      const k = PIECE_FOLLOW[j] ?? 0.2;
      const tx = g.dx * HORIZONTAL_FOLLOW;
      const vx = (tx - s.x) * k;
      const vy = (g.dy - s.y) * k;
      s.x += vx;
      s.y += vy;
      const tilt = Math.max(-18, Math.min(18, vx * 0.9 + vy * (j % 2 === 0 ? 0.25 : -0.25)));
      const base = restPosition(p, g.fromRow);
      el.style.transform = `translate3d(${base.x + s.x}px, ${base.y + s.y}px, 0) rotate(${
        p.rot + tilt
      }deg) scale(${DRAG_SCALE})`;
    });
    g.frame = requestAnimationFrame(tick);
  }, [restPosition]);

  useEffect(() => () => cancelAnimationFrame(gesture.current?.frame ?? 0), []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, id: string) {
    if (disabled || gesture.current || e.button > 0) return;
    const fromRow = rows.indexOf(id);
    if (fromRow < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pieces = BURGER_LAYER_VISUALS[id]?.pieces ?? [];
    pieces.forEach((_, j) => {
      const el = pieceEls.current.get(`${id}:${j}`);
      if (!el) return;
      el.style.transition = 'filter 150ms';
      el.style.filter = 'drop-shadow(0 14px 18px rgba(0,0,0,.55))';
    });
    gesture.current = {
      id,
      pointerId: e.pointerId,
      fromRow,
      overRow: fromRow,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      springs: pieces.map(() => ({ x: 0, y: 0 })),
      frame: 0,
    };
    gesture.current.frame = requestAnimationFrame(tick);
    setDrag({ id, overRow: fromRow });
    vibrate(8);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    g.dx = e.clientX - g.startX;
    g.dy = e.clientY - g.startY;
    const over = targetRow(g.fromRow, g.dy, geo.current.rowH, n);
    if (over !== g.overRow) {
      g.overRow = over;
      setDrag({ id: g.id, overRow: over });
      vibrate(5);
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    cancelAnimationFrame(g.frame);
    gesture.current = null;
    released.current = g.id;
    setDrag(null);
    if (g.overRow !== g.fromRow) {
      onCommit(fromRows(previewRows(rows, g.id, g.overRow)));
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none"
      style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {size.h > 0 &&
        rows.map((id) => {
          const row = shown.indexOf(id);
          const dragging = drag?.id === id;
          return BURGER_LAYER_VISUALS[id]?.pieces.map((p, j) => {
            const pw = p.w * bw;
            return (
              <img
                key={`${id}:${j}`}
                ref={(el) => {
                  if (el) pieceEls.current.set(`${id}:${j}`, el);
                  else pieceEls.current.delete(`${id}:${j}`);
                }}
                src={p.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 will-change-transform"
                style={{
                  width: pw,
                  height: pw * p.aspect,
                  // Étage saisi : sa rangée de départ (le suivi du doigt est écrit à part).
                  transform: restTransform(p, dragging ? rows.indexOf(id) : row),
                  transition: `${SETTLE_TRANSITION} ${j * PIECE_STAGGER_MS}ms, filter 200ms`,
                  zIndex: dragging ? 100 : n - row + 1,
                }}
              />
            );
          });
        })}

      {/* Zones de saisie : une par rangée, toute la largeur. */}
      {size.h > 0 &&
        rows.map((id) => {
          const row = drag?.id === id ? rows.indexOf(id) : shown.indexOf(id);
          return (
            <div
              key={`hit-${id}`}
              role="button"
              aria-label={`Déplacer l’étage ${row + 1}`}
              onPointerDown={(e) => onPointerDown(e, id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              className={`absolute left-0 right-0 top-0 flex items-center justify-end pr-1 ${
                disabled ? '' : 'cursor-grab active:cursor-grabbing'
              }`}
              style={{
                height: rowH,
                transform: `translateY(${row * rowH}px)`,
                transition: 'transform 300ms cubic-bezier(.25,1.4,.45,1)',
                zIndex: 200,
              }}
            >
              {!disabled && (
                <span className="text-xl leading-none text-white/25" aria-hidden>
                  ⋮⋮
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
}
