'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  TOWER_BASE_WIDTH,
  TOWER_BOOKS,
  TOWER_CUES,
  formatTowerHeight,
  towerCollapsedCueSchema,
  type TowerBook,
  type TowerRacer,
  type TowerScreenView,
} from '@quiz-app/validation';
import {
  BookFace,
  BookTower,
  TOWER_BASE_THICKNESS_CM,
  TOWER_KEYFRAMES_CSS,
  useCountdown,
} from '@quiz-app/ui';
import PlayerAvatar from '@/components/shared/player-avatar';
import { subscribeGameCues } from '@/lib/game-cues';
import type { GameRendererProps } from '../types';
import { COLUMN_WIDTH_CM, columnFor, stageScale } from './scene';

const SCENE_CSS = `
${TOWER_KEYFRAMES_CSS}
@keyframes tower-flash {
  0% { transform: translateX(40px); opacity: 0; }
  12% { transform: translateX(0); opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translateX(0); opacity: 0; }
}
@keyframes tower-float {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50% { transform: translateY(-12px) rotate(1deg); }
}`;

function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** Tour de démonstration du compte à rebours. */
const DEMO_TOWER: TowerBook[] = [
  { k: 'atlas', x: 0 },
  { k: 'dictionnaire', x: -2 },
  { k: 'roman', x: 3 },
  { k: 'bd', x: -1 },
  { k: 'polar', x: 4 },
  { k: 'manga', x: 1 },
  { k: 'cuisine', x: -3 },
  { k: 'poche', x: 0 },
];

/** Barre de temps (60 i/s), figée en pause. */
function BuildTimer({ view, clockOffsetMs }: { view: TowerScreenView; clockOffsetMs: number }) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs, {
    mode: 'frame',
  });
  if (remainingMs === null) return null;
  const pct = Math.max(0, Math.min(100, (remainingMs / view.durationMs) * 100));
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const color = seconds <= 5 ? '#ef4444' : seconds <= 10 ? '#f59e0b' : '#fbbf24';
  return (
    <div className="flex w-[34vw] items-center gap-4">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-20 text-right text-4xl font-black tabular-nums">{seconds}</span>
    </div>
  );
}

interface FallingGroup {
  key: number;
  books: TowerBook[];
  bottomCm: number;
  side: -1 | 1;
}

function commonPrefix(a: readonly TowerBook[], b: readonly TowerBook[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i]!.k === b[i]!.k && a[i]!.x === b[i]!.x) i++;
  return i;
}

/**
 * Une tour dans la scène. Quand des livres disparaissent du haut (effondrement), ils sont
 * redessinés un instant en train de basculer du côté où ils penchaient.
 */
function TowerColumn({
  racer,
  scale,
  leader,
}: {
  racer: TowerRacer;
  scale: number;
  leader: boolean;
}) {
  const prev = useRef<readonly TowerBook[]>(racer.books);
  const [falling, setFalling] = useState<FallingGroup[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = racer.books;
    const keep = commonPrefix(before, racer.books);
    if (before.length <= keep) return;
    const fallen = before.slice(keep);
    const support = before[keep - 1];
    const com =
      fallen.reduce((s, b) => s + b.x * TOWER_BOOKS[b.k].width, 0) /
      fallen.reduce((s, b) => s + TOWER_BOOKS[b.k].width, 0);
    const key = Date.now() + Math.random();
    const bottomCm = before.slice(0, keep).reduce((s, b) => s + TOWER_BOOKS[b.k].thickness, 0);
    setFalling((cur) => [
      ...cur.slice(-2),
      { key, books: fallen, bottomCm, side: com >= (support?.x ?? 0) ? 1 : -1 },
    ]);
    const t = setTimeout(() => setFalling((cur) => cur.filter((g) => g.key !== key)), 1400);
    return () => clearTimeout(t);
  }, [racer.books]);

  const width = COLUMN_WIDTH_CM * scale;
  const baseCm = TOWER_BASE_THICKNESS_CM;
  const place = (b: TowerBook, bottomCm: number) => ({
    position: 'absolute' as const,
    left: width / 2 + (b.x - TOWER_BOOKS[b.k].width / 2) * scale,
    bottom: (baseCm + bottomCm) * scale,
  });

  let y = 0;
  return (
    <div className="relative h-full" style={{ width }}>
      {/* Socle */}
      <div
        className="absolute rounded"
        style={{
          left: width / 2 - (TOWER_BASE_WIDTH / 2) * scale,
          bottom: 0,
          width: TOWER_BASE_WIDTH * scale,
          height: baseCm * scale,
          background: leader
            ? 'linear-gradient(180deg, #fde047, #ca8a04)'
            : 'linear-gradient(180deg, #a16207, #713f12)',
          boxShadow: leader ? '0 0 30px rgba(250,204,21,.6)' : '0 6px 14px rgba(0,0,0,.45)',
        }}
      />
      {racer.books.map((b, i) => {
        const bottom = y;
        y += TOWER_BOOKS[b.k].thickness;
        return (
          <BookFace
            key={`${i}-${b.k}-${b.x}`}
            book={b}
            scale={scale}
            style={{
              ...place(b, bottom),
              zIndex: i + 1,
              animation:
                i === racer.books.length - 1
                  ? 'tower-book-drop 380ms cubic-bezier(.3,1.4,.5,1) both'
                  : undefined,
            }}
          />
        );
      })}
      {falling.map((g) => {
        let fy = g.bottomCm;
        return g.books.map((b, i) => {
          const bottom = fy;
          fy += TOWER_BOOKS[b.k].thickness;
          return (
            <BookFace
              key={`${g.key}-${i}`}
              book={b}
              scale={scale}
              style={{
                ...place(b, bottom),
                zIndex: 500,
                ['--fall-dx' as string]: `${(TOWER_BOOKS[b.k].width + 10 + i * 4) * scale}px`,
                ['--fall-dy' as string]: `${(baseCm + bottom) * scale + 160}px`,
                transformOrigin: g.side > 0 ? '0% 100%' : '100% 100%',
                animation: `${g.side > 0 ? 'tower-fall-right' : 'tower-fall-left'} 1300ms cubic-bezier(.5,0,.8,.6) ${i * 30}ms both`,
              }}
            />
          );
        });
      })}
    </div>
  );
}

