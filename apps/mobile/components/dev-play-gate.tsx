'use client';

import { useState } from 'react';
import { unlockDevPlay } from '@/lib/dev-play-access';

interface DevPlayGateProps {
  onUnlock: () => void;
}

export function DevPlayGate({ onUnlock }: DevPlayGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (unlockDevPlay(password.trim())) {
      setError(null);
      onUnlock();
      return;
    }
    setError('Mot de passe incorrect.');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="mb-2 text-center text-xl font-bold">Mode démo mobile</h1>
        <p className="mb-6 text-center text-sm text-gray-400">Accès réservé à l&apos;équipe.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoComplete="current-password"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center outline-none focus:border-brand-500"
          />

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            className="bg-brand-500 hover:bg-brand-400 rounded-xl px-4 py-3 font-semibold text-white transition-colors"
          >
            Accéder
          </button>
        </form>
      </div>
    </div>
  );
}
