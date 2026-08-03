'use client';

import { useEffect, useRef } from 'react';
import {
  ANSWER_POSITIONS,
  TIMER_URGENT_THRESHOLD_SEC,
  answerRevealDelayMs,
  type AnswerPosition,
} from '@quiz-app/design-tokens';
import { CONTINUOUS_MUSIC_SLOTS, type AudioSlotKey } from '@quiz-app/validation';
import { audioEngine } from '@/lib/audio/engine';
import { useNucStore, type NucUiState } from '@/lib/stores/nuc-store';

/**
 * Directeur audio de l'écran cinéma : seul endroit qui décide quel son joue quand.
 *
 * Pour brancher un nouveau son, ajouter son slot dans `AUDIO_SLOTS` (validation)
 * puis un `audioEngine.playSfx('<slot>')` dans l'effet correspondant ici.
 */

function musicSlotFor(uiState: NucUiState, continuous: boolean): AudioSlotKey | null {
  if (uiState === 'idle' || uiState === 'aborted') return null;

  // Musique continue : une seule piste du lobby jusqu'aux scores, jamais relancée.
  if (continuous) {
    return CONTINUOUS_MUSIC_SLOTS.find((slot) => audioEngine.hasCue(slot)) ?? null;
  }

  switch (uiState) {
    case 'lobby':
      return 'lobbyMusic';
    case 'question':
    case 'question_results':
      return 'gameMusic';
    case 'final_results':
      return 'scoresMusic';
    default:
      return null;
  }
}

export function useAudioDirector(): void {
  const audio = useNucStore((s) => s.audio);
  const audioMuted = useNucStore((s) => s.audioMuted);
  const uiState = useNucStore((s) => s.uiState);
  const isPaused = useNucStore((s) => s.isPaused);
  const backgroundMusicUrl = useNucStore((s) => s.backgroundMusicUrl);
  const currentQuestionId = useNucStore((s) => s.currentQuestion?.id ?? null);
  const answersCount = useNucStore((s) => s.currentQuestion?.answers.length ?? 0);
  const questionStartedAt = useNucStore((s) => s.questionStartedAt);
  const questionTimeLimitMs = useNucStore((s) => s.questionTimeLimitMs);
  const answeredFlashes = useNucStore((s) => s.answeredFlashes);

  useEffect(() => {
    audioEngine.configure(audio);
    audioEngine.preloadSfx();
  }, [audio]);

  useEffect(() => {
    audioEngine.setMuted(audioMuted);
  }, [audioMuted]);

  // Musique de fond, pilotée par la phase affichée.
  useEffect(() => {
    if (isPaused) {
      audioEngine.pauseMusic();
      return;
    }

    const slot = musicSlotFor(uiState, audio?.continuousMusic ?? false);
    if (slot) {
      audioEngine.playMusic(slot);
      return;
    }

    // Hors quiz : on retombe sur la musique d'ambiance du cinéma si elle existe.
    if (uiState === 'idle' && backgroundMusicUrl) {
      audioEngine.playAmbientUrl(backgroundMusicUrl);
      return;
    }
    audioEngine.stopMusic();
  }, [uiState, isPaused, audio, backgroundMusicUrl]);

  // Ouverture de question + apparition décalée des réponses.
  useEffect(() => {
    if (uiState !== 'question' || !currentQuestionId) return;
    audioEngine.playSfx('questionStart');

    const timers = ANSWER_POSITIONS.slice(0, answersCount).map((position, index) =>
      setTimeout(
        () => audioEngine.playSfx('answerReveal'),
        answerRevealDelayMs(position as AnswerPosition, index),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [uiState, currentQuestionId, answersCount]);

  // Dernières secondes : calé sur le même repère temporel que l'animation du timer.
  useEffect(() => {
    if (uiState !== 'question' || !currentQuestionId || questionStartedAt == null) return;
    const fireAt = questionStartedAt + questionTimeLimitMs - TIMER_URGENT_THRESHOLD_SEC * 1000;
    const delay = fireAt - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => audioEngine.playSfx('lastSeconds'), delay);
    return () => clearTimeout(timer);
  }, [uiState, currentQuestionId, questionStartedAt, questionTimeLimitMs]);

  useEffect(() => {
    if (uiState === 'question_results') audioEngine.playSfx('questionEnd');
  }, [uiState, currentQuestionId]);

  useEffect(() => {
    if (uiState === 'final_results') audioEngine.playSfx('final');
  }, [uiState]);

  // Un SFX par nouveau pseudo affiché, jamais rejoué pour une occurrence déjà vue.
  const playedFlashes = useRef(new Set<string>());
  useEffect(() => {
    const keys = new Set(answeredFlashes.map((f) => f.key));
    for (const flash of answeredFlashes) {
      if (playedFlashes.current.has(flash.key)) continue;
      playedFlashes.current.add(flash.key);
      audioEngine.playSfx('playerAnswered');
    }
    for (const key of playedFlashes.current) {
      if (!keys.has(key)) playedFlashes.current.delete(key);
    }
  }, [answeredFlashes]);
}
