'use client';

import type { QuizQuestionView } from '@quiz-app/validation';
import { resolveMediaUrl } from '@/lib/media-url';
import { AppLogo } from '@quiz-app/ui';
import AnswerButton from './answer-button';
import QuestionProgressBar from './question-progress-bar';

interface QuestionScreenProps {
  question: QuizQuestionView;
  totalQuestions: number;
  onAnswer: (answerId: string, position: QuizPosition) => void;
  /** Message bref quand une réponse n'a pas été enregistrée (null sinon). */
  errorMessage?: string | null;
}

export type QuizPosition = 'A' | 'B' | 'C' | 'D';

export const QUIZ_POSITIONS = ['A', 'B', 'C', 'D'] as const;

export default function QuestionScreen({
  question,
  totalQuestions,
  onAnswer,
  errorMessage = null,
}: QuestionScreenProps) {
  const answersByPosition = Object.fromEntries(question.answers.map((a) => [a.position, a]));

  function handleTap(position: QuizPosition) {
    const answer = answersByPosition[position];
    if (!answer) return;
    onAnswer(answer.id, position);
  }

  return (
    <div className="flex flex-col">
      <header className="flex shrink-0 flex-col items-center px-4 pb-3 pt-4">
        <AppLogo className="h-8" variant="light" />
        {totalQuestions > 0 && (
          <>
            <QuestionProgressBar
              current={question.position}
              total={totalQuestions}
              className="mt-4 w-[85%]"
            />
            <p className="mt-2 text-sm text-gray-400">
              Question {question.position} / {totalQuestions}
            </p>
          </>
        )}
      </header>

      <div className="px-4 pb-6 pt-4">
        {question.text && (
          <h2 className="max-w-full text-center text-xl font-bold leading-snug">{question.text}</h2>
        )}

        {question.imageUrl && (
          <img
            src={resolveMediaUrl(question.imageUrl) ?? undefined}
            alt=""
            className="mt-4 max-h-32 rounded-xl object-contain"
          />
        )}

        <div
          key={question.id}
          className="mt-6 flex flex-col gap-2.5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {QUIZ_POSITIONS.map((pos, index) => (
            <AnswerButton
              key={pos}
              position={pos}
              index={index}
              text={answersByPosition[pos]?.text ?? pos}
              onTap={() => handleTap(pos)}
            />
          ))}
        </div>

        {errorMessage && (
          <p role="alert" className="text-center text-sm text-red-300">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
