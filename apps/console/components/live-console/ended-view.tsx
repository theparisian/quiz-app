'use client';

import Link from 'next/link';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';
import { SessionTop3Prizes } from './session-top3-prizes';

interface EndedViewProps {
  sessionId: string;
  onExit: () => void;
  exitLabel?: string;
}

export function EndedView({ sessionId, onExit, exitLabel }: EndedViewProps) {
  const finalScoreboard = useLiveSessionStore((s) => s.finalScoreboard);
  const winnerPlayerId = useLiveSessionStore((s) => s.winnerPlayerId);
  const consolationPrizesClaimed = useLiveSessionStore((s) => s.consolationPrizesClaimed);

  const winner = finalScoreboard?.find((p) => p.playerId === winnerPlayerId);
  const top10 = finalScoreboard?.slice(0, 10) ?? [];

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center">
        <p className="text-4xl">🏆</p>
        {winner && (
          <>
            <p className="mt-3 text-2xl font-bold text-gray-900">{winner.pseudo}</p>
            <p className="text-lg text-gray-600">{winner.scoreTotal} points</p>
          </>
        )}
      </div>

      {top10.length > 0 && (
        <div className="w-full max-w-lg">
          <h3 className="text-sm font-medium text-gray-700">Top 10</h3>
          <div className="mt-2 rounded-lg border bg-white">
            {top10.map((p, i) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-sm text-gray-600">
                  <span className="mr-3 inline-block w-6 text-right font-medium">#{i + 1}</span>
                  {p.pseudo}
                </span>
                <span className="font-mono text-sm text-gray-800">{p.scoreTotal} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SessionTop3Prizes sessionId={sessionId} />

      {consolationPrizesClaimed > 0 && (
        <p className="text-sm text-gray-600">
          Lots de consolation réclamés :{' '}
          <span className="font-semibold text-gray-900">{consolationPrizesClaimed}</span>
        </p>
      )}

      <div className="flex gap-4">
        <Link
          href={`/sessions/${sessionId}`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voir le détail
        </Link>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {exitLabel ?? 'Terminer'}
        </button>
      </div>
    </div>
  );
}
