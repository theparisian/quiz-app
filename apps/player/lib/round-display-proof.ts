import type { NucRoundDisplayedPayload } from '@quiz-app/validation';

/**
 * Preuve de diffusion (C3) : l'écran signale une seule fois par manche que le rendu de la manche
 * est monté et visible (`nuc:round_displayed`). Le serveur n'écrit la preuve qu'une fois ; ce
 * registre évite de réémettre à chaque nouveau rendu du composant.
 */

/** Refus passager (socket pas encore rattaché à sa salle après une reconnexion) : on réessaie. */
export const ROUND_DISPLAY_RETRYABLE_CODES = new Set([
  'NUC_NOT_ON_SCREEN',
  'ROUND_DISPLAYED_ERROR',
]);
export const ROUND_DISPLAY_RETRY_MS = 3000;
export const ROUND_DISPLAY_MAX_ATTEMPTS = 5;

export type RoundDisplayedAck = { ok: true } | { ok: false; code: string; message?: string };

export interface RoundDisplayEmitter {
  emit(
    event: 'nuc:round_displayed',
    payload: NucRoundDisplayedPayload,
    ack: (res: RoundDisplayedAck) => void,
  ): unknown;
}

/** Manches déjà signalées (ou en cours de signalement) par cet écran. */
const reported = new Set<string>();

/** Réserve le signalement d'une manche ; false si elle a déjà été signalée. */
export function claimRoundDisplay(roundId: string): boolean {
  if (reported.has(roundId)) return false;
  reported.add(roundId);
  return true;
}

/** Libère une manche dont le signalement a échoué de façon passagère. */
export function releaseRoundDisplay(roundId: string): void {
  reported.delete(roundId);
}

export function resetRoundDisplayForTests(): void {
  reported.clear();
}

/**
 * Émet la preuve d'une manche, une seule fois. `onRetryable` est appelé si le serveur refuse
 * de façon passagère (la manche est alors libérée pour un nouvel essai).
 */
export function reportRoundDisplayed(
  socket: RoundDisplayEmitter,
  roundId: string,
  onRetryable: () => void,
): boolean {
  if (!claimRoundDisplay(roundId)) return false;
  socket.emit('nuc:round_displayed', { roundId }, (res) => {
    if (res?.ok) return;
    if (res && ROUND_DISPLAY_RETRYABLE_CODES.has(res.code)) {
      releaseRoundDisplay(roundId);
      onRetryable();
    }
  });
  return true;
}
