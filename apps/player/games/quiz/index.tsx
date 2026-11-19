'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuizScreenView } from '@quiz-app/validation';
import { ANSWER_COLORS } from '@quiz-app/design-tokens';
import { useCountdown } from '@quiz-app/ui';
import { useNucStore } from '@/lib/stores/nuc-store';
import QuizBackground from '@/components/shared/quiz-background';
import ScoreRow from '@/components/shared/score-row';
import type { GameRendererProps } from '../types';
import AnswerCard from './answer-card';
import AnsweredFlashes from './answered-flashes';
import TimerBar from './timer-bar';

type FlowPhase = 'question' | 'reveal' | 'fade_out' | 'split' | 'split_fade_out' | 'split_done';

type RevealView = Extract<QuizScreenView, { phase: 'reveal' }>;
type ShownView = Exclude<QuizScreenView, { phase: 'done' }>;

const REVEAL_DURATION_MS = 2500;
const FADE_OUT_DURATION_MS = 500;

/** Étape de la séquence de révélation, calée sur `revealedAt` (une reprise saute à la bonne). */
function revealStep(view: RevealView, clockOffsetMs: number): { phase: FlowPhase; leftMs: number } {
  const revealedAt = Date.parse(view.revealedAt);
  const elapsed = Number.isFinite(revealedAt) ? Date.now() + clockOffsetMs - revealedAt : 0;
  if (elapsed < REVEAL_DURATION_MS)
    return { phase: 'reveal', leftMs: REVEAL_DURATION_MS - elapsed };
  if (elapsed < REVEAL_DURATION_MS + FADE_OUT_DURATION_MS) {
    return { phase: 'fade_out', leftMs: REVEAL_DURATION_MS + FADE_OUT_DURATION_MS - elapsed };
  }
  return { phase: 'split', leftMs: 0 };
}

/**
 * Rendu écran cinéma du quiz : ne dépend que de la vue (plus aucun état de jeu lu dans le
 * store ; seul l'habillage de séance, `quizAnswerDisplayStyle` et le fond, vient du store).
 * Séquence d'une question : question (timer à 60 i/s) → révélation de la bonne réponse
 * (2,5 s) → fondu → classement « split » avec le compte à rebours de la question suivante.
 */
