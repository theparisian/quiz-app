'use client';

import { useEffect, useState } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { playSound } from '@/lib/audio';
import { ANSWER_COLORS } from '@quiz-app/design-tokens';
import ScoreRow from '@/components/shared/score-row';

export default function QuestionResultsState() {
  const currentQuestionPosition = useNucStore((s) => s.currentQuestionPosition);
  const totalQuestions = useNucStore((s) => s.totalQuestions);
  const currentQuestion = useNucStore((s) => s.currentQuestion);
  const lastResults = useNucStore((s) => s.lastResults);
  const previousScoreboard = useNucStore((s) => s.previousScoreboard);
  const nextQuestionInMs = useNucStore((s) => s.nextQuestionInMs);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    playSound('question-end');
  }, [currentQuestionPosition]);

  useEffect(() => {
    if (!nextQuestionInMs) return;
    let remaining = Math.ceil(nextQuestionInMs / 1000);
    setCountdown(remaining);
    const interval = setInterval(() => {
      remaining--;
      setCountdown(remaining > 0 ? remaining : null);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [nextQuestionInMs]);

  if (!lastResults || !currentQuestion) return null;

  const correctAnswer = currentQuestion.answers.find((a) => a.id === lastResults.correctAnswerId);
  const correctColor = correctAnswer
    ? ANSWER_COLORS[correctAnswer.position as keyof typeof ANSWER_COLORS]?.bg
    : '#3498DB';

  const top5 = lastResults.scoreboard.slice(0, 5);
  const prevMap = new Map(previousScoreboard.map((e) => [e.playerId, e.scoreTotal]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center bg-white/5 py-4 text-xl font-medium text-gray-300">
        Question {currentQuestionPosition} / {totalQuestions}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-16">
        <div className="text-2xl text-gray-400">La bonne réponse était :</div>

        {correctAnswer && (
          <div
            className="animate-glow-pulse rounded-2xl px-16 py-8 text-center text-4xl font-bold text-white"
            style={{ backgroundColor: correctColor, boxShadow: `0 0 30px ${correctColor}` }}
          >
            {correctAnswer.position} — {correctAnswer.text} ✓
          </div>
        )}

        {lastResults.explanationText && (
          <div className="max-w-3xl text-center text-xl italic text-gray-400">
            {lastResults.explanationText}
          </div>
        )}

        <div className="w-full max-w-2xl">
          <div className="mb-4 text-xl font-semibold text-gray-300">Top 5</div>
          <div className="space-y-2">
            {top5.map((entry, i) => (
              <ScoreRow
                key={entry.playerId}
                rank={i + 1}
                pseudo={entry.pseudo}
                scoreTotal={entry.scoreTotal}
                scoreDiff={entry.scoreTotal - (prevMap.get(entry.playerId) ?? 0)}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>

      {countdown !== null && (
        <div className="pb-8 text-center text-xl text-gray-400">
          Question suivante dans {countdown}...
        </div>
      )}
    </div>
  );
}
