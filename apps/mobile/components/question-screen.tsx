'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { resolveMediaUrl } from '@/lib/media-url';
import { AppLogo } from '@quiz-app/ui';
import type { Socket } from 'socket.io-client';
import AnswerButton from './answer-button';
import QuestionProgressBar from './question-progress-bar';

interface QuestionScreenProps {
  socket: Socket | null;
}

const POSITIONS = ['A', 'B', 'C', 'D'] as const;

export default function QuestionScreen({ socket }: QuestionScreenProps) {
  const currentQuestionPosition = usePlayerStore((s) => s.currentQuestionPosition);
  const totalQuestions = usePlayerStore((s) => s.totalQuestions);
  const currentQuestionId = usePlayerStore((s) => s.currentQuestionId);
  const currentQuestionText = usePlayerStore((s) => s.currentQuestionText);
  const currentQuestionImageUrl = usePlayerStore((s) => s.currentQuestionImageUrl);
  const currentAnswers = usePlayerStore((s) => s.currentAnswers);
  const answerMap = usePlayerStore((s) => s.answerMap);
  const selectAnswer = usePlayerStore((s) => s.selectAnswer);

  function handleTap(position: (typeof POSITIONS)[number]) {
    if (!socket || !currentQuestionId) return;
    const answerId = answerMap[position];
    if (!answerId) return;

    socket.emit('player:submit_answer', {
      questionId: currentQuestionId,
      answerId,
    });

    selectAnswer(answerId, position);
  }

  const answersByPosition = Object.fromEntries(currentAnswers.map((a) => [a.position, a.text]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col items-center px-4 pb-3 pt-4">
        <AppLogo className="h-8" variant="light" />
        {currentQuestionPosition != null && totalQuestions > 0 && (
          <>
            <QuestionProgressBar
              current={currentQuestionPosition}
              total={totalQuestions}
              className="mt-4 w-[85%]"
            />
            <p className="mt-2 text-sm text-gray-400">
              Question {currentQuestionPosition} / {totalQuestions}
            </p>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pt-6">
        {currentQuestionText && (
          <h2 className="max-w-full text-center text-xl font-bold leading-snug">
            {currentQuestionText}
          </h2>
        )}

        {currentQuestionImageUrl && (
          <img
            src={resolveMediaUrl(currentQuestionImageUrl) ?? undefined}
            alt=""
            className="mt-4 max-h-32 rounded-xl object-contain"
          />
        )}
      </div>

      <div
        className="flex shrink-0 flex-col gap-2.5 px-4 pb-4 pt-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {POSITIONS.map((pos) => (
          <AnswerButton
            key={pos}
            position={pos}
            text={answersByPosition[pos] ?? pos}
            onTap={() => handleTap(pos)}
          />
        ))}
      </div>
    </div>
  );
}
