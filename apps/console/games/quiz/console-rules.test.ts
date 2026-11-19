import { describe, expect, it } from 'vitest';
import type { QuizConsoleView } from '@quiz-app/validation';
import type { QuizFull } from '@/lib/stores/live-session-store';
import { quizConsoleRules, quizHighlightedAnswerIds } from './console-rules';

const QUESTION = {
  id: '42',
  position: 1,
  text: 'Capitale ?',
  imageUrl: null,
  timeLimitMs: 15000,
  answers: [
    { id: '1', position: 'A', text: 'Paris' },
    { id: '2', position: 'B', text: 'Lyon' },
  ],
};

const CONTENT: QuizFull = {
  id: '3',
  slug: 'quiz',
  title: 'Quiz',
  coverImageUrl: null,
  questions: [
    {
      id: '42',
      position: 1,
      text: 'Capitale ?',
      imageUrl: null,
      timeLimitSeconds: 15,
      pointsMax: 1000,
      pointsFloor: 100,
      explanation: null,
      answers: [
        { id: '1', position: 'A', text: 'Paris', isCorrect: true },
        { id: '2', position: 'B', text: 'Lyon', isCorrect: false },
      ],
    },
  ],
};

const common = {
  questionIndex: 0,
  totalQuestions: 3,
  endsAt: null,
  pausedRemainingMs: null,
  answeredCount: 0,
  totalPlayers: 2,
};

const question = { ...common, phase: 'question', question: QUESTION } as QuizConsoleView;
const reveal = {
  ...common,
  phase: 'reveal',
  question: QUESTION,
  correctAnswerId: '1',
  explanation: null,
  revealedAt: new Date().toISOString(),
  scoreboard: [],
} as QuizConsoleView;
const countdown = {
  ...common,
  questionIndex: -1,
  phase: 'countdown',
  question: null,
} as QuizConsoleView;

describe('quiz console rules', () => {
  it('highlights the correct answer during the question from the authenticated quiz content', () => {
    expect(quizHighlightedAnswerIds(question, CONTENT)).toEqual(['1']);
    // Contenu pas encore chargé : aucune bonne réponse inventée.
    expect(quizHighlightedAnswerIds(question, null)).toEqual([]);
  });

  it('uses the view correctAnswerId on reveal', () => {
    expect(
      quizHighlightedAnswerIds({ ...reveal, correctAnswerId: '2' } as QuizConsoleView, CONTENT),
    ).toEqual(['2']);
    expect(quizHighlightedAnswerIds(reveal, null)).toEqual(['1']);
  });

  it('progress label and force-advance availability', () => {
    expect(quizConsoleRules.progressLabel(countdown)).toBe('Question – / 3');
    expect(quizConsoleRules.progressLabel(question)).toBe('Question 1 / 3');
    expect(quizConsoleRules.canForceAdvance(question)).toBe(true);
    expect(quizConsoleRules.canForceAdvance(reveal)).toBe(false);
    expect(quizConsoleRules.canForceAdvance(countdown)).toBe(false);
    expect(quizConsoleRules.scoreboard(question)).toBeNull();
  });
});
