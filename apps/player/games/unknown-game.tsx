'use client';

import { AppLogo } from '@quiz-app/ui';

/**
 * Repli sobre quand la manche ne peut pas être affichée (moteur inconnu de cette version de
 * l'écran, vue invalide) : jamais d'erreur à l'écran (principe 2.1). Le problème est signalé
 * à Sentry par le store ; la vue valide suivante reprend la main.
 */
export default function UnknownGame() {
  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-8">
      <AppLogo className="h-20" variant="light" />
      <div className="text-3xl font-semibold text-gray-300">La partie continue…</div>
      <div className="text-xl text-gray-500">Gardez votre téléphone à portée de main.</div>
    </div>
  );
}
