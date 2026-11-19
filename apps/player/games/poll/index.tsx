'use client';

import { useEffect, useState } from 'react';
import {
  ANSWER_COLORS,
  ANSWER_POSITIONS,
  TIMER_CRITICAL_THRESHOLD_SEC,
  TIMER_URGENT_THRESHOLD_SEC,
} from '@quiz-app/design-tokens';
import type { PollScreenView } from '@quiz-app/validation';
import { useCountdown } from '@quiz-app/ui';
import QuizBackground from '@/components/shared/quiz-background';
import type { GameRendererProps } from '../types';
import { pollBars } from './bars';

type ResultsView = Exclude<PollScreenView, { phase: 'question' }>;

/** Barre de temps horizontale, calculée depuis `endsAt` (60 i/s), figée en pause. */
function TimeBar({ view, clockOffsetMs }: { view: PollScreenView; clockOffsetMs: number }) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs, {
    mode: 'frame',
  });
  if (remainingMs === null) return null;
  const totalMs = view.question.durationMs;
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const color =
    seconds <= TIMER_CRITICAL_THRESHOLD_SEC
      ? '#ef4444'
      : seconds <= TIMER_URGENT_THRESHOLD_SEC
        ? '#f59e0b'
        : '#3b82f6';
  return (
    <div className="flex items-center gap-4">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 text-right text-2xl font-bold tabular-nums">{seconds}</span>
    </div>
  );
}

function ResultBars({ view }: { view: ResultsView }) {
  // Les barres partent de 0 puis s'allongent jusqu'à leur pourcentage.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [view.questionIndex]);

  return (
    <div className="mx-auto flex w-full max-w-[72vw] flex-col gap-5">
      {pollBars(view).map((bar, i) => (
        <div key={bar.optionId} className="flex items-center gap-5">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white"
            style={{ backgroundColor: bar.color }}
          >
            {bar.letter}
          </span>
          <div className="relative h-14 flex-1 overflow-hidden rounded-xl bg-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-xl transition-[width] duration-1000 ease-out"
              style={{
                width: shown ? `${bar.percent}%` : '0%',
                backgroundColor: bar.color,
                transitionDelay: `${i * 120}ms`,
              }}
            />
            <span className="relative z-10 flex h-full items-center px-5 text-xl font-semibold">
              {bar.text}
            </span>
          </div>
          <span className="w-24 text-right text-3xl font-black tabular-nums">{bar.percent} %</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Rendu écran cinéma du sondage : ne dépend que de la vue. Question en grand, options aux
 * couleurs des réponses (A à D), barre de temps et compteur de votes ; puis barres de résultats
 * animées avec pourcentages (la vue `done` garde les résultats de la dernière question).
 */
export default function PollScreenGame({ view, clockOffsetMs }: GameRendererProps<PollScreenView>) {
  const nextMs = useCountdown(
    view.phase === 'results' ? view.endsAt : null,
    view.phase === 'results' ? view.pausedRemainingMs : null,
    clockOffsetMs,
  );
  const nextSec = nextMs !== null && nextMs > 0 ? Math.ceil(nextMs / 1000) : null;
  const isLast = view.questionIndex + 1 >= view.totalQuestions;

  return (
    <div className="relative flex h-full flex-col">
      <QuizBackground />
      <div className="relative z-10 flex h-full flex-col gap-10 px-16 py-10">
        <div className="flex items-center justify-between text-xl font-medium text-gray-300">
          <span>Sondage</span>
          <span>
            Question {view.questionIndex + 1} / {view.totalQuestions}
          </span>
        </div>

        <h2
          key={view.question.id}
          className="animate-fade-in-up mx-auto max-w-[75vw] text-center text-[clamp(28px,3vw,52px)] font-bold leading-tight opacity-0"
        >
          {view.question.text}
        </h2>

        <div className="flex flex-1 flex-col justify-center">
          {view.phase === 'question' ? (
            <div className="mx-auto grid w-full max-w-[72vw] grid-cols-2 gap-5">
              {view.question.options.map((option, i) => {
                const letter = ANSWER_POSITIONS[i] ?? 'A';
                return (
                  <div
                    key={option.id}
                    className="animate-answer-reveal flex items-center gap-5 rounded-2xl px-6 py-5 text-white opacity-0"
                    style={{
                      backgroundColor: ANSWER_COLORS[letter].bg,
                      animationDelay: `${i * 150}ms`,
                    }}
                  >
                    <span className="text-3xl font-black">{letter}</span>
                    <span className="text-xl font-semibold">{option.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <ResultBars view={view} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          {view.phase === 'question' && <TimeBar view={view} clockOffsetMs={clockOffsetMs} />}
          <div className="text-center text-lg text-gray-400">
            {view.totalVotes} / {view.totalPlayers} votes
            {view.phase === 'results' && nextSec !== null && (
              <span>
                {' · '}
                {isLast ? `Résultats dans ${nextSec}…` : `Question suivante dans ${nextSec}…`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