export default function QuizScreenGame({ view, clockOffsetMs }: GameRendererProps<QuizScreenView>) {
  const quizAnswerDisplayStyle = useNucStore((s) => s.quizAnswerDisplayStyle);

  // Dernière révélation affichée : la vue `done` (fin de manche, quelques ms avant l'écran
  // final) garde le classement à l'écran au lieu d'un écran vide.
  const [lastReveal, setLastReveal] = useState<RevealView | null>(
    view.phase === 'reveal' ? view : null,
  );
  useEffect(() => {
    if (view.phase === 'reveal') setLastReveal(view);
  }, [view]);

  const reveal = view.phase === 'reveal' ? view : lastReveal;
  const shown: ShownView | null = view.phase === 'done' ? lastReveal : view;
  const currentQuestion = shown && shown.phase !== 'countdown' ? shown.question : null;

  const [phase, setPhase] = useState<FlowPhase>(() =>
    view.phase === 'reveal' ? revealStep(view, clockOffsetMs).phase : 'question',
  );
  const viewRef = useRef(view);
  viewRef.current = view;

  const questionRemainingMs = useCountdown(
    view.phase === 'question' ? view.endsAt : null,
    view.phase === 'question' ? view.pausedRemainingMs : null,
    clockOffsetMs,
    { mode: 'frame' },
  );
  const nextQuestionRemainingMs = useCountdown(
    view.phase === 'reveal' ? view.endsAt : null,
    view.phase === 'reveal' ? view.pausedRemainingMs : null,
    clockOffsetMs,
  );
  const countdown =
    nextQuestionRemainingMs !== null && nextQuestionRemainingMs > 0
      ? Math.ceil(nextQuestionRemainingMs / 1000)
      : null;

  const stage = `${view.phase}:${view.questionIndex}`;
  useEffect(() => {
    const current = viewRef.current;
    if (current.phase === 'question') {
      setPhase((prev) => {
        if (prev === 'split_done') return 'question';
        if (prev === 'split' || prev === 'split_fade_out') return 'split_fade_out';
        return 'question';
      });
    } else if (current.phase === 'reveal') {
      setPhase(revealStep(current, clockOffsetMs).phase);
    }
    // Changement d'étape seulement (pas à chaque vue : le compteur de réponses en réémet).
  }, [stage]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const current = viewRef.current;
    const leftMs =
      current.phase === 'reveal' ? revealStep(current, clockOffsetMs).leftMs : REVEAL_DURATION_MS;
    const timer = setTimeout(() => setPhase('fade_out'), Math.max(0, leftMs));
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fade_out') return;
    const timer = setTimeout(() => setPhase('split'), FADE_OUT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'split_fade_out') return;
    const timer = setTimeout(() => {
      setPhase(viewRef.current.phase === 'question' ? 'question' : 'split_done');
    }, FADE_OUT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'split' || countdown !== 1) return;
    setPhase('split_fade_out');
  }, [phase, countdown]);

  if (!currentQuestion && phase === 'question') return null;
  if ((phase === 'split' || phase === 'split_fade_out' || phase === 'split_done') && !reveal)
    return null;

  const sortedAnswers = currentQuestion
    ? [...currentQuestion.answers].sort(
        (a, b) =>
          ['A', 'B', 'C', 'D'].indexOf(a.position) - ['A', 'B', 'C', 'D'].indexOf(b.position),
      )
    : [];

  // Pendant la question, la vue ne contient pas la bonne réponse (elle n'arrive qu'en `reveal`).
  const correctAnswerId = shown?.phase === 'reveal' ? shown.correctAnswerId : null;
  const splitCorrectAnswerId = reveal?.correctAnswerId ?? null;
  const correctAnswer = reveal?.question.answers.find((a) => a.id === splitCorrectAnswerId);
  const correctColor = correctAnswer
    ? ANSWER_COLORS[correctAnswer.position as keyof typeof ANSWER_COLORS]?.bg
    : '#22c55e';

  const top5 = reveal?.scoreboard.slice(0, 5) ?? [];

  const showQuestionLayout =
    (phase === 'question' || phase === 'reveal' || phase === 'fade_out') && currentQuestion;
  const showSplitLayout =
    (phase === 'split' || phase === 'split_fade_out' || phase === 'split_done') && reveal;
  const isRevealing = phase === 'reveal' || phase === 'fade_out';
  const isSplitFadingOut = phase === 'split_fade_out';
  const isSplitHidden = phase === 'split_done';

  return (
    <div className="relative flex h-full flex-col">
      <QuizBackground />

      <div className="relative z-10 flex h-full flex-col">
        {showQuestionLayout && (
          <div
            className={`flex h-full flex-col ${
              phase === 'fade_out' ? 'animate-content-fade-out pointer-events-none' : ''
            }`}
          >
            <div className="fixed right-16 top-4 z-20 flex flex-col items-end gap-3">
              {!isRevealing && (
                <TimerBar
                  remainingMs={questionRemainingMs ?? currentQuestion.timeLimitMs}
                  totalMs={currentQuestion.timeLimitMs}
                />
              )}
              <div className="text-xl font-medium text-gray-300">
                Question {currentQuestion.position} / {shown?.totalQuestions}
              </div>
            </div>

            <div
              key={currentQuestion.id}
              className="animate-fade-in-up flex flex-1 flex-col items-center justify-center gap-12 px-16 opacity-0"
            >
              <h2 className="max-w-[70vw] text-center text-[clamp(24px,2.6vw,44px)] font-bold leading-tight">
                {currentQuestion.text}
              </h2>

              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt=""
                  className="max-h-[25vh] rounded-xl object-contain"
                />
              )}

              <div className="mx-auto grid w-full max-w-[68vw] grid-cols-2 gap-5">
                {sortedAnswers.map((answer, i) => {
                  let revealStatus: 'neutral' | 'correct' | 'wrong' = 'neutral';
                  if (isRevealing && correctAnswerId) {
                    revealStatus = answer.id === correctAnswerId ? 'correct' : 'wrong';
                  }

                  return (
                    <AnswerCard
                      key={answer.id}
                      position={answer.position as 'A' | 'B' | 'C' | 'D'}
                      text={answer.text}
                      index={i}
                      displayStyle={quizAnswerDisplayStyle}
                      revealStatus={revealStatus}
                    />
                  );
                })}
              </div>
            </div>

            <div className="px-16 pb-8">
              <div className="text-center text-lg text-gray-400">
                {shown?.answeredCount ?? 0} / {shown?.totalPlayers ?? 0} réponses
              </div>
            </div>
          </div>
        )}

        {showSplitLayout && (
          <div
            className={`flex h-full flex-col ${
              isSplitFadingOut ? 'animate-content-fade-out pointer-events-none' : ''
            } ${isSplitHidden ? 'pointer-events-none opacity-0' : ''}`}
          >
            <div className="flex items-center justify-center bg-white/5 py-4 text-xl font-medium text-gray-300">
              Question {reveal.question.position} / {reveal.totalQuestions}
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex w-1/2 flex-col border-r border-white/10 px-10 py-8">
                <h3 className="animate-slide-in-right mb-6 text-2xl font-semibold text-gray-300 opacity-0">
                  Top 5
                </h3>
                <div className="flex flex-1 flex-col justify-center gap-3">
                  {top5.map((entry, i) => (
                    <div
                      key={entry.playerId}
                      className="animate-slide-in-right opacity-0"
                      style={{ animationDelay: `${0.15 + i * 0.1}s` }}
                    >
                      <ScoreRow
                        rank={i + 1}
                        pseudo={entry.pseudo}
                        avatarUrl={entry.avatarUrl}
                        scoreTotal={entry.scoreTotal}
                        scoreDiff={entry.scoreThisQuestion}
                        index={0}
                        animated={false}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex w-1/2 flex-col items-center justify-center gap-6 px-10 py-8">
                <p className="animate-slide-in-left text-2xl text-gray-400 opacity-0">
                  La bonne réponse était :
                </p>

                {correctAnswer && (
                  <div
                    className="animate-slide-in-left rounded-2xl px-12 py-8 text-center text-3xl font-bold text-white opacity-0 shadow-2xl"
                    style={{
                      backgroundColor: correctColor,
                      boxShadow: `0 0 30px ${correctColor}`,
                      animationDelay: '0.15s',
                    }}
                  >
                    {correctAnswer.position} — {correctAnswer.text} ✓
                  </div>
                )}

                {reveal.explanation && (
                  <p
                    className="animate-slide-in-left max-w-lg text-center text-xl italic text-gray-400 opacity-0"
                    style={{ animationDelay: '0.3s' }}
                  >
                    {reveal.explanation}
                  </p>
                )}
              </div>
            </div>

            {countdown !== null && (
              <div className="pb-8 text-center text-xl text-gray-400">
                Question suivante dans {countdown}...
              </div>
            )}
          </div>
        )}
      </div>
      <AnsweredFlashes stageKey={stage} />
    </div>
  );
}
