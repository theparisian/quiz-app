'use client';

import { useEffect } from 'react';
import { useNucStore, type AnsweredFlash } from '@/lib/stores/nuc-store';
import PlayerAvatar from './player-avatar';

/** Doit rester aligné sur l'animation `answered-flash` du tailwind.config. */
const FLASH_DURATION_MS = 2200;

const FLASH_COLORS = [
  '#10b981',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#f59e0b',
  '#14b8a6',
  '#6366f1',
  '#06b6d4',
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function FlashPill({ flash }: { flash: AnsweredFlash }) {
  const dismiss = useNucStore((s) => s.dismissAnsweredFlash);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(flash.key), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flash.key, dismiss]);

  const color = FLASH_COLORS[hashSeed(flash.playerId) % FLASH_COLORS.length];

  return (
    <span
      className={`animate-answered-flash inline-flex items-center gap-2.5 rounded-full py-2 text-xl font-semibold text-white opacity-0 shadow-lg ring-1 ring-white/25 ${
        flash.avatarUrl ? 'pl-2 pr-5' : 'px-5'
      }`}
      style={{ backgroundColor: color }}
    >
      {flash.avatarUrl ? (
        <PlayerAvatar
          avatarUrl={flash.avatarUrl}
          pseudo={flash.pseudo}
          size={32}
          className="ring-2 ring-white/40"
        />
      ) : null}
      {flash.pseudo}
    </span>
  );
}

/**
 * Pseudos éphémères des joueurs qui viennent de répondre : ils arrivent du bas de
 * l'écran, s'affichent un instant puis disparaissent. Purement décoratif — aucune
 * information sur la réponse choisie n'est révélée.
 */
export default function AnsweredFlashes() {
  const flashes = useNucStore((s) => s.answeredFlashes);
  if (flashes.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-16 z-40 flex flex-wrap items-end justify-center gap-3 px-16"
      aria-hidden
    >
      {flashes.map((flash) => (
        <FlashPill key={flash.key} flash={flash} />
      ))}
    </div>
  );
}
