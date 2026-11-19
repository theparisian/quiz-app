/**
 * Cues de manche (`game:cue`) reçus par l'écran : signaux éphémères (son, animation) qui ne
 * portent jamais d'état. Ils ne passent pas par le store : le store les filtre (manche active)
 * puis les publie ici, et les abonnés (rendu du moteur, directeur audio) réagissent. Un cue
 * reçu sans abonné est simplement perdu, ce que le protocole autorise (règle 4).
 */

export interface ScreenGameCue {
  roundId: string;
  engineKey: string;
  cue: string;
  data: unknown;
}

type CueListener = (cue: ScreenGameCue) => void;

const listeners = new Set<CueListener>();

export function subscribeGameCues(listener: CueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishGameCue(cue: ScreenGameCue): void {
  for (const listener of [...listeners]) {
    try {
      listener(cue);
    } catch {
      // Un abonné défaillant ne doit ni casser les autres ni l'écran.
    }
  }
}
