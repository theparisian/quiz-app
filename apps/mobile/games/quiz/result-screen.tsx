'use client';

import type { QuizMobileMe } from '@quiz-app/validation';

interface ResultScreenProps {
  result: NonNullable<QuizMobileMe['result']>;
  /** Le joueur n'a pas répondu à la question. */
  didNotAnswer: boolean;
}

export default function ResultScreen({ result, didNotAnswer }: ResultScreenProps) {
  const { isCorrect, points, scoreTotal, rank } = result;

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
          <div className="mt-1 text-lg text-green-300">+{points} points</div>
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

      {rank && (
        <div className="text-center text-gray-400">
          Position actuelle : <span className="font-bold text-white">#{rank}</span>
        </div>
      )}
    </div>
  );
}
