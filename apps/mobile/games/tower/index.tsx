'use client';

import { useCallback, useState, type ReactNode } from 'react';
import {
  TOWER_BOOKS,
  TOWER_DROP_ACTION,
  formatTowerHeight,
  towerBookAt,
  type TowerBook,
  type TowerMobileView,
} from '@quiz-app/validation';
import { AppLogo, BookFace, BookTower, TOWER_KEYFRAMES_CSS, useCountdown } from '@quiz-app/ui';
import type { GameRendererProps } from '../types';
import TowerBuilder, { type TowerLocalState } from './tower-builder';
import { stabilityLabel } from './sim';

/** Libellés des refus d'un lâcher (codes de `game:action`), en tutoiement. */
export function dropErrorMessage(code: string): string | null {
  switch (code) {
    case 'PHASE_CLOSED':
    case 'WRONG_ROUND':
    case 'NO_ACTIVE_ROUND':
      return 'Trop tard, la construction est terminée !';
    case 'SESSION_PAUSED':
      return 'La partie est en pause.';
    case 'TIMEOUT':
    case 'NOT_CONNECTED':
      return 'Connexion lente : ton dernier livre n’est pas passé.';
    case 'TOO_FAST':
    case 'RATE_LIMITED':
      return 'Doucement ! Un livre à la fois.';
    case 'STALE_DROP':
      // Le téléphone se recale sur la vue du serveur, sans message.
      return null;
    default:
      return 'Ton livre n’a pas pu être posé, réessaie.';
  }
}

function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** Tour de démonstration du compte à rebours. */
const DEMO_TOWER: TowerBook[] = [
  { k: 'atlas', x: 0 },
  { k: 'roman', x: -3 },
  { k: 'manga', x: 2 },
  { k: 'dictionnaire', x: -1 },
  { k: 'bd', x: 4 },
  { k: 'poche', x: 1 },
];

const STABILITY_TONE = {
  ok: 'bg-green-400',
  warn: 'bg-amber-400',
  danger: 'bg-red-500',
} as const;

/**
 * Rendu mobile de la tour de livres : ne dépend que de la vue. Pendant la construction, la tour
 * affichée est la prédiction locale (même règle d'équilibre que le serveur) ; la vue du serveur
 * fait foi dès qu'aucun lâcher n'est en route.
 */
export default function TowerMobileGame({
  round,
  view,
  clockOffsetMs,
  sendAction,
}: GameRendererProps<TowerMobileView>) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const remainingSec = remainingMs !== null ? Math.ceil(Math.max(0, remainingMs) / 1000) : null;
  const [local, setLocal] = useState<TowerLocalState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDrop = view.phase === 'build' && view.pausedRemainingMs === null && !!sendAction;
  const bottomPad = round.game.kind === 'sponsored' && round.game.sponsor ? 72 : 16;

  const handleDrop = useCallback(
    async (index: number, x: number) => {
      if (!sendAction) return false;
      setError(null);
      const ack = await sendAction(TOWER_DROP_ACTION, { index, x });
      if (ack.ok) return true;
      setError(dropErrorMessage(ack.code));
      // Sans réponse, le lâcher a peut-être été reçu : on garde la prédiction. S'il ne l'a pas
      // été, le lâcher suivant est refusé (STALE_DROP) et la tour se recale sur le serveur.
      return ack.code === 'TIMEOUT' || ack.code === 'NOT_CONNECTED';
    },
    [sendAction],
  );

  const shell = (children: ReactNode) => (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-[#0f172a] via-[#1e1b2e] to-[#2a1a12]"
      style={{
        height: '100dvh',
        overscrollBehavior: 'none',
        paddingBottom: `max(${bottomPad}px, env(safe-area-inset-bottom))`,
      }}
    >
      <style>{TOWER_KEYFRAMES_CSS}</style>
      {children}
    </div>
  );

  // ─── Compte à rebours ───
  if (view.phase === 'countdown') {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <AppLogo className="h-7" variant="light" />
        <h1 className="text-3xl font-black leading-tight">
          Construis la plus
          <br />
          haute tour de livres !
        </h1>
        <p className="max-w-xs text-base text-white/70">
          Un livre glisse au-dessus de ta tour : touche l’écran pour le lâcher. Mal centré, tout
          peut s’écrouler…
        </p>
        <div
          style={{ animation: 'tower-sway 2.4s ease-in-out infinite', transformOrigin: '50% 100%' }}
        >
          <BookTower books={DEMO_TOWER} scale={3.4} />
        </div>
        <div className="text-7xl font-black tabular-nums text-amber-400">
          {remainingSec !== null && remainingSec > 0 ? remainingSec : 'Go !'}
        </div>
      </div>,
    );
  }

  // ─── Résultats ───
  if (view.phase === 'results' || view.phase === 'done') {
    const me = view.me;
    const scale = Math.min(3.2, 300 / Math.max(40, me.heightCm + 8));
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/50">Ta tour</p>
        {me.books.length > 0 ? (
          <BookTower books={me.books} scale={scale} dropIn />
        ) : (
          <p className="text-6xl">📚</p>
        )}
        <p className="text-3xl font-black">{formatTowerHeight(me.heightCm)}</p>
        {me.bestHeightCm > me.heightCm && (
          <p className="text-sm text-white/60">Record : {formatTowerHeight(me.bestHeightCm)}</p>
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

  // ─── Construction ───
  const heightCm = local?.heightCm ?? view.me.heightCm;
  const stress = local?.stress ?? 0;
  const nextIndex = local?.drops ?? view.me.drops;
  const next = towerBookAt(view.seed, nextIndex + 1);
  const stability = stabilityLabel(stress);
  const urgent = remainingSec !== null && remainingSec <= 10;
  const leading = view.topHeight > 0 && heightCm >= view.topHeight;

  return shell(
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-1 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Hauteur</span>
          <span className="text-3xl font-black tabular-nums leading-none">
            {formatTowerHeight(heightCm)}
          </span>
          <span className="text-xs text-white/50">
            {leading
              ? '👑 Plus haute tour de la salle'
              : `Record de la salle : ${formatTowerHeight(view.topHeight)}`}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`min-w-[3.5rem] rounded-full px-3 py-1 text-center text-xl font-black tabular-nums ${
              urgent ? 'animate-pulse bg-red-500 text-white' : 'bg-white/10 text-white'
            }`}
          >
            {remainingSec ?? '–'}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-white/60">
            Suivant
            <BookFace book={{ k: next }} scale={1.4} />
          </div>
        </div>
      </header>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          {stability.label}
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <span
            className={`block h-full rounded-full transition-all duration-300 ${STABILITY_TONE[stability.tone]}`}
            style={{ width: `${Math.max(4, Math.min(100, stress * 100))}%` }}
          />
        </span>
      </div>
      {error && (
        <p role="alert" className="shrink-0 px-4 pt-1 text-center text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <TowerBuilder
          seed={view.seed}
          books={view.me.books}
          drops={view.me.drops}
          bestHeightCm={view.me.bestHeightCm}
          disabled={!canDrop}
          onDrop={handleDrop}
          onLocalChange={setLocal}
        />
        {view.me.drops === 0 && !local?.drops && canDrop && (
          <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-lg font-bold text-white/80">
            Touche l’écran pour lâcher le livre !
          </p>
        )}
        <p className="pointer-events-none absolute bottom-3 right-3 text-[11px] text-white/40">
          {TOWER_BOOKS[towerBookAt(view.seed, nextIndex)].label}
        </p>
      </div>
    </>,
  );
}
