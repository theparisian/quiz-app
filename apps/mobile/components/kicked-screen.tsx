'use client';

import { useRouter } from 'next/navigation';

/** Joueur exclu par le cinéma (`PLAYER_KICKED`) : il ne revient pas dans la partie. */
export default function KickedScreen() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-5xl text-gray-500">✕</div>
      <div className="text-2xl font-bold">Tu as été retiré de la partie</div>
      <div className="text-center text-gray-400">
        Le cinéma t’a retiré de cette partie. Tu ne peux plus y participer.
      </div>
      <button
        onClick={() => router.push('/')}
        className="rounded-xl bg-white/10 px-8 py-3 font-medium transition-colors hover:bg-white/20"
      >
        Retour
      </button>
    </div>
  );
}