/** « 💥 Léa : 6 livres à terre ! » à chaque effondrement (cue), quelques secondes. */
function CollapseFlashes() {
  const [flashes, setFlashes] = useState<
    { key: number; pseudo: string; fallen: number; heightCm: number }[]
  >([]);
  const dismiss = useCallback((key: number) => {
    setFlashes((cur) => cur.filter((f) => f.key !== key));
  }, []);

  useEffect(
    () =>
      subscribeGameCues((cue) => {
        if (cue.cue !== TOWER_CUES.collapsed) return;
        const parsed = towerCollapsedCueSchema.safeParse(cue.data);
        if (!parsed.success) return;
        const key = Date.now() + Math.random();
        setFlashes((cur) => [...cur.slice(-3), { key, ...parsed.data }]);
        setTimeout(() => dismiss(key), 3000);
      }),
    [dismiss],
  );

  return (
    <div className="pointer-events-none absolute right-10 top-32 z-[1000] flex flex-col items-end gap-3">
      {flashes.map((f) => (
        <div
          key={f.key}
          className="rounded-2xl bg-red-500 px-6 py-3 text-2xl font-black text-white shadow-2xl"
          style={{ animation: 'tower-flash 3000ms ease-out both' }}
        >
          💥 {f.pseudo} : {f.fallen} livres à terre !
        </div>
      ))}
    </div>
  );
}

function Backdrop() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(251,191,36,.18), transparent 70%), linear-gradient(180deg, #0b1020 0%, #1e1b2e 60%, #2a1a12 100%)',
      }}
    >
      {/* Étagères en arrière-plan */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,.9) 0 3px, transparent 3px 160px), repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 14px, transparent 14px 22px, rgba(255,255,255,.3) 22px 30px, transparent 30px 52px)',
        }}
      />
    </div>
  );
}

