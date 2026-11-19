'use client';

import { useEffect } from 'react';
import { getPlayerSocket } from '@/lib/socket';
import {
  ROUND_DISPLAY_MAX_ATTEMPTS,
  ROUND_DISPLAY_RETRY_MS,
  reportRoundDisplayed,
} from '@/lib/round-display-proof';

/**
 * Preuve de diffusion (C3) : appelé par le rendu de la manche une fois monté. Émet
 * `nuc:round_displayed` une fois par manche, dès que la page est visible.
 */
export function useRoundDisplayProof(roundId: string | null): void {
  useEffect(() => {
    if (!roundId || typeof document === 'undefined') return;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const trySend = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      attempts += 1;
      reportRoundDisplayed(getPlayerSocket(), roundId, () => {
        if (disposed || attempts >= ROUND_DISPLAY_MAX_ATTEMPTS) return;
        retryTimer = setTimeout(trySend, ROUND_DISPLAY_RETRY_MS);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') trySend();
    };

    trySend();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [roundId]);
}
