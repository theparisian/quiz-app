'use client';

import { useEffect } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { pauseBackground, playSound } from '@/lib/audio';
import AnswerCard from '@/components/shared/answer-card';
import QuizBackground from '@/components/shared/quiz-background';
import TimerBar from '@/components/shared/timer-bar';

export default function QuestionState() {
  const currentQuestion = useNucStore((s) => s.currentQuestion);
  const currentQuestionPosition = useNucStore((s) => s.currentQuestionPosition);
  const totalQuestions = useNucStore((s) => s.totalQuestions);
  const questionStartedAt = useNucStore((s) => s.questionStartedAt);
  const questionTimeLimitMs = useNucStore((s) => s.questionTimeLimitMs);
  const answersSubmittedCount = useNucStore((s) => s.answersSubmittedCount);
  const answersTotal = useNucStore((s) => s.answersTotal);
  const quizAnswerDisplayStyle = useNucStore((s) => s.quizAnswerDisplayStyle);

  useEffect(() => {
    pauseBackground();
    playSound('question-start');
  }, [currentQuestionPosition]);

  if (!currentQuestion) return null;

  return (
    <div className="relative flex h-full flex-col">
      <QuizBackground />
      <div className="relative z-10 flex h-full flex-col">
        <div className="fixed right-16 top-4 z-20 text-xl font-medium text-gray-300">
          Question {currentQuestionPosition} / {totalQuestions}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-16">
          <h2 className="max-w-[80vw] text-center text-[clamp(28px,3.2vw,56px)] font-bold leading-tight">
            {currentQuestion.text}
          </h2>

          {currentQuestion.imageUrl && (
            <img
              src={currentQuestion.imageUrl}
              alt=""
              className="max-h-[25vh] rounded-xl object-contain"
            />
          )}

          <div key={currentQuestion.id} className="grid w-full max-w-[90vw] grid-cols-2 gap-6">
            {currentQuestion.answers.map((answer, i) => (
              <AnswerCard
                key={answer.id}
                position={answer.position as 'A' | 'B' | 'C' | 'D'}
                text={answer.text}
                index={i}
                displayStyle={quizAnswerDisplayStyle}
              />
            ))}
          </div>
        </div>

        <div className="px-16 pb-8">
          <TimerBar startedAt={questionStartedAt ?? Date.now()} totalMs={questionTimeLimitMs} />
          <div className="mt-4 text-center text-lg text-gray-400">
            {answersSubmittedCount} / {answersTotal} réponses
          </div>
        </div>
      </div>
    </div>
  );
}
