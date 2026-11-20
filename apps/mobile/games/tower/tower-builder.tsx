'use client';

import { useEffect, useRef } from 'react';
import {
  TOWER_BASE_WIDTH,
  TOWER_BOOKS,
  formatTowerHeight,
  towerBookAt,
  towerHeight,
  towerRoundX,
  towerSettle,
  towerSlideX,
  towerStress,
  type TowerBook,
} from '@quiz-app/validation';
import {
  GRAVITY,
  SLIDER_GAP_CM,
  bookBottoms,
  landingImpulse,
  restingLean,
  stackTop,
  startTipping,
  stepDebris,
  stepSway,
  stepTipping,
  tippedCenter,
  type Debris,
  type Sway,
  type Tipping,
} from './sim';

/** Largeur de monde visible (cm). */
const VIEW_WIDTH_CM = 86;
/** Hauteur du sol sous le socle (px). */
const GROUND_PX = 70;
/** Délai avant l'apparition du livre suivant (ms). */
const RESPAWN_MS = 320;
const BASE_THICKNESS = 4;

export interface TowerLocalState {
  books: TowerBook[];
  drops: number;
  heightCm: number;
  stress: number;
}

interface TowerBuilderProps {
  seed: number;
  /** Tour du serveur (fait foi quand rien n'est en route). */
  books: TowerBook[];
  drops: number;
  bestHeightCm: number;
  disabled: boolean;
  /** Lâcher : à envoyer au serveur. `false` : se recaler sur la vue du serveur. */
  onDrop: (index: number, x: number) => Promise<boolean>;
  /** Tour prédite localement (HUD). */
  onLocalChange: (s: TowerLocalState) => void;
}

interface Falling {
  book: TowerBook;
  y: number;
  vy: number;
}

interface Sim {
  books: TowerBook[];
  drops: number;
  /** Instant d'apparition du livre qui glisse (performance.now), null s'il n'y en a pas. */
  spawnAt: number | null;
  falling: Falling | null;
  tipping: Tipping | null;
  debris: Debris[];
  sway: Sway;
  camY: number;
  shake: number;
  inflight: number;
  /** Échec d'un lâcher : se recaler sur la vue du serveur dès que possible. */
  needsResync: boolean;
  /** Squash du dernier livre posé (0..1). */
  squash: number;
}

