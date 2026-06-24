'use client';

import { useEffect, useRef } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { playSound, playBackground } from '@/lib/audio';
import PlayerAvatar from '@/components/shared/player-avatar';

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

export default function FinalResultsState() {
  const finalScoreboard = useNucStore((s) => s.finalScoreboard);
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

  const top3 = finalScoreboard.slice(0, 3);
  const rest = finalScoreboard.slice(3, 13);
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const prize1 = first ? rankPrizeLabel(1, prizes) : null;
  const prize2 = second ? rankPrizeLabel(2, prizes) : null;
  const prize3 = third ? rankPrizeLabel(3, prizes) : null;

  return (
    <div className="flex h-full flex-col items-center px-16 py-12">
      <h1 className="mb-12 text-[clamp(36px,4vw,72px)] font-bold">🏆 Et voici les gagnants !</h1>

      <div className="mb-12 flex items-end justify-center gap-4">
        {second && (
          <div
            className="animate-slide-in-left flex w-48 flex-col items-center rounded-t-2xl bg-gray-800 p-6 opacity-0"
            style={{ animationDelay: '2.5s', minHeight: '180px' }}
          >
            <div className="text-2xl font-bold text-gray-400">#2</div>
            <PlayerAvatar
              avatarUrl={second.avatarUrl}
              pseudo={second.pseudo}
              size={72}
              className="mt-2 ring-2 ring-white/30"
            />
            <div className="mt-2 text-xl font-semibold">{second.pseudo}</div>
            <div className="mt-1 text-lg text-gray-400">{second.scoreTotal} pts</div>
            {prize2 && (
              <div className="mt-2 text-center text-sm text-gray-300">🥈 {prize2.label}</div>
            )}
          </div>
        )}

        {first && (
          <div
            className={`animate-scale-up flex w-56 flex-col items-center rounded-t-2xl p-8 opacity-0 ${
              prize1?.isSuperPrize
                ? 'border border-yellow-400/50 bg-gradient-to-b from-yellow-500/30 to-yellow-600/10'
                : 'bg-yellow-500/20'
            }`}
            style={{ animationDelay: '3s', minHeight: '240px' }}
          >
            <div className="text-4xl font-black text-yellow-400">#1</div>
            <PlayerAvatar
              avatarUrl={first.avatarUrl}
              pseudo={first.pseudo}
              size={96}
              className="mt-2 ring-4 ring-yellow-400/60"
            />
            <div className="mt-2 text-2xl font-bold">{first.pseudo}</div>
            <div className="mt-1 text-xl text-yellow-300">{first.scoreTotal} pts</div>
            {prize1 && (
              <div
                className={`mt-3 text-center text-sm font-semibold ${
                  prize1.isSuperPrize ? 'text-yellow-200' : 'text-yellow-100'
                }`}
              >
                {prize1.isSuperPrize ? '🎰 SUPER LOT : ' : '🥇 '}
                {prize1.label}
              </div>
            )}
          </div>
        )}

        {third && (
          <div
            className="animate-slide-in-right flex w-48 flex-col items-center rounded-t-2xl bg-gray-800 p-6 opacity-0"
            style={{ animationDelay: '2s', minHeight: '140px' }}
          >
            <div className="text-2xl font-bold text-gray-400">#3</div>
            <PlayerAvatar
              avatarUrl={third.avatarUrl}
              pseudo={third.pseudo}
              size={72}
              className="mt-2 ring-2 ring-white/30"
            />
            <div className="mt-2 text-xl font-semibold">{third.pseudo}</div>
            <div className="mt-1 text-lg text-gray-400">{third.scoreTotal} pts</div>
            {prize3 && (
              <div className="mt-2 text-center text-sm text-gray-300">🥉 {prize3.label}</div>
            )}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="mb-3 text-lg font-semibold text-gray-400">Classement complet</div>
          <div className="space-y-1">
            {rest.map((entry, i) => (
              <div
                key={entry.playerId}
                className="animate-cascade-in flex items-center justify-between rounded-lg bg-white/5 px-6 py-3 opacity-0"
                style={{ animationDelay: `${3.5 + i * 0.1}s` }}
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-right text-gray-500">#{entry.rank}</span>
                  <PlayerAvatar avatarUrl={entry.avatarUrl} pseudo={entry.pseudo} size={36} />
                  <span className="font-medium">{entry.pseudo}</span>
                </div>
                <span className="text-gray-400">{entry.scoreTotal} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {prizes?.all && (
        <p className="text-center text-base text-emerald-300/90">
          Tous les joueurs repartent avec {prizes.all.label}
        </p>
      )}

      <div className="mt-auto pt-8 text-2xl text-gray-500">
        Merci d&apos;avoir joué ! Bon film 🎬
      </div>
    </div>
  );
}
