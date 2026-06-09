'use client';

import {
  ANSWER_COLORS,
  ANSWER_DISPLAY_STYLES,
  type AnswerDisplayStyle,
} from '@quiz-app/design-tokens';

interface QuizAnswerStylePickerProps {
  value: AnswerDisplayStyle;
  onChange: (style: AnswerDisplayStyle) => void;
  disabled?: boolean;
}

function MiniAnswerCard({
  position,
  style,
}: {
  position: keyof typeof ANSWER_COLORS;
  style: AnswerDisplayStyle;
}) {
  const color = ANSWER_COLORS[position];
  const isGlass = style === 'glass';

  return (
    <div
      className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        isGlass
          ? 'border border-white/25 bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-md'
          : 'text-white'
      }`}
      style={{ backgroundColor: isGlass ? undefined : color.bg }}
    >
      <span className="font-black" style={isGlass ? { color: color.bg } : undefined}>
        {position}
      </span>
      <span className="truncate font-medium">Réponse</span>
    </div>
  );
}

export function QuizAnswerStylePicker({ value, onChange, disabled }: QuizAnswerStylePickerProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">Style des réponses (écran cinéma)</p>
      <p className="text-xs text-gray-500">
        Apparence des 4 cartes de réponse affichées pendant les questions.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ANSWER_DISPLAY_STYLES.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="text-sm font-semibold text-gray-900">{option.label}</span>
              <div className="relative mt-3 overflow-hidden rounded-lg bg-gray-950 p-3">
                <div className="grid grid-cols-2 gap-2">
                  {(['A', 'B', 'C', 'D'] as const).map((pos) => (
                    <MiniAnswerCard key={pos} position={pos} style={option.value} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
