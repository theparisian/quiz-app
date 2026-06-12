'use client';

import { useEffect, useState, Suspense } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { api } from '@/lib/api';

import CodeInput from '@/components/code-input';

interface SessionInfo {
  sessionId: string;

  slugShort: string;

  state: string;

  cinema: { name: string };

  quiz: { title: string };
}

function HomeContent() {
  const router = useRouter();

  const params = useSearchParams();

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = params.get('s');

    if (s) {
      void checkAndRedirect(s);
    }
  }, [params]);

  async function checkAndRedirect(code: string) {
    setLoading(true);

    setError(null);

    const storedSessionId = localStorage.getItem('quiz_session_id');

    const storedToken = localStorage.getItem('quiz_resume_token');

    try {
      const session = await api.get<SessionInfo>(`/api/sessions/by-code/${code}`);

      if (storedSessionId === session.sessionId && storedToken) {
        router.push(`/play/${storedSessionId}`);

        return;
      }

      if (session.state === 'ended' || session.state === 'aborted') {
        setError('Cette partie est terminée — à la prochaine séance !');

        setLoading(false);

        return;
      }

      router.push(`/join/${code}`);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };

      if (e.code === 'SESSION_NOT_FOUND') {
        setError('Code session invalide.');
      } else {
        setError(e.message ?? 'Erreur de connexion.');
      }

      setLoading(false);
    }
  }

  function handleSubmit(code: string) {
    void checkAndRedirect(code);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-2 text-4xl">🎬</div>

        <h1 className="text-3xl font-bold">Quiz Cinéma</h1>
      </div>

      <div className="w-full max-w-xs">
        <div className="mb-6 text-center text-lg text-gray-400">Code session</div>

        <CodeInput onSubmit={handleSubmit} disabled={loading} />

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && <div className="mt-4 text-center text-gray-500">Vérification...</div>}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-gray-500">
          Chargement...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
