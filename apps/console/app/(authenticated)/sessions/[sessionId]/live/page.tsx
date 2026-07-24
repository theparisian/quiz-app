'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function LiveSessionRedirectPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    api
      .get<{ screenId: string }>(`/api/sessions/${sessionId}/full`)
      .then((session) => router.replace(`/screens/${session.screenId}`))
      .catch(() => setNotFound(true));
  }, [sessionId, router]);

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Session introuvable.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Retour au dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-gray-400">Redirection vers la salle…</p>
    </div>
  );
}
