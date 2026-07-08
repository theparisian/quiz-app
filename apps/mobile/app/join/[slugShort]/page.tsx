'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { AppLogo } from '@quiz-app/ui';
import { getMobileSocket, disconnectMobileSocket } from '@/lib/socket';
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

interface JoinAck {
  ok?: boolean;
  playerId?: string;
  resumeToken?: string;
  pseudo?: string;
  avatarId?: string | null;
  avatarUrl?: string | null;
  sessionId?: string;
  scoreTotal?: number;
  joinedQuestionPosition?: number | null;
  stateSnapshot?: Record<string, unknown> | null;
  code?: string;
  message?: string;
}

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const slugShort = params.slugShort as string;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    api
      .get<SessionInfo>(`/api/sessions/by-code/${slugShort}`)
      .then((s) => {
        const storedSessionId = localStorage.getItem('quiz_session_id');
        const storedToken = localStorage.getItem('quiz_resume_token');
        if (storedSessionId === s.sessionId && storedToken) {
          router.replace(`/play/${storedSessionId}`);
          return;
        }

        if (s.state === 'ended' || s.state === 'aborted') {
          setError('Cette partie est terminée — à la prochaine séance !');
          return;
        }
        setSession(s);
      })
      .catch(() => setError('Session introuvable.'));
  }, [slugShort, router]);

  useEffect(() => {
    return () => {
      if (!joinedRef.current) {
        disconnectMobileSocket();
      }
    };
  }, []);

  function mapJoinError(code?: string, message?: string): string {
    if (code === 'PSEUDO_BAD_WORD') return 'Ce pseudo contient des mots inappropriés.';
    if (code === 'PSEUDO_DUPLICATE') return 'Ce pseudo est déjà pris.';
    if (code === 'SESSION_FINISHED') return 'Cette partie est terminée — à la prochaine séance !';
    if (code === 'SESSION_NOT_FOUND') return 'Session introuvable.';
    return message ?? 'Erreur lors de la connexion.';
  }

  async function handleJoin(
    pseudo: string,
    avatarId: string | null,
    pseudoSource: 'SUGGESTED' | 'CUSTOM' = 'CUSTOM',
  ) {
    setJoining(true);
    setError(null);

    const sock = getMobileSocket();

    try {
      if (!sock.connected) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('connect_timeout')), 8000);
          sock.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });
          sock.once('connect_error', () => {
            clearTimeout(timer);
            reject(new Error('connect_error'));
          });
          sock.connect();
        });
      }
    } catch {
      setError('Connexion au serveur impossible.');
      setJoining(false);
      return;
    }

    sock.emit(
      'player:join',
      {
        sessionSlugShort: slugShort,
        pseudo,
        pseudoSource,
        ...(avatarId ? { avatarId } : {}),
      },
      (ack: JoinAck | undefined) => {
        if (!ack || ack.ok !== true || !ack.playerId || !ack.resumeToken || !ack.sessionId) {
          setError(mapJoinError(ack?.code, ack?.message));
          setJoining(false);
          return;
        }

        joinedRef.current = true;

        usePlayerStore.getState().hydrate({
          playerId: ack.playerId,
          pseudo: ack.pseudo ?? pseudo,
          avatarUrl: ack.avatarUrl ?? null,
          resumeToken: ack.resumeToken,
          sessionId: ack.sessionId,
          slugShort,
          ...(session?.cinema.name ? { cinemaName: session.cinema.name } : {}),
          ...(session?.quiz.title ? { quizTitle: session.quiz.title } : {}),
          ...(session?.quiz.brandingJson ? { brandingJson: session.quiz.brandingJson } : {}),
          scoreTotal: ack.scoreTotal ?? 0,
          joinedQuestionPosition: ack.joinedQuestionPosition ?? null,
          stateSnapshot: ack.stateSnapshot ?? null,
        });

        router.push(`/play/${ack.sessionId}`);
      },
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center text-xl text-gray-300">{error}</div>
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
        <AppLogo className="mx-auto h-8" variant="light" />
        <h1 className="mt-4 text-2xl font-bold">Quiz au {session.cinema.name}</h1>
        <p className="mt-1 text-gray-400">{session.quiz.title}</p>
        {session.state !== 'lobby' && (
          <p className="text-brand-400 mt-2 text-sm">Partie en cours — rejoins-nous !</p>
        )}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-6">
        <PseudoInput sessionCode={slugShort} onSubmit={handleJoin} disabled={joining} />
        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
