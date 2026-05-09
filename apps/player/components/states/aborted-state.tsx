'use client';

import { useEffect } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';

export default function AbortedState() {
  const reset = useNucStore((s) => s.reset);

  useEffect(() => {
    const timer = setTimeout(() => reset(), 5000);
    return () => clearTimeout(timer);
  }, [reset]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="text-6xl text-gray-500">✕</div>
      <div className="text-4xl font-bold">Session terminée</div>
      <div className="text-xl text-gray-400">Merci d&apos;avoir joué !</div>
      <div className="text-lg text-gray-600">Retour automatique dans 5 secondes...</div>
    </div>
  );
}
