'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import { AppLogo } from '@quiz-app/ui';
import { api } from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/magic-link/request', { email });
      router.push('/login/check-email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <AppLogo className="h-10" />
          <p className="mt-2 text-sm text-gray-500">Administration</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Adresse email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@cinema.fr"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <PaperPlaneTilt size={16} />
            {loading ? 'Envoi...' : 'Recevoir un lien magique'}
          </button>
        </form>
      </div>
    </main>
  );
}
