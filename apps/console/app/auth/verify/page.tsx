'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refetch } = useAuth();
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Token manquant');
      setVerifying(false);
      return;
    }

    api
      .post<{ user: { role: string } }>('/api/auth/magic-link/verify', { token })
      .then(async (res) => {
        await refetch();
        if (res.user.role === 'player') {
          router.replace('/access-denied');
        } else {
          router.replace('/dashboard');
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Token invalide ou expiré');
        setVerifying(false);
      });
  }, [searchParams, router, refetch]);

  if (verifying) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Vérification en cours...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Erreur de vérification</h1>
        <p className="text-sm text-red-600">{error}</p>
        <a href="/login" className="inline-block text-sm text-blue-600 hover:underline">
          Retour au login
        </a>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">Vérification en cours...</p>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
