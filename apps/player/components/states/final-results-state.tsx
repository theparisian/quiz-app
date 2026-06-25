'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { playSound, playBackground } from '@/lib/audio';
import PlayerAvatar from '@/components/shared/player-avatar';
import ConfettiBurst from '@/components/shared/confetti-burst';

// Cadence du dévoilement (en secondes) : 3e, puis 2e, puis 1er pour le suspense.
const REVEAL = {
  header: 0.1,
  third: 0.6,
  second: 1.2,
  first: 1.9,
  crown: 2.4,
  bonus: 2.7,
  confetti: 2.3,
  list: 2.9,
  footer: 4.1,
} as const;

function formatScore(value: number): string {
  return value.toLocaleString('fr-FR');
}

function rankPrizeLabel(
  rank: number,
  prizes: ReturnType<typeof useNucStore.getState>['prizes'],
): { label: string; isSuperPrize: boolean } | null {
  if (!prizes) return null;
  if (rank === 1 && prizes.rank1) {
    return { label: prizes.rank1.label, isSuperPrize: !!prizes.rank1.isSuperPrize };
  }
  if (rank === 2 && prizes.rank2) return { label: prizes.rank2.label, isSuperPrize: false };
  if (rank === 3 && prizes.rank3) return { label: prizes.rank3.label, isSuperPrize: false };
  return null;
}

/** Demi-couronne de laurier stylisée (côté gauche ; on la miroite pour la droite). */
function LaurelBranch({ className, style }: { className?: string; style?: CSSProperties }) {
  const leaves = [
    { cx: 30, cy: 16, r: -38 },
    { cx: 22, cy: 33, r: -26 },
    { cx: 16, cy: 52, r: -13 },
    { cx: 14, cy: 72, r: 0 },
    { cx: 16, cy: 92, r: 15 },
    { cx: 22, cy: 111, r: 28 },
  ];
  return (
    <svg viewBox="0 0 70 140" className={className} style={style} fill="none" aria-hidden>
      <path
        d="M36 138 C 10 112, 6 62, 30 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
      {leaves.map((l, i) => (
        <ellipse
          key={i}
          cx={l.cx}
          cy={l.cy}
          rx="10"
          ry="4.6"
          fill="currentColor"
          transform={`rotate(${l.r} ${l.cx} ${l.cy})`}
        />
      ))}
    </svg>
  );
}

