'use client';

/**
 * Repli sobre quand la manche ne peut pas être affichée (moteur inconnu de cette version de la
 * console, vue invalide) : jamais d'erreur à l'écran. Le problème est signalé à Sentry par le
 * store ; la vue valide suivante reprend la main. Les contrôles restent disponibles.
 */
export default function UnknownGame() {
  return (
    <div className="rounded-lg border bg-white p-5">
      <p className="text-sm font-medium text-gray-500">Manche en cours</p>
      <p className="mt-1 text-sm text-gray-600">
        Le détail de la manche ne peut pas être affiché ici. La partie continue sur l&apos;écran et
        les téléphones.
      </p>
    </div>
  );
}