function sameBooks(a: readonly TowerBook[], b: readonly TowerBook[]): boolean {
  return a.length === b.length && a.every((x, i) => x.k === b[i]!.k && x.x === b[i]!.x);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Dessine un livre centré sur l'origine du contexte (déjà translaté et tourné). */
function drawBook(ctx: CanvasRenderingContext2D, book: TowerBook, s: number, alpha = 1) {
  const spec = TOWER_BOOKS[book.k];
  const w = spec.width * s;
  const h = spec.thickness * s;
  ctx.globalAlpha = alpha;
  roundRect(ctx, -w / 2, -h / 2, w, h, Math.max(2, h * 0.16));
  ctx.fillStyle = spec.color;
  ctx.fill();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fill();
  // Bandes de reliure aux deux bouts.
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  const band = Math.max(2, w * 0.045);
  ctx.fillRect(-w / 2 + band, -h / 2, band * 0.6, h);
  ctx.fillRect(w / 2 - band * 1.6, -h / 2, band * 0.6, h);
  if (h >= 9) {
    ctx.fillStyle = spec.ink;
    ctx.font = `900 ${Math.min(h * 0.6, w * 0.11)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.spine, 0, h * 0.04);
  }
  ctx.globalAlpha = 1;
}

/**
 * La tour du joueur sur un canvas, à 60 i/s : un livre glisse au-dessus de la tour, un tap le
 * lâche. L'équilibre est prédit avec `towerSettle` (même règle que le serveur) pour animer sans
 * attendre ; la vue du serveur fait foi dès que plus rien n'est en route.
 */
export default function TowerBuilder({
  seed,
  books,
  drops,
  bestHeightCm,
  disabled,
  onDrop,
  onLocalChange,
}: TowerBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Sim>({
    books: [...books],
    drops,
    spawnAt: null,
    falling: null,
    tipping: null,
    debris: [],
    sway: { angle: 0, omega: 0 },
    camY: 0,
    shake: 0,
    inflight: 0,
    needsResync: false,
    squash: 0,
  });
  const propsRef = useRef({ seed, books, drops, bestHeightCm, disabled, onDrop, onLocalChange });
  propsRef.current = { seed, books, drops, bestHeightCm, disabled, onDrop, onLocalChange };

  function publish() {
    const sim = simRef.current;
    propsRef.current.onLocalChange({
      books: sim.books,
      drops: sim.drops,
      heightCm: towerHeight(sim.books),
      stress: towerStress(sim.books),
    });
  }

  /**
   * La vue du serveur fait foi quand rien n'est en route ni en train de tomber : après un refus,
   * ou si elle diffère de la prédiction (une vue en retard, moins avancée, est ignorée).
   */
  function maybeResync() {
    const sim = simRef.current;
    if (sim.inflight > 0 || sim.falling) return;
    const cur = propsRef.current;
    const differs = cur.drops !== sim.drops || !sameBooks(sim.books, cur.books);
    if (sim.needsResync || (differs && cur.drops >= sim.drops)) {
      sim.books = [...cur.books];
      sim.drops = cur.drops;
      sim.needsResync = false;
      sim.spawnAt = null;
      publish();
    }
  }

  useEffect(() => {
    maybeResync();
  }, [books, drops]);

  useEffect(() => {
    publish();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let dpr = 1;

    function resize() {
      if (!canvas) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function land(now: number) {
      const sim = simRef.current;
      const f = sim.falling!;
      sim.falling = null;
      const settled = towerSettle([...sim.books, f.book]);
      if (settled.fallen.length === 0) {
        sim.books = settled.books;
        sim.sway.omega += landingImpulse(settled.books);
        sim.squash = 1;
        try {
          navigator.vibrate?.(10);
        } catch {
          // Pas de vibreur.
        }
      } else {
        sim.books = settled.books;
        sim.tipping = startTipping(settled.books, settled.fallen, settled.side === -1 ? -1 : 1);
        sim.shake = Math.min(1, 0.35 + settled.fallen.length * 0.12);
        try {
          navigator.vibrate?.(settled.fallen.length > 2 ? [40, 30, 90] : 30);
        } catch {
          // Pas de vibreur.
        }
      }
      sim.spawnAt = now + RESPAWN_MS;
      publish();
      maybeResync();
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const sim = simRef.current;
      const p = propsRef.current;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!canvas || !ctx) return;

      // ─── Simulation ───
      if (sim.spawnAt === null && !sim.falling) sim.spawnAt = now;
      const top = stackTop(sim.books);
      if (sim.falling) {
        sim.falling.vy -= GRAVITY * dt;
        sim.falling.y += sim.falling.vy * dt;
        if (sim.falling.y <= top) land(now);
      }
      if (sim.tipping) {
        const released = stepTipping(sim.tipping, dt);
        if (released) {
          sim.debris.push(...released);
          sim.tipping = null;
        }
      }
      for (const d of sim.debris) stepDebris(d, dt);
      sim.debris = sim.debris.filter((d) => d.cy > sim.camY - 120);
      stepSway(sim.sway, dt, top);
      sim.shake = Math.max(0, sim.shake - dt * 1.8);
      sim.squash = Math.max(0, sim.squash - dt * 5);

      // ─── Caméra ───
      const W = canvas.width;
      const H = canvas.height;
      const s = W / VIEW_WIDTH_CM;
      const groundPx = GROUND_PX * dpr;
      // Le haut de la tour reste vers 55 % de l'écran ; le livre qui glisse au-dessus.
      const wantedCam = Math.max(0, top + SLIDER_GAP_CM - (H * 0.62 - groundPx) / s);
      sim.camY += (wantedCam - sim.camY) * Math.min(1, dt * 3.5);
      const shakeX = sim.shake > 0 ? Math.sin(now / 22) * sim.shake * 6 * dpr : 0;
      const toX = (x: number) => W / 2 + x * s + shakeX;
      const toY = (y: number) => H - groundPx - (y - sim.camY) * s;

      // ─── Dessin ───
      ctx.clearRect(0, 0, W, H);

      // Repères de hauteur (tous les 25 cm).
      ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const firstMark = Math.ceil(sim.camY / 25) * 25;
      for (let m = Math.max(25, firstMark); toY(m) > 0; m += 25) {
        const y = toY(m);
        ctx.fillStyle = m % 100 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y, W, 1 * dpr);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(formatTowerHeight(m), 6 * dpr, y - 2 * dpr);
      }
      // Record personnel.
      if (p.bestHeightCm > 0 && p.bestHeightCm > top + 0.5) {
        const y = toY(p.bestHeightCm);
        ctx.strokeStyle = 'rgba(251,191,36,0.75)';
        ctx.setLineDash([8 * dpr, 6 * dpr]);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,191,36,0.9)';
        ctx.textAlign = 'right';
        ctx.fillText(`Record ${formatTowerHeight(p.bestHeightCm)}`, W - 6 * dpr, y - 3 * dpr);
        ctx.textAlign = 'left';
      }

      // Sol et socle.
      const groundY = toY(-BASE_THICKNESS);
      ctx.fillStyle = '#1c1310';
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, groundY, W, 2 * dpr);
      const baseG = ctx.createLinearGradient(0, toY(0), 0, groundY);
      baseG.addColorStop(0, '#ca8a04');
      baseG.addColorStop(1, '#713f12');
      ctx.fillStyle = baseG;
      roundRect(
        ctx,
        toX(-TOWER_BASE_WIDTH / 2),
        toY(0),
        TOWER_BASE_WIDTH * s,
        BASE_THICKNESS * s,
        3 * dpr,
      );
      ctx.fill();

      // Tour : inclinaison de repos + oscillation, répartie selon la hauteur.
      const lean = restingLean(sim.books) + sim.sway.angle * 0.06;
      const idle =
        sim.books.length > 0
          ? Math.sin(now / 420) * Math.pow(towerStress(sim.books), 2) * 0.012
          : 0;
      const tilt = lean + idle;
      const bottoms = bookBottoms(sim.books);
      sim.books.forEach((b, i) => {
        const spec = TOWER_BOOKS[b.k];
        const mid = bottoms[i]! + spec.thickness / 2;
        const isTop = i === sim.books.length - 1;
        const sq = isTop ? sim.squash : 0;
        ctx.save();
        ctx.translate(toX(b.x + tilt * mid), toY(mid - (sq * spec.thickness) / 6));
        ctx.rotate(tilt);
        ctx.scale(1 + sq * 0.06, 1 - sq * 0.16);
        drawBook(ctx, b, s);
        ctx.restore();
      });

      // Pile qui bascule.
      if (sim.tipping) {
        const t = sim.tipping;
        t.books.forEach((b, i) => {
          const c = tippedCenter(t, i);
          ctx.save();
          ctx.translate(toX(c.cx), toY(c.cy));
          ctx.rotate(t.angle);
          drawBook(ctx, b, s);
          ctx.restore();
        });
      }
      // Livres en chute libre.
      for (const d of sim.debris) {
        ctx.save();
        ctx.translate(toX(d.cx), toY(d.cy));
        ctx.rotate(d.angle);
        drawBook(ctx, d.book, s, 0.95);
        ctx.restore();
      }

      // Livre qui tombe ou qui glisse.
      if (sim.falling) {
        const spec = TOWER_BOOKS[sim.falling.book.k];
        ctx.save();
        ctx.translate(toX(sim.falling.book.x), toY(sim.falling.y + spec.thickness / 2));
        drawBook(ctx, sim.falling.book, s);
        ctx.restore();
      } else if (!p.disabled && sim.spawnAt !== null && now >= sim.spawnAt) {
        const kind = towerBookAt(p.seed, sim.drops);
        const spec = TOWER_BOOKS[kind];
        const x = towerSlideX(p.seed, sim.drops, sim.books.length, now - sim.spawnAt);
        const y = top + SLIDER_GAP_CM;
        // Guides : où tomberont les deux bords du livre.
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 5 * dpr]);
        ctx.beginPath();
        for (const edge of [x - spec.width / 2, x + spec.width / 2]) {
          ctx.moveTo(toX(edge), toY(y));
          ctx.lineTo(toX(edge), toY(top));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const appear = Math.min(1, (now - sim.spawnAt) / 160);
        ctx.save();
        ctx.translate(toX(x), toY(y + spec.thickness / 2) - (1 - appear) * 30 * dpr);
        drawBook(ctx, { k: kind, x }, s, appear);
        ctx.restore();
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  function handleTap() {
    const sim = simRef.current;
    const p = propsRef.current;
    const now = performance.now();
    if (p.disabled || sim.falling || sim.spawnAt === null || now < sim.spawnAt) return;
    const index = sim.drops;
    const x = towerRoundX(towerSlideX(p.seed, index, sim.books.length, now - sim.spawnAt));
    sim.falling = {
      book: { k: towerBookAt(p.seed, index), x },
      y: stackTop(sim.books) + SLIDER_GAP_CM,
      vy: 0,
    };
    sim.drops += 1;
    sim.spawnAt = null;
    sim.inflight += 1;
    void p.onDrop(index, x).then((ok) => {
      sim.inflight -= 1;
      if (!ok) sim.needsResync = true;
      maybeResync();
    });
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={(e) => {
        e.preventDefault();
        handleTap();
      }}
      className="block h-full w-full touch-none select-none"
      aria-label="Tour de livres : touche l’écran pour lâcher le livre"
    />
  );
}
