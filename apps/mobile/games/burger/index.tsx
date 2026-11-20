'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BURGER_LAYER_IDS,
  BURGER_REORDER_ACTION,
  burgerReorderResultSchema,
  formatBurgerTime,
  type BurgerMobileView,
} from '@quiz-app/validation';
import {
  AppLogo,
  BURGER_ASSET_URLS,
  BURGER_KEYFRAMES_CSS,
  BurgerStack,
  useCountdown,
} from '@quiz-app/ui';
import type { GameRendererProps } from '../types';
import BurgerBuilder from './burger-builder';
import { sameOrder } from './layout';

/** Libellés des refus d'un déplacement (codes de `game:action`), en tutoiement. */
export function reorderErrorMessage(code: string): string {
  switch (code) {
    case 'PHASE_CLOSED':
    case 'WRONG_ROUND':
    case 'NO_ACTIVE_ROUND':
      return 'Trop tard, la course est terminée !';
    case 'SESSION_PAUSED':
      return 'La partie est en pause.';
    case 'TIMEOUT':
    case 'NOT_CONNECTED':
      return 'Connexion lente : ton dernier déplacement n’est pas passé, réessaie.';
    case 'RATE_LIMITED':
      return 'Doucement ! Réessaie dans un instant.';
    default:
      return 'Ton déplacement n’a pas pu être enregistré, réessaie.';
  }
}

function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** Animations des points de progression (impact quand un étage passe à la bonne place). */
const DOTS_CSS = `
@keyframes burger-dot-hit {
  0% { transform: scale(0.4); }
  30% { transform: scale(2) rotate(-12deg); }
  45% { transform: scale(1.6) rotate(10deg) translateX(-2px); }
  60% { transform: scale(1.5) rotate(-8deg) translateX(2px); }
  75% { transform: scale(1.35) rotate(4deg); }
  100% { transform: scale(1.15) rotate(0); }
}
@keyframes burger-dot-ring {
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(3.2); opacity: 0; }
}
@keyframes burger-label-hit {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.15); }
}`;

/**
 * Points de progression : un par étage, verts quand l'étage est bien placé. Un point qui
 * s'allume « tape » (grossit, tremble, onde verte) pour attirer l'œil pendant la course.
 */
