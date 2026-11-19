'use client';

import { useEffect, useState } from 'react';

/**
 * Temps de jeu côté client (protocole des manches, règle 3) : le serveur envoie des échéances
 * (`endsAt`, ISO) et l'enveloppe `game:state` porte `serverNow` ; le client estime son décalage
 * d'horloge et anime localement. En pause, la vue porte `pausedRemainingMs` à la place.
 */

/** Nombre d'échantillons gardés pour lisser le décalage d'horloge (médiane). */
export const CLOCK_OFFSET_WINDOW = 5;

/** Décalage d'un échantillon : `heure serveur - heure locale`, en ms (0 si `serverNow` illisible). */
export function clockOffsetSampleMs(serverNow: string, localNow: number = Date.now()): number {
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? server - localNow : 0;
}

/** Médiane d'une liste de décalages (0 si vide). */
export function medianClockOffsetMs(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/**
 * Ajoute l'échantillon d'un `serverNow` reçu et renvoie la nouvelle fenêtre (immuable) et le
 * décalage lissé (médiane des `windowSize` derniers échantillons).
 */
export function pushClockSample(
  samples: readonly number[],
  serverNow: string,
  localNow: number = Date.now(),
  windowSize: number = CLOCK_OFFSET_WINDOW,
): { samples: number[]; offsetMs: number } {
  if (!Number.isFinite(Date.parse(serverNow))) {
    return { samples: [...samples], offsetMs: medianClockOffsetMs(samples) };
  }
  const next = [...samples, clockOffsetSampleMs(serverNow, localNow)].slice(-windowSize);
  return { samples: next, offsetMs: medianClockOffsetMs(next) };
}

/**
 * Temps restant (ms, >= 0) avant une échéance serveur, ou `null` si la phase n'en a pas.
 * `pausedRemainingMs` l'emporte (pause : le temps est figé).
 */
export function computeRemainingMs(
  endsAt: string | null | undefined,
  pausedRemainingMs: number | null | undefined,
  clockOffsetMs: number,
  localNow: number = Date.now(),
): number | null {
  if (pausedRemainingMs != null) return Math.max(0, pausedRemainingMs);
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - (localNow + clockOffsetMs));
}

export interface UseCountdownOptions {
  /**
   * `'frame'` : rafraîchit à chaque image (requestAnimationFrame, 60 i/s) pour une barre de
   * temps fluide (écran cinéma). `'interval'` (défaut) : toutes les `intervalMs`.
   */
  mode?: 'frame' | 'interval';
  /** Période en mode `'interval'` (défaut 250 ms). */
  intervalMs?: number;
}

/**
 * Temps restant avant `endsAt` (corrigé de `clockOffsetMs`), ou `pausedRemainingMs` figé en
 * pause, ou `null` sans échéance. Le hook arrête de rafraîchir à 0, en pause et sans échéance.
 */
export function useCountdown(
  endsAt: string | null | undefined,
  pausedRemainingMs: number | null | undefined,
  clockOffsetMs: number,
  options: UseCountdownOptions = {},
): number | null {
  const mode = options.mode ?? 'interval';
  const intervalMs = options.intervalMs ?? 250;
  const [remaining, setRemaining] = useState<number | null>(() =>
    computeRemainingMs(endsAt, pausedRemainingMs, clockOffsetMs),
  );

  useEffect(() => {
    const read = () => computeRemainingMs(endsAt, pausedRemainingMs, clockOffsetMs);
    const first = read();
    setRemaining(first);
    // Rien ne bouge : pause, pas d'échéance ou échéance passée.
    if (pausedRemainingMs != null || first === null || first <= 0) return;

    if (mode === 'frame' && typeof requestAnimationFrame === 'function') {
      let raf = 0;
      const tick = () => {
        const value = read();
        setRemaining(value);
        if (value !== null && value > 0) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    const timer = setInterval(() => {
      const value = read();
      setRemaining(value);
      if (value === null || value <= 0) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [endsAt, pausedRemainingMs, clockOffsetMs, mode, intervalMs]);

  return remaining;
}
