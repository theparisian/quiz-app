'use client';

import { ANSWER_COLORS } from '@quiz-app/design-tokens';
import type { QuizPosition } from './question-screen';

interface WaitingOthersProps {
  /** Position choisie (optimiste juste après le tap, puis celle de `view.me.answerId`). */
  position: QuizPosition | null;
}

export default function WaitingOthers({ position }: WaitingOthersProps) {
  const color = position ? ANSWER_COLORS[position].bg : '#666';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-xl font-semibold">Réponse enregistrée !</div>

      <div className="text-gray-400">Tu as choisi :</div>

      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black text-white"
        style={{ backgroundColor: color }}
      >
        {position}
      </div>

      <div className="text-gray-500">En attente des autres...</div>
    </div>
  );
}
