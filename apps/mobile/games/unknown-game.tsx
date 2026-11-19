'use client';

import BreedingRhombusSpinner from '@/components/breeding-rhombus-spinner';
import WaitingLabel from '@/components/waiting-label';

/**
 * Repli sobre quand la manche ne peut pas être affichée (moteur inconnu de cette version de
 * l'app, vue invalide) : jamais d'erreur à l'écran. Le problème est signalé à Sentry par le store.
 */
export default function UnknownGame() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-2xl font-bold">La partie continue sur grand écran</div>
      <p className="mt-3 text-gray-400">Garde les yeux sur l’écran de la salle !</p>
      <div className="my-16 flex flex-col items-center">
        <BreedingRhombusSpinner />
        <WaitingLabel className="mt-10 text-gray-400">On revient vers toi</WaitingLabel>
      </div>
    </div>
  );
}
