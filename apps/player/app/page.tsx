'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function BootRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const nucUid = params.get('nuc_uid');
    const authKey = params.get('auth_key');

    if (nucUid && authKey) {
      router.replace(
        `/provision?nuc_uid=${encodeURIComponent(nucUid)}&auth_key=${encodeURIComponent(authKey)}`,
      );
      return;
    }

    const stored = localStorage.getItem('nuc_uid');
    if (stored) {
      router.replace('/screen');
    } else {
      router.replace('/error?reason=not_provisioned');
    }
  }, [router, params]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-2xl text-gray-500">Démarrage...</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-gray-500">Chargement...</div>
      }
    >
      <BootRedirect />
    </Suspense>
  );
}
