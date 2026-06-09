'use client';

import { ANSWER_COLORS } from '@quiz-app/design-tokens';

interface AnswerCardProps {
  position: 'A' | 'B' | 'C' | 'D';
  text: string;
  index: number;
}

export default function AnswerCard({ position, text, index }: AnswerCardProps) {
  const color = ANSWER_COLORS[position];

  return (
    <div
      className="animate-cascade-in flex items-center gap-6 rounded-2xl px-8 py-6 text-white opacity-0"
      style={{
        backgroundColor: color.bg,
        animationDelay: `${index * 0.1}s`,
      }}
    >
      <span className="text-4xl font-black">{position}</span>
      <span className="text-2xl font-semibold">{text}</span>
    </div>
  );
}
