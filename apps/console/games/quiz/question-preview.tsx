'use client';

import type { QuizQuestionView } from '@quiz-app/validation';

interface QuestionPreviewProps {
  question: QuizQuestionView;
  /**
   * Réponses à surligner : pendant la question, celles du quiz complet (`GET /:id/full`) ; en
   * révélation, `correctAnswerId` de la vue.
   */
  correctAnswerIds: string[];
  answeredCount: number;
  totalPlayers: number;
  /** Explication, en révélation seulement. */
  explanation: string | null;
}

export function QuestionPreview({
  question,
  correctAnswerIds,
  answeredCount,
  totalPlayers,
  explanation,
}: QuestionPreviewProps) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <p className="text-sm font-medium text-gray-500">{question.position}. Question</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{question.text}</p>

      {question.imageUrl && (
        <div className="mt-3">
          <img src={question.imageUrl} alt="" className="max-h-40 rounded-md object-contain" />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {question.answers.map((a) => {
          const isHighlighted = correctAnswerIds.includes(a.id);
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
        Réponses reçues : {answeredCount} / {totalPlayers}
      </p>

      {explanation && <p className="mt-2 text-sm italic text-gray-600">{explanation}</p>}
    </div>
  );
}
