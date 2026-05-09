'use client';

import { useRouter } from 'next/navigation';

export default function AbortedScreen() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-5xl text-gray-500">✕</div>
      <div className="text-2xl font-bold">Session terminée</div>
      <div className="text-center text-gray-400">Le projectionniste a interrompu la session.</div>
      <button
        onClick={() => router.push('/')}
        className="rounded-xl bg-white/10 px-8 py-3 font-medium transition-colors hover:bg-white/20"
      >
        Retour
      </button>
    </div>
  );
}
