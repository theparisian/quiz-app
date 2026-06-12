'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

const RANKS = [
  { key: 'rank1' as const, label: '1er', medal: '🥇' },
  { key: 'rank2' as const, label: '2e', medal: '🥈' },
  { key: 'rank3' as const, label: '3e', medal: '🥉' },
  { key: 'all' as const, label: 'Tous', medal: '🎁' },
];

export function SessionPrizesReminder() {
  const prizes = useLiveSessionStore((s) => s.prizes);
  if (!prizes?.rank1 && !prizes?.rank2 && !prizes?.rank3 && !prizes?.all) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
        Lots de la séance
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-950">
        {RANKS.map(({ key, label, medal }) => {
          const prize = prizes[key];
          if (!prize) return null;
          const isSuper = key === 'rank1' && prizes.rank1?.isSuperPrize;
          const isAll = key === 'all';
          return (
            <li key={key}>
              {medal} {isAll ? 'Tous les joueurs' : label} : {prize.label}
              {isSuper && (
                <span className="ml-2 rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-semibold text-yellow-900">
                  Super lot
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
