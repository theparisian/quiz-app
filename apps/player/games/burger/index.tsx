'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BURGER_CUES,
  BURGER_LAYER_IDS,
  burgerPlayerFinishedCueSchema,
  formatBurgerTime,
  type BurgerRacer,
  type BurgerScreenView,
} from '@quiz-app/validation';
import { BURGER_KEYFRAMES_CSS, BurgerStack, useCountdown } from '@quiz-app/ui';
import PlayerAvatar from '@/components/shared/player-avatar';
import { subscribeGameCues } from '@/lib/game-cues';
import type { GameRendererProps } from '../types';
import { slotFor } from './scene';

/** Largeur d'un burger au premier plan (px, avant l'échelle de profondeur). */
const CARD_BURGER_PX = 230;

const SCENE_CSS = `
${BURGER_KEYFRAMES_CSS}
@keyframes burger-float {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50% { transform: translateY(-14px) rotate(1.5deg); }
}
@keyframes burger-flash {
  0% { transform: translateX(40px); opacity: 0; }
  12% { transform: translateX(0); opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translateX(0); opacity: 0; }
}
@keyframes burger-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}`;

function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** Barre de temps de la course (60 i/s), figée en pause. */
function RaceTimer({ view, clockOffsetMs }: { view: BurgerScreenView; clockOffsetMs: number }) {
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

/** Un concurrent dans la scène : son burger (étages posés), son pseudo, sa progression. */
function RacerCard({ racer, total }: { racer: BurgerRacer; total: number }) {
  const slot = slotFor(racer.rank - 1);
  if (!slot) return null;
  const done = racer.finishMs !== null;
  const layers = racer.placedLayers;
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${slot.left}%`,
        bottom: `${slot.bottom}%`,
        width: CARD_BURGER_PX + 40,
        transform: `translateX(-50%) scale(${slot.scale})`,
        transformOrigin: '50% 100%',
        zIndex: slot.zIndex,
        filter: `brightness(${slot.brightness})${slot.blurPx ? ` blur(${slot.blurPx}px)` : ''}`,
        transition:
          'left 900ms cubic-bezier(.3,1.2,.4,1), bottom 900ms cubic-bezier(.3,1.2,.4,1), transform 900ms cubic-bezier(.3,1.2,.4,1), filter 900ms',
      }}
    >
      <div className="relative flex h-[210px] w-full items-end justify-center">
        {layers.length > 0 ? (
          <BurgerStack layers={layers} width={CARD_BURGER_PX} />
        ) : (
          <span className="mb-6 text-6xl opacity-30">🍽️</span>
        )}
        {done && (
          <span className="absolute -top-2 right-2 z-20 rounded-full bg-amber-400 px-3 py-1 text-xl font-black text-gray-950 shadow-lg">
            {ordinal(racer.rank)}
          </span>
        )}
      </div>
      {/* Assiette */}
      <div className="-mt-3 h-5 w-[86%] rounded-[50%] bg-black/50 blur-[3px]" />
      <div
        className={`mt-2 flex max-w-full items-center gap-2 rounded-full px-4 py-1.5 text-2xl font-bold shadow-lg ${
          done ? 'bg-amber-400 text-gray-950' : 'bg-white/90 text-gray-900'
        }`}
      >
        {racer.avatarUrl && (
          <PlayerAvatar avatarUrl={racer.avatarUrl} pseudo={racer.pseudo} size={30} />
        )}
        <span className="truncate">{racer.pseudo}</span>
      </div>
      <div
        key={racer.correctCount}
        className="mt-1.5 text-2xl font-black tabular-nums text-white drop-shadow"
        style={{ animation: 'burger-pop 400ms ease-out' }}
      >
        {done ? `✓ ${formatBurgerTime(racer.finishMs!)}` : `${racer.correctCount} / ${total}`}
      </div>
    </div>
  );
}

interface FinishFlash {
  key: number;
  pseudo: string;
  rank: number;
  finishMs: number;
}

/** « Léa termine 2e — 12,4 s » à chaque burger terminé (cue), quelques secondes. */
function FinishFlashes() {
  const [flashes, setFlashes] = useState<FinishFlash[]>([]);
  const dismiss = useCallback((key: number) => {
    setFlashes((cur) => cur.filter((f) => f.key !== key));
  }, []);

  useEffect(
    () =>
      subscribeGameCues((cue) => {
        if (cue.cue !== BURGER_CUES.playerFinished) return;
        const parsed = burgerPlayerFinishedCueSchema.safeParse(cue.data);
        if (!parsed.success) return;
        const key = Date.now() + Math.random();
        setFlashes((cur) => [...cur.slice(-4), { key, ...parsed.data }]);
        setTimeout(() => dismiss(key), 3200);
      }),
    [dismiss],
  );

  return (
    <div className="pointer-events-none absolute right-10 top-28 z-[1000] flex flex-col items-end gap-3">
      {flashes.map((f) => (
        <div
          key={f.key}
          className="rounded-2xl bg-amber-400 px-6 py-3 text-2xl font-black text-gray-950 shadow-2xl"
          style={{ animation: 'burger-flash 3200ms ease-out both' }}
        >
          🍔 {f.pseudo} termine {ordinal(f.rank)} · {formatBurgerTime(f.finishMs)}
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
          'radial-gradient(ellipse 80% 55% at 50% 100%, rgba(251,146,60,.28), transparent 70%), linear-gradient(180deg, #120807 0%, #2a0f0a 55%, #3b1509 100%)',
      }}
    >
      {/* Sol en perspective */}
      <div
        className="absolute inset-x-0 bottom-0 h-[62%] opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 2px, transparent 2px 120px), repeating-linear-gradient(0deg, rgba(255,255,255,.1) 0 2px, transparent 2px 90px)',
          transform: 'perspective(600px) rotateX(58deg)',
          transformOrigin: '50% 100%',
          maskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
        }}
      />
    </div>
  );
}

/**
 * Rendu écran cinéma du burger : ne dépend que de la vue.
 * - Départ : consignes et burger éclaté qui flotte (ordre alphabétique, pas la recette).
 * - Course : scène en profondeur, les plus avancés devant ; chaque burger se monte avec les
 *   étages bien placés, à leur vraie place.
 * - Résultats : le bon burger se monte étage par étage, à côté du classement.
 */
export default function BurgerScreenGame({
  round,
  view,
  clockOffsetMs,
}: GameRendererProps<BurgerScreenView>) {
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
              Remettez le burger dans l’ordre !
            </h1>
            <p className="text-[clamp(22px,1.8vw,34px)] text-white/75">
              Sur votre téléphone, faites glisser les étages du pain du bas jusqu’au pain du haut.
              Le plus rapide gagne.
            </p>
            <div className="text-[clamp(90px,10vw,180px)] font-black tabular-nums leading-none text-amber-400">
              {sec !== null && sec > 0 ? sec : 'Go !'}
            </div>
          </div>
          <div
            className="flex justify-center"
            style={{ animation: 'burger-float 3s ease-in-out infinite' }}
          >
            <BurgerStack layers={BURGER_LAYER_IDS} width={420} spread={0.09} />
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
              {view.finishedCount} / {view.totalPlayers} burgers terminés
            </p>
            {hidden > 0 && (
              <p className="mt-1 text-xl text-white/60">
                + {hidden} autre{hidden > 1 ? 's' : ''} en cuisine
              </p>
            )}
          </div>
          <RaceTimer view={view} clockOffsetMs={clockOffsetMs} />
        </header>
        <div className="absolute inset-x-0 bottom-0 top-[16%]">
          {view.racers.map((racer) => (
            <RacerCard key={racer.playerId} racer={racer} total={view.totalLayers} />
          ))}
        </div>
        <FinishFlashes />
      </div>
    );
  }

  // Résultats et fin
  const podium = view.racers.slice(0, 8);
  return (
    <div className="relative h-full overflow-hidden text-white">
      <style>{SCENE_CSS}</style>
      <Backdrop />
      <div className="relative z-10 grid h-full grid-cols-[1fr_1.1fr] items-center gap-12 px-20">
        <div className="flex flex-col items-center gap-6">
          <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-amber-400">
            Le bon burger
          </p>
          <BurgerStack layers={view.recipe} width={440} dropIn />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="mb-2 text-5xl font-black">Les plus rapides</h2>
          {podium.length === 0 && <p className="text-2xl text-white/60">Aucun participant.</p>}
          {podium.map((r, i) => (
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
                {r.finishMs !== null
                  ? formatBurgerTime(r.finishMs)
                  : `${r.correctCount} / ${view.totalLayers}`}
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