/** Taille d'un élément (px), suivie au redimensionnement. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1600, height: 700 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Les tours alignées, la plus haute au centre ; l'échelle suit la plus haute. */
function TowerStage({ view }: { view: Extract<TowerScreenView, { racers: unknown }> }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const racers = view.racers;
  // Hauteur réservée sous les tours : pseudo et hauteur.
  const labelPx = 110;
  const scale = stageScale(racers.length, view.topHeight, size.width, size.height - labelPx);
  const leaderHeight = racers[0]?.heightCm ?? 0;

  return (
    <div ref={ref} className="absolute inset-x-10 bottom-6 top-[17%]">
      {racers.map((racer) => {
        const col = columnFor(racer.rank - 1, racers.length);
        const leader = racer.rank === 1 && leaderHeight > 0;
        return (
          <div
            key={racer.playerId}
            className="absolute bottom-0 flex flex-col items-center"
            style={{
              left: `${((col + 0.5) / racers.length) * 100}%`,
              transform: 'translateX(-50%)',
              top: 0,
              transition: 'left 900ms cubic-bezier(.3,1.2,.4,1)',
            }}
          >
            <div className="relative min-h-0 flex-1">
              <TowerColumn racer={racer} scale={scale} leader={leader} />
            </div>
            <div
              className={`mt-2 flex max-w-[14vw] items-center gap-2 rounded-full px-4 py-1.5 text-2xl font-bold shadow-lg ${
                leader ? 'bg-amber-400 text-gray-950' : 'bg-white/90 text-gray-900'
              }`}
            >
              {leader && <span>👑</span>}
              {racer.avatarUrl && (
                <PlayerAvatar avatarUrl={racer.avatarUrl} pseudo={racer.pseudo} size={30} />
              )}
              <span className="truncate">{racer.pseudo}</span>
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-white drop-shadow">
              {formatTowerHeight(racer.heightCm)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Rendu écran cinéma de la tour de livres : ne dépend que de la vue.
 * - Départ : consignes et une tour qui oscille.
 * - Construction : les tours des premiers, la plus haute au centre ; les effondrements se voient.
 * - Résultats : podium des trois plus hautes tours et classement.
 */
export default function TowerScreenGame({
  round,
  view,
  clockOffsetMs,
}: GameRendererProps<TowerScreenView>) {
  const countdownMs = useCountdown(
    view.phase === 'countdown' ? view.endsAt : null,
    view.phase === 'countdown' ? view.pausedRemainingMs : null,
    clockOffsetMs,
  );

  if (view.phase === 'countdown') {
    const sec = countdownMs !== null ? Math.ceil(Math.max(0, countdownMs) / 1000) : null;
    return (
      <div className="relative flex h-full overflow-hidden text-white">
        <style>{SCENE_CSS}</style>
        <Backdrop />
        <div className="relative z-10 grid h-full w-full grid-cols-2 items-center gap-10 px-24">
          <div className="flex flex-col gap-8">
            <p className="text-2xl font-semibold uppercase tracking-[0.3em] text-amber-400">
              {round.game.title}
            </p>
            <h1 className="text-[clamp(48px,5vw,96px)] font-black leading-[1.05]">
              Construisez la plus haute tour de livres !
            </h1>
            <p className="text-[clamp(22px,1.8vw,34px)] text-white/75">
              Sur votre téléphone, touchez l’écran pour lâcher chaque livre. Visez bien : une tour
              mal équilibrée s’écroule. La plus haute à la fin gagne.
            </p>
            <div className="text-[clamp(90px,10vw,180px)] font-black tabular-nums leading-none text-amber-400">
              {sec !== null && sec > 0 ? sec : 'Go !'}
            </div>
          </div>
          <div className="flex justify-center">
            <div
              style={{
                animation: 'tower-sway 2.6s ease-in-out infinite',
                transformOrigin: '50% 100%',
              }}
            >
              <BookTower books={DEMO_TOWER} scale={9} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view.phase === 'build') {
    const hidden = Math.max(0, view.totalPlayers - view.racers.length);
    return (
      <div className="relative h-full overflow-hidden text-white">
        <style>{SCENE_CSS}</style>
        <Backdrop />
        <header className="relative z-[900] flex items-center justify-between px-14 pt-8">
          <div>
            <p className="text-xl font-semibold uppercase tracking-[0.3em] text-amber-400">
              {round.game.title}
            </p>
            <p className="mt-1 text-3xl font-bold">
              Plus haute tour : {formatTowerHeight(view.topHeight)}
            </p>
            {hidden > 0 && (
              <p className="mt-1 text-xl text-white/60">
                + {hidden} autre{hidden > 1 ? 's' : ''} en construction
              </p>
            )}
          </div>
          <BuildTimer view={view} clockOffsetMs={clockOffsetMs} />
        </header>
        <TowerStage view={view} />
        <CollapseFlashes />
      </div>
    );
  }

  // Résultats et fin
  const podium = view.racers.slice(0, 3).filter((r) => r.heightCm > 0);
  const ranking = view.racers.slice(0, 8);
  const podiumScale = Math.min(6, 520 / Math.max(50, podium[0]?.heightCm ?? 0));
  // Ordre du podium à l'écran : 2e, 1er, 3e.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter((r): r is TowerRacer => !!r);
  return (
    <div className="relative h-full overflow-hidden text-white">
      <style>{SCENE_CSS}</style>
      <Backdrop />
      <div className="relative z-10 grid h-full grid-cols-[1.1fr_1fr] items-center gap-12 px-20">
        <div className="flex h-full items-end justify-center gap-6 pb-16">
          {podiumOrder.length === 0 && (
            <p className="self-center text-3xl text-white/60">Aucune tour debout…</p>
          )}
          {podiumOrder.map((r) => (
            <div key={r.playerId} className="flex flex-col items-center gap-3">
              <span className="text-4xl font-black text-amber-400">{ordinal(r.rank)}</span>
              <BookTower books={r.books} scale={podiumScale} dropIn frameWidthCm={56} />
              <span className="max-w-[12vw] truncate text-2xl font-bold">{r.pseudo}</span>
              <span className="text-2xl font-black tabular-nums">
                {formatTowerHeight(r.heightCm)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="mb-2 text-5xl font-black">Les plus hautes tours</h2>
          {ranking.length === 0 && <p className="text-2xl text-white/60">Aucun participant.</p>}
          {ranking.map((r, i) => (
            <div
              key={r.playerId}
              className={`animate-fade-in-up flex items-center gap-5 rounded-2xl px-6 py-3 opacity-0 ${
                i === 0 ? 'bg-amber-400 text-gray-950' : 'bg-white/10'
              }`}
              style={{ animationDelay: `${600 + i * 120}ms` }}
            >
              <span className="w-14 text-3xl font-black">{ordinal(r.rank)}</span>
              {r.avatarUrl && <PlayerAvatar avatarUrl={r.avatarUrl} pseudo={r.pseudo} size={44} />}
              <span className="min-w-0 flex-1 truncate text-3xl font-bold">{r.pseudo}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {formatTowerHeight(r.heightCm)}
              </span>
              {r.points !== null && (
                <span className="w-28 text-right text-2xl font-black tabular-nums">
                  +{r.points}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
