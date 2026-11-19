import { CONTINUOUS_MUSIC_SLOTS, type AudioSlotKey } from '@quiz-app/validation';
import type { NucDisplay } from '@/lib/stores/nuc-store';

/**
 * Musique de fond selon ce que l'écran affiche (fonction pure, testée). `hasCue` dit si la
 * séance a un son pour ce slot (musique continue : premier slot disponible).
 */
export function musicSlotFor(
  display: NucDisplay,
  continuous: boolean,
  hasCue: (slot: AudioSlotKey) => boolean,
): AudioSlotKey | null {
  if (display === 'idle' || display === 'aborted') return null;

  // Musique continue : une seule piste du lobby jusqu'aux scores, jamais relancée.
  if (continuous) {
    return CONTINUOUS_MUSIC_SLOTS.find((slot) => hasCue(slot)) ?? null;
  }

  switch (display) {
    case 'lobby':
      return 'lobbyMusic';
    case 'game':
    case 'round_end':
      return 'gameMusic';
    case 'final_results':
      return 'scoresMusic';
    default:
      return null;
  }
}
