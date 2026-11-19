import { describe, expect, it } from 'vitest';
import type { QuizScreenView } from '@quiz-app/validation';
import { TIMER_URGENT_THRESHOLD_SEC, answerRevealDelayMs } from '@quiz-app/design-tokens';
import { quizScreenRules } from './screen-rules';
import { musicSlotFor } from '@/lib/audio/music-plan';

const NOW = Date.parse('2026-11-19T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const QUESTION = {
  id: '42',
  position: 1,
  text: 'Q ?',
  imageUrl: null,
  timeLimitMs: 20000,
  answers: [
    { id: '1', position: 'A', text: 'a' },
    { id: '2', position: 'B', text: 'b' },
    { id: '3', position: 'C', text: 'c' },
  ],
};

const common = {
  questionIndex: 0,
  totalQuestions: 3,
  endsAt: iso(NOW + 20000),
  pausedRemainingMs: null,
  answeredCount: 0,
  totalPlayers: 2,
};

const question = { phase: 'question', ...common, question: QUESTION } as QuizScreenView;
const reveal = {
  phase: 'reveal',
  ...common,
  question: QUESTION,
  correctAnswerId: '1',
  explanation: null,
  revealedAt: iso(NOW),
  scoreboard: [],
} as QuizScreenView;
const countdown = {
  phase: 'countdown',
  ...common,
  questionIndex: -1,
  question: null,
} as QuizScreenView;
const done = { phase: 'done', ...common, endsAt: null, question: null } as QuizScreenView;

describe('quiz screen rules — sounds derived from the view', () => {
  it('question opening: questionStart then one answerReveal per answer, staggered', () => {
    expect(quizScreenRules.sfxOnEnter(question)).toEqual([
      { slot: 'questionStart', delayMs: 0 },
      { slot: 'answerReveal', delayMs: answerRevealDelayMs('A', 0) },
      { slot: 'answerReveal', delayMs: answerRevealDelayMs('B', 1) },
      { slot: 'answerReveal', delayMs: answerRevealDelayMs('C', 2) },
    ]);
  });

  it('reveal: questionEnd; countdown and done: nothing', () => {
    expect(quizScreenRules.sfxOnEnter(reveal)).toEqual([{ slot: 'questionEnd', delayMs: 0 }]);
    expect(quizScreenRules.sfxOnEnter(countdown)).toEqual([]);
    expect(quizScreenRules.sfxOnEnter(done)).toEqual([]);
  });

  it('stage key changes on phase or question, not on counter or pause re-emissions', () => {
    const k = quizScreenRules.stageKey(question);
    expect(quizScreenRules.stageKey({ ...question, answeredCount: 2 } as QuizScreenView)).toBe(k);
    expect(
      quizScreenRules.stageKey({
        ...question,
        endsAt: null,
        pausedRemainingMs: 5000,
      } as QuizScreenView),
    ).toBe(k);
    expect(quizScreenRules.stageKey(reveal)).not.toBe(k);
    expect(quizScreenRules.stageKey({ ...question, questionIndex: 1 } as QuizScreenView)).not.toBe(
      k,
    );
  });

  it('lastSeconds is scheduled from endsAt, corrected by the clock offset', () => {
    const plan = quizScreenRules.timedSfx(question, 0, NOW);
    expect(plan).toEqual({
      slot: 'lastSeconds',
      delayMs: 20000 - TIMER_URGENT_THRESHOLD_SEC * 1000,
      key: 'question:0',
    });
    // Horloge locale en retard de 1 s sur le serveur : il reste 1 s de moins.
    expect(quizScreenRules.timedSfx(question, 1000, NOW)?.delayMs).toBe(
      19000 - TIMER_URGENT_THRESHOLD_SEC * 1000,
    );
  });

  it('lastSeconds: nothing when paused, already past, or outside a question', () => {
    const paused = { ...question, endsAt: null, pausedRemainingMs: 8000 } as QuizScreenView;
    expect(quizScreenRules.timedSfx(paused, 0, NOW)).toBeNull();
    expect(quizScreenRules.timedSfx(question, 0, NOW + 16000)).toBeNull();
    expect(quizScreenRules.timedSfx(reveal, 0, NOW)).toBeNull();
  });

  it('only player_answered (with a pseudo) plays a sound from a cue', () => {
    const data = { playerId: '1', pseudo: 'Alice', avatarUrl: null };
    expect(quizScreenRules.sfxForCue('player_answered', data)).toBe('playerAnswered');
    expect(quizScreenRules.sfxForCue('player_answered', { ...data, pseudo: '' })).toBeNull();
    expect(quizScreenRules.sfxForCue('player_answered', { bad: true })).toBeNull();
    // Déduits de la vue : jamais rejoués depuis leur cue.
    expect(quizScreenRules.sfxForCue('question_opened', { questionIndex: 0 })).toBeNull();
    expect(quizScreenRules.sfxForCue('last_seconds', { questionIndex: 0 })).toBeNull();
    expect(quizScreenRules.sfxForCue('question_closed', { questionIndex: 0 })).toBeNull();
  });

  it('keeps the lobby on screen only during the countdown', () => {
    expect(quizScreenRules.showsLobby(countdown)).toBe(true);
    expect(quizScreenRules.showsLobby(question)).toBe(false);
    expect(quizScreenRules.showsLobby(reveal)).toBe(false);
    expect(quizScreenRules.showsLobby(done)).toBe(false);
  });
});

describe('music plan', () => {
  const all = () => true;
  it('follows what the screen displays', () => {
    expect(musicSlotFor('idle', false, all)).toBeNull();
    expect(musicSlotFor('aborted', false, all)).toBeNull();
    expect(musicSlotFor('lobby', false, all)).toBe('lobbyMusic');
    expect(musicSlotFor('game', false, all)).toBe('gameMusic');
    expect(musicSlotFor('round_end', false, all)).toBe('gameMusic');
    expect(musicSlotFor('final_results', false, all)).toBe('scoresMusic');
  });

  it('continuous music: first available slot, whatever the display', () => {
    const slot = musicSlotFor('game', true, (s) => s === 'gameMusic');
    expect(slot).toBe('gameMusic');
    expect(musicSlotFor('idle', true, all)).toBeNull();
  });
});
