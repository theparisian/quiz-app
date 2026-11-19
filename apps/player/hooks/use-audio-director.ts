'use client';

import { useEffect, useRef } from 'react';
import { audioEngine } from '@/lib/audio/engine';
import { musicSlotFor } from '@/lib/audio/music-plan';
import { subscribeGameCues } from '@/lib/game-cues';
import { selectScreenDisplay, useNucStore } from '@/lib/stores/nuc-store';
import { getScreenRules } from '@/games/screen-rules';

/**
 * Directeur audio de l'écran cinéma : seul endroit qui décide quel son joue quand.
 *
 * - Musique : d'après ce que l'écran affiche (`selectScreenDisplay`) et la pause.
 * - Sons de jeu : dérivés de la vue par les règles d'écran du moteur
 *   (`games/<clé>/screen-rules.ts`) : à chaque changement d'étape (`stageKey` → `sfxOnEnter`)
 *   et sur une échéance (`timedSfx`). Seuls les sons qu'aucune vue ne permet de déduire
 *   viennent d'un cue (`sfxForCue`).
 * - `final` : fin de séance (plateforme).
 *
 * Pour brancher un nouveau son : son slot dans `AUDIO_SLOTS` (validation), puis la règle du
 * moteur concerné, ou un `audioEngine.playSfx('<slot>')` ici pour un son de plateforme.
 */
export function useAudioDirector(): void {
  const audio = useNucStore((s) => s.audio);
  const audioMuted = useNucStore((s) => s.audioMuted);
  const display = useNucStore(selectScreenDisplay);
  const isPaused = useNucStore((s) => s.isPaused);
  const backgroundMusicUrl = useNucStore((s) => s.backgroundMusicUrl);
  const round = useNucStore((s) => s.round);
  const gameView = useNucStore((s) => s.gameView);
  const gameViewInvalid = useNucStore((s) => s.gameViewInvalid);
  const clockOffsetMs = useNucStore((s) => s.clockOffsetMs);

  const roundId = round?.roundId ?? null;
  const engineKey = round?.engineKey ?? null;
  const inGame = display === 'game' && !gameViewInvalid && gameView != null;

  useEffect(() => {
    audioEngine.configure(audio);
    audioEngine.preloadSfx();
  }, [audio]);

  useEffect(() => {
    audioEngine.setMuted(audioMuted);
  }, [audioMuted]);

  // Musique de fond, pilotée par ce que l'écran affiche.
  useEffect(() => {
    if (isPaused) {
      audioEngine.pauseMusic();
      return;
    }

    const slot = musicSlotFor(display, audio?.continuousMusic ?? false, (s) =>
      audioEngine.hasCue(s),
    );
    if (slot) {
      audioEngine.playMusic(slot);
      return;
    }

    // Hors partie : on retombe sur la musique d'ambiance du cinéma si elle existe.
    if (display === 'idle' && backgroundMusicUrl) {
      audioEngine.playAmbientUrl(backgroundMusicUrl);
      return;
    }
    audioEngine.stopMusic();
  }, [display, isPaused, audio, backgroundMusicUrl]);

  // Sons d'entrée d'étape (ex. quiz : ouverture de question + réponses décalées, révélation).
  const stageKeyRef = useRef<string | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const rules = engineKey ? getScreenRules(engineKey) : null;
    const key = inGame && rules ? `${roundId}:${rules.stageKey(gameView)}` : null;
    if (key === stageKeyRef.current) return;
    stageKeyRef.current = key;
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    if (!key || !rules) return;
    for (const plan of rules.sfxOnEnter(gameView)) {
      if (plan.delayMs <= 0) {
        audioEngine.playSfx(plan.slot);
      } else {
        stageTimersRef.current.push(setTimeout(() => audioEngine.playSfx(plan.slot), plan.delayMs));
      }
    }
  }, [inGame, roundId, engineKey, gameView]);

  useEffect(
    () => () => {
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
    },
    [],
  );

  // Son calé sur une échéance (ex. quiz : dernières secondes), joué une seule fois.
  const firedTimedRef = useRef(new Set<string>());
  useEffect(() => {
    const rules = engineKey ? getScreenRules(engineKey) : null;
    if (!inGame || !rules) return;
    const plan = rules.timedSfx(gameView, clockOffsetMs, Date.now());
    if (!plan) return;
    const key = `${roundId}:${plan.key}`;
    if (firedTimedRef.current.has(key)) return;
    const timer = setTimeout(() => {
      firedTimedRef.current.add(key);
      audioEngine.playSfx(plan.slot);
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [inGame, roundId, engineKey, gameView, clockOffsetMs]);

  // Sons portés par un cue (ex. quiz : `player_answered`, un son par pseudo affiché).
  useEffect(
    () =>
      subscribeGameCues((cue) => {
        const slot = getScreenRules(cue.engineKey)?.sfxForCue(cue.cue, cue.data) ?? null;
        if (slot) audioEngine.playSfx(slot);
      }),
    [],
  );

  useEffect(() => {
    if (display === 'final_results') audioEngine.playSfx('final');
  }, [display]);
}
