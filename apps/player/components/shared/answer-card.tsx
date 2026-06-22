'use client';

import { ANSWER_COLORS, type AnswerDisplayStyle } from '@quiz-app/design-tokens';

const ANSWER_POSITIONS = ['A', 'B', 'C', 'D'] as const;

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
  staggerDelayMs = 2000,
}: AnswerCardProps) {
  const color = ANSWER_COLORS[position];
  const isGlass = displayStyle === 'glass';
  const staggerIndex = ANSWER_POSITIONS.indexOf(position);
  const revealDelayMs = (staggerIndex >= 0 ? staggerIndex : index) * staggerDelayMs;

  return (
    <div
      className={`animate-answer-reveal flex items-center gap-6 rounded-2xl px-8 py-6 opacity-0 ${
        isGlass
          ? 'border border-white/25 bg-white/10 text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md'
          : 'text-white'
      }`}
      style={{
        backgroundColor: isGlass ? undefined : color.bg,
        animationDelay: `${revealDelayMs}ms`,
      }}
    >
      <span className="text-4xl font-black" style={isGlass ? { color: color.bg } : undefined}>
        {position}
      </span>
      <span className="text-2xl font-semibold">{text}</span>
    </div>
  );
}