function ProgressDots({ correct, total }: { correct: number; total: number }) {
  const prev = useRef(correct);
  const [hit, setHit] = useState({ from: correct, to: correct, n: 0 });

  useEffect(() => {
    const from = prev.current;
    prev.current = correct;
    if (correct > from) {
      setHit((h) => ({ from, to: correct, n: h.n + 1 }));
      try {
        navigator.vibrate?.(15);
      } catch {
        // Pas de vibreur.
      }
    }
  }, [correct]);

  return (
    <div className="flex flex-col gap-1.5">
      <style>{DOTS_CSS}</style>
      <span
        key={`label-${hit.n}`}
        className={`origin-left text-xs font-bold uppercase tracking-wider ${
          correct > 0 ? 'text-green-400' : 'text-white/50'
        }`}
        style={hit.n > 0 ? { animation: 'burger-label-hit 450ms ease-out' } : undefined}
      >
        Bien placés · {correct}/{total}
      </span>
      <div
        className="flex items-center gap-2"
        aria-label={`${correct} étages sur ${total} bien placés`}
      >
        {Array.from({ length: total }, (_, i) => {
          const on = i < correct;
          const justHit = hit.n > 0 && i >= hit.from && i < hit.to;
          return (
            <span key={justHit ? `${i}-${hit.n}` : i} className="relative flex h-3.5 w-3.5">
              {justHit && (
                <span
                  className="absolute inset-0 rounded-full bg-green-400"
                  style={{ animation: 'burger-dot-ring 600ms ease-out forwards' }}
                />
              )}
              <span
                className={`relative h-3.5 w-3.5 rounded-full transition-colors duration-200 ${
                  on ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,.9)]' : 'bg-white/15'
                }`}
                style={
                  justHit
                    ? { animation: 'burger-dot-hit 650ms cubic-bezier(.3,1.5,.5,1) forwards' }
                    : on
                      ? { transform: 'scale(1.15)' }
                      : undefined
                }
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Rendu mobile du burger : ne dépend que de la vue. Pendant la course, l'ordre affiché est celui
 * du joueur (mis à jour tout de suite à chaque dépôt) ; la vue du serveur fait foi dès qu'aucun
 * déplacement n'est en attente.
 */
export default function BurgerMobileGame({
  round,
  view,
  clockOffsetMs,
  sendAction,
}: GameRendererProps<BurgerMobileView>) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const remainingSec = remainingMs !== null ? Math.ceil(Math.max(0, remainingMs) / 1000) : null;

  const [localOrder, setLocalOrder] = useState<string[]>(view.me.order);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(0);

  // La vue du serveur fait foi quand plus rien n'est en route.
  useEffect(() => {
    if (inflight.current === 0 && !sameOrder(localOrder, view.me.order)) {
      setLocalOrder(view.me.order);
    }
  }, [view]);

  // Préchargement des images pendant le compte à rebours.
  useEffect(() => {
    for (const src of BURGER_ASSET_URLS) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  const finished = view.me.finishMs !== null;
  const canMove = view.phase === 'build' && !finished && !!sendAction;
  const bottomPad = round.game.kind === 'sponsored' && round.game.sponsor ? 72 : 16;

  function handleCommit(order: string[]) {
    if (!canMove || !sendAction) return;
    setLocalOrder(order);
    setError(null);
    inflight.current += 1;
    void sendAction(BURGER_REORDER_ACTION, { order }).then((ack) => {
      inflight.current -= 1;
      if (!ack.ok) {
        setError(reorderErrorMessage(ack.code));
        return;
      }
      const result = burgerReorderResultSchema.safeParse(ack.result);
      if (result.success && result.data.finishMs !== null) {
        try {
          navigator.vibrate?.([30, 40, 60]);
        } catch {
          // Pas de vibreur.
        }
      }
    });
  }

  const shell = (children: ReactNode) => (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-[#2a0f0a] via-[#1a0d0a] to-gray-950"
      style={{
        height: '100dvh',
        overscrollBehavior: 'none',
        paddingBottom: `max(${bottomPad}px, env(safe-area-inset-bottom))`,
      }}
    >
      <style>{BURGER_KEYFRAMES_CSS}</style>
      {children}
    </div>
  );

  // ─── Compte à rebours ───
  if (view.phase === 'countdown') {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <AppLogo className="h-7" variant="light" />
        <h1 className="text-3xl font-black leading-tight">
          Remets le burger
          <br />
          dans l’ordre !
        </h1>
        <p className="max-w-xs text-base text-white/70">
          Fais glisser les étages, du pain du bas jusqu’au pain du haut. Le plus rapide gagne.
        </p>
        <BurgerStack
          layers={BURGER_LAYER_IDS}
          width={170}
          spread={0.07}
          className="animate-pulse"
        />
        <div className="text-7xl font-black tabular-nums text-amber-400">
          {remainingSec !== null && remainingSec > 0 ? remainingSec : 'Go !'}
        </div>
      </div>,
    );
  }

  // ─── Résultats ───
  if (view.phase === 'results' || view.phase === 'done') {
    const me = view.me;
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/50">Le bon burger</p>
        <BurgerStack layers={view.recipe} width={220} dropIn />
        {me.finishMs !== null ? (
          <p className="text-2xl font-black">Bravo ! {formatBurgerTime(me.finishMs)}</p>
        ) : (
          <p className="text-xl font-bold">
            {me.correctCount} / {view.totalLayers} étages bien placés
          </p>
        )}
        {me.rank !== null && (
          <p className="text-lg text-white/80">
            Tu finis <span className="font-black text-amber-400">{ordinal(me.rank)}</span> sur{' '}
            {view.totalPlayers}
          </p>
        )}
        {me.points !== null && (
          <p className="rounded-full bg-amber-400 px-5 py-2 text-lg font-black text-gray-950">
            +{me.points} pts
          </p>
        )}
      </div>,
    );
  }

  // ─── Burger terminé : on attend les autres ───
  if (finished) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-5xl">🎉</p>
        <h2 className="text-3xl font-black">Burger terminé !</h2>
        <BurgerStack layers={view.me.order} width={230} dropIn />
        <p className="text-2xl font-black text-amber-400">
          {formatBurgerTime(view.me.finishMs!)}
          {view.me.rank !== null && <span className="text-white"> · {ordinal(view.me.rank)}</span>}
        </p>
        <p className="text-sm text-white/60">
          {view.finishedCount} / {view.totalPlayers} burgers terminés
          {remainingSec !== null && remainingSec > 0 ? ` · fin dans ${remainingSec}s` : ''}
        </p>
      </div>,
    );
  }

  // ─── Course ───
  const urgent = remainingSec !== null && remainingSec <= 10;
  return shell(
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div className="flex flex-col gap-1.5">
          <ProgressDots correct={view.me.correctCount} total={view.totalLayers} />
        </div>
        <span
          className={`min-w-[3.5rem] rounded-full px-3 py-1 text-center text-xl font-black tabular-nums ${
            urgent ? 'animate-pulse bg-red-500 text-white' : 'bg-white/10 text-white'
          }`}
        >
          {remainingSec ?? '–'}
        </span>
      </header>
      {error && (
        <p role="alert" className="shrink-0 px-4 pt-1 text-center text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1 px-2 pb-4 pt-10">
        <span className="pointer-events-none absolute left-3 top-3 text-[11px] font-bold uppercase tracking-widest text-white/35">
          ↑ Haut
        </span>
        <span className="pointer-events-none absolute bottom-1 left-3 text-[11px] font-bold uppercase tracking-widest text-white/35">
          ↓ Bas
        </span>
        <BurgerBuilder order={localOrder} disabled={!canMove} onCommit={handleCommit} />
      </div>
    </>,
  );
}
