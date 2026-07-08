import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore } from './player-store';

describe('usePlayerStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it('should persist question text and answers from session:question_started', () => {
    usePlayerStore.getState().applyEvent('session:question_started', {
      questionId: '42',
      questionPosition: 2,
      questionText: 'Quelle est la capitale ?',
      questionImageUrl: '/media/q.png',
      answers: [
        { id: '1', position: 'A', text: 'Paris' },
        { id: '2', position: 'B', text: 'Lyon' },
        { id: '3', position: 'C', text: 'Marseille' },
        { id: '4', position: 'D', text: 'Bordeaux' },
      ],
      timeLimitMs: 15000,
    });

    const state = usePlayerStore.getState();
    expect(state.uiState).toBe('question_active');
    expect(state.currentQuestionPosition).toBe(2);
    expect(state.currentQuestionId).toBe('42');
    expect(state.currentQuestionText).toBe('Quelle est la capitale ?');
    expect(state.currentQuestionImageUrl).toBe('/media/q.png');
    expect(state.questionTimeLimitMs).toBe(15000);
    expect(state.answerMap).toEqual({ A: '1', B: '2', C: '3', D: '4' });
    expect(state.currentAnswers).toEqual([
      { id: '1', position: 'A', text: 'Paris' },
      { id: '2', position: 'B', text: 'Lyon' },
      { id: '3', position: 'C', text: 'Marseille' },
      { id: '4', position: 'D', text: 'Bordeaux' },
    ]);
  });

  it('should restore question text and answers from snapshot currentQuestion', () => {
    usePlayerStore.getState().applySnapshot({
      player: {
        playerId: 'p1',
        pseudo: 'Alice',
        scoreTotal: 0,
        currentRank: null,
      },
      session: {
        sessionId: 's1',
        slugShort: 'ABC123',
        state: 'running',
        totalQuestions: 5,
        totalPlayers: 3,
      },
      currentQuestion: {
        position: 1,
        questionId: '99',
        text: 'Quel film a gagné la Palme d or ?',
        imageUrl: null,
        timeLimitMs: 20000,
        remainingMs: 12000,
        alreadyAnsweredPosition: null,
        answers: [
          { id: '10', position: 'A', text: 'Anora' },
          { id: '11', position: 'B', text: 'The Brutalist' },
          { id: '12', position: 'C', text: 'Emilia Perez' },
          { id: '13', position: 'D', text: 'All We Imagine as Light' },
        ],
      },
    });

    const state = usePlayerStore.getState();
    expect(state.uiState).toBe('question_active');
    expect(state.currentQuestionText).toBe('Quel film a gagné la Palme d or ?');
    expect(state.currentAnswers.map((a) => a.text)).toEqual([
      'Anora',
      'The Brutalist',
      'Emilia Perez',
      'All We Imagine as Light',
    ]);
  });
});
