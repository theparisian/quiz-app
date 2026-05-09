'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { ANSWER_COLORS } from '@quiz-app/design-tokens';

export default function WaitingOthers() {
  const selectedAnswerPosition = usePlayerStore((s) => s.selectedAnswerPosition);

  const color = selectedAnswerPosition ? ANSWER_COLORS[selectedAnswerPosition].bg : '#666';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-xl font-semibold">Réponse enregistrée !</div>

      <div className="text-gray-400">Tu as choisi :</div>

      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black text-white"
        style={{ backgroundColor: color }}
      >
        {selectedAnswerPosition}
      </div>

      <div className="text-gray-500">En attente des autres...</div>
    </div>
  );
}
