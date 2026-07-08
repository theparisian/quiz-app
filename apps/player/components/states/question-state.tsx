'use client';

import { useEffect, useState } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { pauseBackground, playSound } from '@/lib/audio';
import { ANSWER_COLORS } from '@quiz-app/design-tokens';
import AnswerCard from '@/components/shared/answer-card';
import QuizBackground from '@/components/shared/quiz-background';
import ScoreRow from '@/components/shared/score-row';
import TimerBar from '@/components/shared/timer-bar';

type FlowPhase = 'question' | 'reveal' | 'fade_out' | 'split';

const REVEAL_DURATION_MS = 2500;
const FADE_OUT_DURATION_MS = 500;

export default function QuestionState() {
  const uiState = useNucStore((s) => s.uiState);
  const currentQuestion = useNucStore((s) => s.currentQuestion);
  const currentQuestionPosition = useNucStore((s) => s.currentQuestionPosition);
  const totalQuestions = useNucStore((s) => s.totalQuestions);
  const questionStartedAt = useNucStore((s) => s.questionStartedAt);
  const questionTimeLimitMs = useNucStore((s) => s.questionTimeLimitMs);
  const answersSubmittedCount = useNucStore((s) => s.answersSubmittedCount);
  const answersTotal = useNucStore((s) => s.answersTotal);
  const quizAnswerDisplayStyle = useNucStore((s) => s.quizAnswerDisplayStyle);
  const lastResults = useNucStore((s) => s.lastResults);
  const previousScoreboard = useNucStore((s) => s.previousScoreboard);
  const nextQuestionInMs = useNucStore((s) => s.nextQuestionInMs);

  const [phase, setPhase] = useState<FlowPhase>('question');
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (uiState === 'question') {
      setPhase('question');
      pauseBackground();
      playSound('question-start');
    } else if (uiState === 'question_results') {
      if (!currentQuestion && lastResults) {
        setPhase('split');
      } else {
        setPhase('reveal');
      }
      playSound('question-end');
    }
  }, [uiState, currentQuestionPosition, currentQuestion, lastResults]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const timer = setTimeout(() => setPhase('fade_out'), REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fade_out') return;
    const timer = setTimeout(() => setPhase('split'), FADE_OUT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'split' || !nextQuestionInMs) return;
    let remaining = Math.ceil(nextQuestionInMs / 1000);
    setCountdown(remaining);
    const interval = setInterval(() => {
      remaining--;
      setCountdown(remaining > 0 ? remaining : null);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, nextQuestionInMs, currentQuestionPosition]);

  if (!currentQuestion && phase === 'question') return null;
  if (phase === 'split' && !lastResults) return null;

  const sortedAnswers = currentQuestion
    ? [...currentQuestion.answers].sort(
        (a, b) =>
          ['A', 'B', 'C', 'D'].indexOf(a.position) - ['A', 'B', 'C', 'D'].indexOf(b.position),
      )
    : [];

  const correctAnswerId = lastResults?.correctAnswerId ?? null;
  const correctAnswer = currentQuestion?.answers.find((a) => a.id === correctAnswerId);
  const correctColor = correctAnswer
    ? ANSWER_COLORS[correctAnswer.position as keyof typeof ANSWER_COLORS]?.bg
    : '#22c55e';

  const top5 = lastResults?.scoreboard.slice(0, 5) ?? [];
  const prevMap = new Map(previousScoreboard.map((e) => [e.playerId, e.scoreTotal]));

  const showQuestionLayout = phase === 'question' || phase === 'reveal' || phase === 'fade_out';
  const isRevealing = phase === 'reveal' || phase === 'fade_out';

  return (
    <div className="relative flex h-full flex-col">
      <QuizBackground />

      <div className="relative z-10 flex h-full flex-col">
        {showQuestionLayout && currentQuestion && (
          <div
            className={`flex h-full flex-col ${
              phase === 'fade_out' ? 'animate-content-fade-out pointer-events-none' : ''
            }`}
          >
            <div className="fixed right-16 top-4 z-20 flex flex-col items-end gap-3">
              {!isRevealing && (
                <TimerBar
                  startedAt={questionStartedAt ?? Date.now()}
                  totalMs={questionTimeLimitMs}
                />
              )}
              <div className="text-xl font-medium text-gray-300">
                Question {currentQuestionPosition} / {totalQuestions}
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-8 px-16">
              <h2 className="max-w-[80vw] text-center text-[clamp(28px,3.2vw,56px)] font-bold leading-tight">
                {currentQuestion.text}
              </h2>

              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt=""
                  className="max-h-[25vh] rounded-xl object-contain"
                />
              )}

              <div key={currentQuestion.id} className="grid w-full max-w-[90vw] grid-cols-2 gap-6">
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
                {answersSubmittedCount} / {answersTotal} réponses
              </div>
            </div>
          </div>
        )}

        {phase === 'split' && lastResults && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-center bg-white/5 py-4 text-xl font-medium text-gray-300">
              Question {currentQuestionPosition} / {totalQuestions}
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
                        scoreDiff={entry.scoreTotal - (prevMap.get(entry.playerId) ?? 0)}
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

                {lastResults.explanationText && (
                  <p
                    className="animate-slide-in-left max-w-lg text-center text-xl italic text-gray-400 opacity-0"
                    style={{ animationDelay: '0.3s' }}
                  >
                    {lastResults.explanationText}
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
    </div>
  );
}
