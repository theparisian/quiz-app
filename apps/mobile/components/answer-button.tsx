'use client';

import { ANSWER_COLORS, answerRevealDelayMs } from '@quiz-app/design-tokens';

interface AnswerButtonProps {
  position: 'A' | 'B' | 'C' | 'D';
  text: string;
  onTap: () => void;
  disabled?: boolean;
  index?: number;
}

export default function AnswerButton({
  position,
  text,
  onTap,
  disabled,
  index = 0,
}: AnswerButtonProps) {
  const color = ANSWER_COLORS[position];
  const revealDelayMs = answerRevealDelayMs(position, index);

  return (
    <button
      onClick={onTap}
      disabled={disabled}
      className="animate-answer-reveal flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-white opacity-0 transition-transform active:scale-[0.98] disabled:opacity-40"
      style={{
        backgroundColor: color.bg,
        touchAction: 'manipulation',
        userSelect: 'none',
        minHeight: '56px',
        animationDelay: `${revealDelayMs}ms`,
      }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/20 text-lg font-black">
        {position}
      </span>
      <span className="min-w-0 flex-1 text-base font-semibold leading-snug">{text}</span>
    </button>
  );
}