export default function FinalResultsState() {
  const finalScoreboard = useNucStore((s) => s.finalScoreboard);
  const totalPlayers = useNucStore((s) => s.totalPlayers);
  const prizes = useNucStore((s) => s.prizes);
  const reset = useNucStore((s) => s.reset);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    playSound('final');
    const musicTimer = setTimeout(() => playBackground(), 5000);
    timerRef.current = setTimeout(() => reset(), 60_000);
    return () => {
      clearTimeout(musicTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reset]);

  if (!finalScoreboard || finalScoreboard.length === 0) return null;

  const first = finalScoreboard[0];
  const second = finalScoreboard[1];
  const third = finalScoreboard[2];
  const rest = finalScoreboard.slice(3, 10);
  const playerCount = Math.max(totalPlayers, finalScoreboard.length);

  const prize1 = first ? rankPrizeLabel(1, prizes) : null;
  const prize2 = second ? rankPrizeLabel(2, prizes) : null;
  const prize3 = third ? rankPrizeLabel(3, prizes) : null;

  return (
    <div className="relative flex h-full flex-col items-center gap-[clamp(16px,2.6vh,40px)] overflow-hidden px-12 py-[clamp(24px,4vh,56px)]">
      {/* Halo ambiant doré derrière le podium, dans l'esprit verre dépoli du lobby. */}
      <div
        className="pointer-events-none absolute left-1/2 top-[28%] -z-0 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400/10 blur-[120px]"
        aria-hidden
      />

      <ConfettiBurst startDelay={REVEAL.confetti} />

      {/* Titre */}
      <header
        className="animate-fade-in-up z-10 text-center opacity-0"
        style={{ animationDelay: `${REVEAL.header}s` }}
      >
        <h1 className="text-[clamp(28px,3.2vw,56px)] font-black uppercase tracking-[0.06em] drop-shadow">
          Classement de la salle
        </h1>
        <div className="mt-1 text-[clamp(13px,1.3vw,22px)] font-bold uppercase tracking-[0.25em] text-yellow-400">
          {playerCount} joueurs
        </div>
        <div className="mx-auto mt-2 h-[3px] w-16 rounded-full bg-yellow-400/70" />
      </header>

      {/* Podium */}
      <div className="z-10 flex items-end justify-center gap-[clamp(12px,1.4vw,24px)]">
        {/* 2e place */}
        {second && (
          <div
            className="animate-podium-rise border-white/12 relative flex w-[clamp(170px,15vw,238px)] flex-col items-center rounded-[1.75rem] border bg-white/[0.05] px-6 pb-7 pt-14 text-center opacity-0 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-2xl"
            style={{ animationDelay: `${REVEAL.second}s` }}
          >
            <div className="absolute -top-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-300 bg-gray-950 text-xl font-black text-gray-300 shadow-lg">
              2
            </div>
            <PlayerAvatar
              avatarUrl={second.avatarUrl}
              pseudo={second.pseudo}
              size={84}
              className="ring-2 ring-white/25"
            />
            <div className="mt-3 max-w-full truncate text-[clamp(16px,1.4vw,24px)] font-semibold">
              {second.pseudo}
            </div>
            <div className="mt-1 text-[clamp(22px,2vw,36px)] font-black tabular-nums text-white">
              {formatScore(second.scoreTotal)}
            </div>
            <div className="text-sm text-white/45">points</div>
            {prize2 && <div className="mt-2 text-xs text-white/55">🥈 {prize2.label}</div>}
          </div>
        )}

        {/* 1re place */}
        {first && (
          <div
            className="animate-winner-pop relative z-10 flex w-[clamp(210px,18vw,300px)] flex-col items-center rounded-[2rem] border border-yellow-400/50 bg-gradient-to-b from-yellow-400/[0.18] to-yellow-500/[0.04] px-7 pb-7 pt-16 text-center opacity-0 shadow-[0_0_60px_rgba(241,196,15,0.22)] ring-1 ring-inset ring-yellow-300/20 backdrop-blur-2xl"
            style={{ animationDelay: `${REVEAL.first}s` }}
          >
            <div className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border-2 border-yellow-400 bg-gray-950 text-2xl font-black text-yellow-400 shadow-lg">
              1
            </div>

            <div className="relative flex items-center justify-center">
              {/* Aura pulsée */}
              <div className="animate-winner-aura absolute h-[150%] w-[150%] rounded-full bg-yellow-400/25 blur-2xl" />
              {/* Lauriers */}
              <LaurelBranch
                className="animate-laurel-left absolute -left-[58%] h-[130%] text-yellow-400 opacity-0"
                style={{ animationDelay: `${REVEAL.crown}s` }}
              />
              <LaurelBranch
                className="animate-laurel-right absolute -right-[58%] h-[130%] text-yellow-400 opacity-0"
                style={{ animationDelay: `${REVEAL.crown}s` }}
              />
              {/* Couronne */}
              <span
                className="animate-crown-drop absolute -top-9 text-4xl opacity-0"
                style={{ animationDelay: `${REVEAL.crown}s` }}
              >
                👑
              </span>
              <PlayerAvatar
                avatarUrl={first.avatarUrl}
                pseudo={first.pseudo}
                size={112}
                className="relative ring-4 ring-yellow-400/70"
              />
            </div>

            <div className="mt-4 max-w-full truncate text-[clamp(20px,1.8vw,30px)] font-bold">
              {first.pseudo}
            </div>
            <div className="mt-1 text-[clamp(30px,3vw,52px)] font-black tabular-nums leading-none text-yellow-300">
              {formatScore(first.scoreTotal)}
            </div>
            <div className="text-sm text-yellow-200/70">points</div>

            {prize1 && (
              <div
                className="animate-bonus-pop mt-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 px-5 py-3 text-left text-gray-900 opacity-0 shadow-lg"
                style={{ animationDelay: `${REVEAL.bonus}s` }}
              >
                <span className="text-2xl leading-none">🎁</span>
                <div className="leading-tight">
                  <div className="text-[11px] font-black uppercase tracking-wide">
                    {prize1.isSuperPrize ? '🎰 Super lot !' : 'Bonus !'}
                  </div>
                  <div className="text-sm font-bold">{prize1.label}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3e place */}
        {third && (
          <div
            className="animate-podium-rise border-white/12 relative flex w-[clamp(170px,15vw,238px)] flex-col items-center rounded-[1.75rem] border bg-white/[0.05] px-6 pb-7 pt-14 text-center opacity-0 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-2xl"
            style={{ animationDelay: `${REVEAL.third}s` }}
          >
            <div className="absolute -top-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-600 bg-gray-950 text-xl font-black text-amber-500 shadow-lg">
              3
            </div>
            <PlayerAvatar
              avatarUrl={third.avatarUrl}
              pseudo={third.pseudo}
              size={84}
              className="ring-2 ring-white/25"
            />
            <div className="mt-3 max-w-full truncate text-[clamp(16px,1.4vw,24px)] font-semibold">
              {third.pseudo}
            </div>
            <div className="mt-1 text-[clamp(22px,2vw,36px)] font-black tabular-nums text-white">
              {formatScore(third.scoreTotal)}
            </div>
            <div className="text-sm text-white/45">points</div>
            {prize3 && <div className="mt-2 text-xs text-white/55">🥉 {prize3.label}</div>}
          </div>
        )}
      </div>

      {/* Reste du classement (4 → 10) */}
      {rest.length > 0 && (
        <div
          className="animate-fade-in-up z-10 w-full max-w-[clamp(540px,46vw,760px)] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] opacity-0 shadow-xl ring-1 ring-inset ring-white/5 backdrop-blur-xl"
          style={{ animationDelay: `${REVEAL.list}s` }}
        >
          {rest.map((entry, i) => (
            <div
              key={entry.playerId}
              className="animate-cascade-in flex items-center justify-between border-t border-white/5 px-6 py-[clamp(8px,1.2vh,14px)] opacity-0 first:border-t-0 odd:bg-white/[0.025]"
              style={{ animationDelay: `${REVEAL.list + 0.15 + i * 0.12}s` }}
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-7 text-right text-lg font-bold tabular-nums text-white/40">
                  {entry.rank}
                </span>
                <PlayerAvatar avatarUrl={entry.avatarUrl} pseudo={entry.pseudo} size={40} />
                <span className="truncate text-[clamp(15px,1.2vw,20px)] font-medium">
                  {entry.pseudo}
                </span>
              </div>
              <div className="shrink-0 tabular-nums">
                <span className="text-[clamp(16px,1.3vw,22px)] font-bold">
                  {formatScore(entry.scoreTotal)}
                </span>
                <span className="ml-1.5 text-sm text-white/40">points</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lot pour tous + remerciement */}
      <footer
        className="animate-fade-in-up z-10 mt-auto flex flex-col items-center gap-2 text-center opacity-0"
        style={{ animationDelay: `${REVEAL.footer}s` }}
      >
        {prizes?.all && (
          <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-200">
            🎁 Tous les joueurs repartent avec {prizes.all.label}
          </div>
        )}
        <div className="text-[clamp(16px,1.6vw,26px)] text-white/55">
          Merci d&apos;avoir joué ! Bon film 🎬
        </div>
      </footer>
    </div>
  );
}
