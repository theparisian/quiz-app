'use client';

import { ANSWER_COLORS } from '@quiz-app/design-tokens';

interface AnswerButtonProps {
  position: 'A' | 'B' | 'C' | 'D';
  onTap: () => void;
  disabled?: boolean;
}

export default function AnswerButton({ position, onTap, disabled }: AnswerButtonProps) {
  const color = ANSWER_COLORS[position];

  return (
    <button
      onClick={onTap}
      disabled={disabled}
      className="flex items-center justify-center rounded-2xl text-4xl font-black text-white transition-transform active:scale-95 disabled:opacity-40"
      style={{
        backgroundColor: color.bg,
        touchAction: 'manipulation',
        userSelect: 'none',
        minHeight: '120px',
      }}
    >
      {position}
    </button>
  );
}
