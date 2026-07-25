'use client';

import { useEffect, useRef, useState } from 'react';
import { Gift } from '@phosphor-icons/react';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';

const RANKS = [
  { key: 'rank1' as const, label: '1er', medal: '🥇' },
  { key: 'rank2' as const, label: '2e', medal: '🥈' },
  { key: 'rank3' as const, label: '3e', medal: '🥉' },
  { key: 'all' as const, label: 'Tous', medal: '🎁' },
];

export function SessionPrizesReminder() {
  const prizes = useLiveSessionStore((s) => s.prizes);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!prizes?.rank1 && !prizes?.rank2 && !prizes?.rank3 && !prizes?.all) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
      >
        <Gift size={14} weight="duotone" />
        Lots
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-64 rounded-lg border border-amber-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Lots de la séance
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
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
      )}
    </div>
  );
}
