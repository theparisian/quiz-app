'use client';

import { ANSWER_COLORS, ANSWER_POSITIONS } from '@quiz-app/design-tokens';

interface PollOptionProps {
  /** Rang de l'option (0 à 3) : lettre et couleur, comme les réponses du quiz. */
  index: number;
  text: string;
  onTap?: () => void;
  /** Après le vote : l'option choisie est surlignée, les autres atténuées. */
  state?: 'idle' | 'chosen' | 'dimmed';
  /** Résultats : pourcentage affiché et barre de fond. */
  percent?: number | null;
}

/** Option de sondage, sur le modèle du bouton de réponse du quiz. */
export default function PollOption({
  index,
  text,
  onTap,
  state = 'idle',
  percent = null,
}: PollOptionProps) {
  const letter = ANSWER_POSITIONS[index] ?? 'A';
  const color = ANSWER_COLORS[letter].bg;
  const showResult = percent !== null;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-left text-white transition active:scale-[0.98] ${
        state === 'dimmed' ? 'opacity-40' : ''
      } ${state === 'chosen' ? 'ring-4 ring-white' : ''}`}
      style={{
        backgroundColor: showResult ? 'rgba(255,255,255,0.08)' : color,
        touchAction: 'manipulation',
        userSelect: 'none',
        minHeight: '56px',
      }}
    >
      {showResult && (
        <span
          className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
          aria-hidden
        />
      )}
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/20 text-lg font-black">
        {letter}
      </span>
      <span className="relative min-w-0 flex-1 text-base font-semibold leading-snug">{text}</span>
      {showResult && <span className="relative text-lg font-black tabular-nums">{percent} %</span>}
    </button>
  );
}
