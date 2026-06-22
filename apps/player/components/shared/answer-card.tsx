'use client';

import { ANSWER_COLORS, type AnswerDisplayStyle } from '@quiz-app/design-tokens';

interface AnswerCardProps {
  position: 'A' | 'B' | 'C' | 'D';
  text: string;
  index: number;
  displayStyle?: AnswerDisplayStyle;
  /** Délai entre chaque réponse (ms), appliqué selon l'index. */
  staggerDelayMs?: number;
}

export default function AnswerCard({
  position,
  text,
  index,
  displayStyle = 'multicolor',
  staggerDelayMs = 1500,
}: AnswerCardProps) {
  const color = ANSWER_COLORS[position];
  const isGlass = displayStyle === 'glass';

  return (
    <div
      className={`animate-answer-reveal flex items-center gap-6 rounded-2xl px-8 py-6 opacity-0 ${
        isGlass
          ? 'border border-white/25 bg-white/10 text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md'
          : 'text-white'
      }`}
      style={{
        backgroundColor: isGlass ? undefined : color.bg,
        animationDelay: `${index * staggerDelayMs}ms`,
      }}
    >
      <span className="text-4xl font-black" style={isGlass ? { color: color.bg } : undefined}>
        {position}
      </span>
      <span className="text-2xl font-semibold">{text}</span>
    </div>
  );
}
