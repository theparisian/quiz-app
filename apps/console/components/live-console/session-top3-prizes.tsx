'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';

interface Top3Prize {
  prizeId: string;
  playerId: string;
  rank: number;
  label: string;
  shortCode: string;
  emailSentAt: string | null;
  redeemedAt: string | null;
  hasPlayerEmail: boolean;
}

interface SessionPrizesResponse {
  top3Prizes: Top3Prize[];
}

function prizeStatusLabel(p: Top3Prize): string {
  if (p.redeemedAt) {
    return `Utilisé ✓ (${new Date(p.redeemedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
  }
  if (!p.hasPlayerEmail) return 'Email non saisi';
  if (p.emailSentAt) return 'Email envoyé ✓';
  return "Échec d'envoi ⚠";
}

export function SessionTop3Prizes({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const finalScoreboard = useLiveSessionStore((s) => s.finalScoreboard);

  const q = useQuery({
    queryKey: ['session-top3-prizes', sessionId],
    queryFn: () => api.get<SessionPrizesResponse>(`/api/sessions/${sessionId}/full`),
    enabled: !!sessionId,
  });

  const resendMut = useMutation({
    mutationFn: (prizeId: string) => api.post(`/api/prizes/${prizeId}/resend-email`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['session-top3-prizes', sessionId] }),
  });

  const prizes = q.data?.top3Prizes ?? [];
  if (prizes.length === 0) return null;

  return (
    <div className="w-full max-w-lg">
      <h3 className="text-sm font-medium text-gray-700">Lots podium</h3>
      <div className="mt-2 space-y-2">
        {prizes.map((p) => {
          const player = finalScoreboard?.find((s) => s.playerId === p.playerId);
          return (
            <div key={p.prizeId} className="rounded-lg border bg-white px-4 py-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  #{p.rank} {player?.pseudo ?? 'Joueur'}
                </span>
                <span className="font-mono text-xs text-gray-500">{p.shortCode}</span>
              </div>
              <p className="mt-1 text-gray-600">{p.label}</p>
              <p className="mt-1 text-xs text-gray-500">{prizeStatusLabel(p)}</p>
              {p.hasPlayerEmail && !p.redeemedAt && (
                <button
                  type="button"
                  disabled={resendMut.isPending}
                  onClick={() => {
                    if (confirm("Renvoyer l'email du lot ?")) resendMut.mutate(p.prizeId);
                  }}
                  className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  Renvoyer l&apos;email
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Link
        href={`/sessions/${sessionId}`}
        className="mt-2 inline-block text-xs text-blue-600 hover:underline"
      >
        Détail session →
      </Link>
    </div>
  );
}
