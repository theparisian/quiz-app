'use client';

import { useRouter } from 'next/navigation';

export default function ErrorPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="text-5xl">⚠</div>
      <div className="text-2xl font-bold">Erreur</div>
      <div className="text-center text-gray-400">Une erreur est survenue.</div>
      <button
        onClick={() => router.push('/')}
        className="bg-brand-600 rounded-xl px-8 py-3 font-medium text-white"
      >
        Retour à l&apos;accueil
      </button>
    </div>
  );
}
