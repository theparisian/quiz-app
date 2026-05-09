'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

export function QuestionPreview() {
  const currentQuestion = useLiveSessionStore((s) => s.currentQuestion);
  const answersSubmittedCount = useLiveSessionStore((s) => s.answersSubmittedCount);
  const totalPlayers = useLiveSessionStore((s) => s.totalPlayers);
  const showingResults = useLiveSessionStore((s) => s.showingResults);
  const lastQuestionResults = useLiveSessionStore((s) => s.lastQuestionResults);

  if (!currentQuestion) return null;

  const correctAnswerId = showingResults ? lastQuestionResults?.correctAnswerId : null;

  return (
    <div className="rounded-lg border bg-white p-5">
      <p className="text-sm font-medium text-gray-500">{currentQuestion.position}. Question</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{currentQuestion.text}</p>

      {currentQuestion.imageUrl && (
        <div className="mt-3">
          <img
            src={currentQuestion.imageUrl}
            alt=""
            className="max-h-40 rounded-md object-contain"
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {currentQuestion.answers.map((a) => {
          const isCorrect = a.isCorrect;
          const isHighlighted = correctAnswerId ? a.id === correctAnswerId : isCorrect;
          return (
            <div
              key={a.id}
              className={`rounded-md border px-4 py-3 text-sm ${
                isHighlighted
                  ? 'border-green-300 bg-green-50 font-medium text-green-800'
                  : 'border-gray-200 text-gray-700'
              }`}
            >
              <span className="font-bold">{a.position}.</span> {a.text}
              {isHighlighted && <span className="ml-2">✓</span>}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-gray-500">
        Réponses reçues : {answersSubmittedCount} / {totalPlayers}
      </p>

      {showingResults && currentQuestion.explanation && (
        <p className="mt-2 text-sm italic text-gray-600">{currentQuestion.explanation}</p>
      )}
    </div>
  );
}
