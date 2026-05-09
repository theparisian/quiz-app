'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function ProvisionFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nucUid = params.get('nuc_uid');
    const authKey = params.get('auth_key');

    if (!nucUid || !authKey) {
      const storedNucUid = localStorage.getItem('nuc_uid');
      if (storedNucUid) {
        api
          .post('/api/nucs/heartbeat', {})
          .then(() => router.replace('/screen'))
          .catch(() => router.replace('/error?reason=not_provisioned'));
      } else {
        router.replace('/error?reason=not_provisioned');
      }
      return;
    }

    api
      .post<{ nucId: string; screenId: string; cinemaSlug: string }>('/api/nucs/auth', {
        nucUid,
        authKey,
      })
      .then(() => {
        localStorage.setItem('nuc_uid', nucUid);
        router.replace('/screen');
      })
      .catch((err: Error & { code?: string }) => {
        setError(
          err.code === 'NUC_NOT_FOUND'
            ? 'NUC inconnu'
            : err.code === 'NUC_AUTH_FAILED'
              ? "Clé d'authentification invalide"
              : err.message,
        );
      });
  }, [router, params]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="text-3xl text-red-500">Erreur de provisionnement</div>
        <div className="text-xl text-gray-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-2xl text-gray-500">Provisionnement en cours...</div>
    </div>
  );
}

export default function ProvisionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-gray-500">Chargement...</div>
      }
    >
      <ProvisionFlow />
    </Suspense>
  );
}
