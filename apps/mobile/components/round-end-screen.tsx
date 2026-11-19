'use client';

import BreedingRhombusSpinner from '@/components/breeding-rhombus-spinner';
import WaitingLabel from '@/components/waiting-label';
import { usePlayerStore } from '@/lib/stores/player-store';

/** Fin d'une manche (`round:ended`) avant la suivante : score de la manche et rang. */
export default function RoundEndScreen() {
  const board = usePlayerStore((s) => s.roundScoreboard);
  const playerId = usePlayerStore((s) => s.playerId);

  const idx = board?.scoreboard.findIndex((e) => e.playerId === playerId) ?? -1;
  const mine = idx >= 0 ? board?.scoreboard[idx] : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      {board && (
        <div className="text-sm uppercase tracking-wide text-gray-400">
          Fin de la manche {board.position} / {board.totalRounds}
        </div>
      )}

      {mine ? (
        <>
          <div className="rounded-2xl bg-white/10 px-8 py-6">
            <div className="text-2xl font-bold">+{mine.scoreThisRound} points</div>
            <div className="mt-1 text-gray-400">sur cette manche</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{mine.scoreTotal} pts</div>
            <div className="text-gray-400">Score total</div>
          </div>
          <div className="text-gray-400">
            Position actuelle : <span className="font-bold text-white">#{idx + 1}</span>
          </div>
        </>
      ) : (
        <div className="text-2xl font-bold">Manche terminée !</div>
      )}

      <div className="mt-6 flex flex-col items-center">
        <BreedingRhombusSpinner />
        <WaitingLabel className="mt-10 text-gray-400">La suite arrive</WaitingLabel>
      </div>
    </div>
  );
}
