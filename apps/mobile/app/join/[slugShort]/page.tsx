'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/lib/stores/player-store';
import PseudoInput from '@/components/pseudo-input';

interface SessionInfo {
  sessionId: string;
  slugShort: string;
  state: string;
  cinema: { name: string; logoUrl: string | null };
  quiz: { title: string; brandingJson: Record<string, unknown> | null };
  totalPlayers: number;
}

interface JoinResponse {
  player: {
    id: string;
    pseudo: string;
    scoreTotal: number;
    sessionId: string;
    sessionState: string;
  };
  resumeToken: string;
}

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const slugShort = params.slugShort as string;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api
      .get<SessionInfo>(`/api/sessions/by-code/${slugShort}`)
      .then((s) => {
        if (s.state !== 'lobby') {
          setError('La session a déjà commencé.');
          return;
        }
        setSession(s);
      })
      .catch(() => setError('Session introuvable.'));
  }, [slugShort]);

  async function handleJoin(pseudo: string) {
    setJoining(true);
    setError(null);
    try {
      const result = await api.post<JoinResponse>('/api/players/join', {
        sessionSlugShort: slugShort,
        pseudo,
      });

      usePlayerStore.getState().hydrate({
        playerId: result.player.id,
        pseudo: result.player.pseudo,
        resumeToken: result.resumeToken,
        sessionId: result.player.sessionId,
        slugShort,
        ...(session?.cinema.name ? { cinemaName: session.cinema.name } : {}),
        ...(session?.quiz.title ? { quizTitle: session.quiz.title } : {}),
        ...(session?.quiz.brandingJson ? { brandingJson: session.quiz.brandingJson } : {}),
        scoreTotal: result.player.scoreTotal,
      });

      router.push(`/play/${result.player.sessionId}`);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'PSEUDO_BAD_WORD') setError('Ce pseudo contient des mots inappropriés.');
      else if (e.code === 'PSEUDO_DUPLICATE') setError('Ce pseudo est déjà pris.');
      else if (e.code === 'SESSION_NOT_IN_LOBBY') setError('La session a déjà commencé.');
      else setError(e.message ?? 'Erreur lors de la connexion.');
      setJoining(false);
    }
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-xl text-red-400">{error}</div>
        <button onClick={() => router.push('/')} className="text-brand-400 mt-6 underline">
          Retour
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Chargement...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-2 text-4xl">🎬</div>
        <h1 className="text-2xl font-bold">Quiz au {session.cinema.name}</h1>
        <p className="mt-1 text-gray-400">{session.quiz.title}</p>
      </div>

      <div className="w-full max-w-xs">
        <PseudoInput onSubmit={handleJoin} disabled={joining} />
        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
