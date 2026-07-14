'use client';

import {
  ANSWER_COLORS,
  type AnswerDisplayStyle,
  answerRevealDelayMs,
} from '@quiz-app/design-tokens';

type AnswerRevealStatus = 'neutral' | 'correct' | 'wrong';

interface AnswerCardProps {
  position: 'A' | 'B' | 'C' | 'D';
  text: string;
  index: number;
  displayStyle?: AnswerDisplayStyle;
  /** Délai entre chaque réponse (ms), appliqué selon l'index. */
  staggerDelayMs?: number;
  revealStatus?: AnswerRevealStatus;
}

const CORRECT_GREEN = '#22c55e';

export default function AnswerCard({
  position,
  text,
  index,
  displayStyle = 'multicolor',
  staggerDelayMs,
  revealStatus = 'neutral',
}: AnswerCardProps) {
  const color = ANSWER_COLORS[position];
  const isGlass = displayStyle === 'glass';
  const isCorrect = revealStatus === 'correct';
  const isWrong = revealStatus === 'wrong';
  const revealDelayMs = answerRevealDelayMs(position, index, staggerDelayMs);

  return (
    <div
      className={`flex items-center gap-5 rounded-2xl px-6 py-5 ${
        revealStatus === 'neutral' ? 'animate-answer-reveal opacity-0' : 'opacity-100'
      } ${isWrong ? 'opacity-30 transition-opacity duration-500' : ''} ${
        isCorrect ? 'animate-correct-highlight' : ''
      } ${
        isGlass
          ? `border text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md ${
              isCorrect ? 'border-green-400/60 bg-green-500/25' : 'border-white/25 bg-white/10'
            }`
          : 'text-white'
      }`}
      style={{
        backgroundColor: isGlass ? undefined : isCorrect ? CORRECT_GREEN : color.bg,
        animationDelay: revealStatus === 'neutral' ? `${revealDelayMs}ms` : undefined,
        transition: isCorrect && !isGlass ? 'background-color 0.5s ease' : undefined,
      }}
    >
      <span className="text-3xl font-black" style={isGlass ? { color: color.bg } : undefined}>
        {position}
      </span>
      <span className="text-xl font-semibold">{text}</span>
    </div>
  );
}
