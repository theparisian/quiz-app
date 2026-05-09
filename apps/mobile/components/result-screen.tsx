'use client';

import { usePlayerStore } from '@/lib/stores/player-store';

export default function ResultScreen() {
  const lastQuestionResult = usePlayerStore((s) => s.lastQuestionResult);
  const scoreTotal = usePlayerStore((s) => s.scoreTotal);
  const currentRank = usePlayerStore((s) => s.currentRank);
  const selectedAnswerId = usePlayerStore((s) => s.selectedAnswerId);

  if (!lastQuestionResult) return null;

  const { isCorrect, pointsAwarded } = lastQuestionResult;
  const didNotAnswer = selectedAnswerId === null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      {didNotAnswer ? (
        <div className="rounded-2xl bg-gray-700 px-8 py-6 text-center">
          <div className="text-2xl font-bold">⏱ TROP TARD</div>
          <div className="mt-1 text-lg text-gray-400">+0 points</div>
        </div>
      ) : isCorrect ? (
        <div className="rounded-2xl bg-green-600/20 px-8 py-6 text-center">
          <div className="text-2xl font-bold text-green-400">✓ CORRECT</div>
          <div className="mt-1 text-lg text-green-300">+{pointsAwarded} points</div>
        </div>
      ) : (
        <div className="rounded-2xl bg-red-600/20 px-8 py-6 text-center">
          <div className="text-2xl font-bold text-red-400">✗ INCORRECT</div>
          <div className="mt-1 text-lg text-red-300">+0 points</div>
        </div>
      )}

      <div className="text-center">
        <div className="text-2xl font-bold">{scoreTotal} pts</div>
        <div className="text-gray-400">Score total</div>
      </div>

      {currentRank && (
        <div className="text-center text-gray-400">
          Position actuelle : <span className="font-bold text-white">#{currentRank}</span>
        </div>
      )}
    </div>
  );
}
