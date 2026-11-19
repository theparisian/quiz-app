import type { ComponentType } from 'react';
import type { AudioSlotKey, RoundInfo } from '@quiz-app/validation';

/** Props communes à tous les rendus de moteur sur l'écran cinéma (vue complète, validée). */
export interface GameRendererProps<View = unknown> {
  round: RoundInfo;
  view: View;
  /** `heure serveur - heure locale` (ms), pour `useCountdown`. */
  clockOffsetMs: number;
  /** Jamais fourni sur l'écran cinéma (aucune action depuis l'écran). */
  sendAction?: never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GameRenderer = ComponentType<GameRendererProps<any>>;

/** Schéma de vue d'un moteur (Zod) : seule la forme de `safeParse` est utilisée. */
export interface GameViewSchema {
  safeParse(value: unknown): {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  };
}

/** Un effet sonore à jouer `delayMs` après l'instant présent. */
export interface SfxPlan {
  slot: AudioSlotKey;
  delayMs: number;
}

/**
 * Règles d'écran d'un moteur, sans JSX (lues par le store, la page et le directeur audio, et
 * testables hors navigateur). Toutes reçoivent une vue déjà validée par le schéma du moteur.
 */
export interface ScreenGameRules<View = unknown> {
  /**
   * La vue laisse l'écran de lobby de la plateforme affiché (ex. compte à rebours d'avant la
   * première question du quiz) : ni `GameStage` ni musique de jeu.
   */
  showsLobby(view: View): boolean;
  /**
   * Étape de la manche : les sons d'entrée (`sfxOnEnter`) sont joués quand elle change, et les
   * sons encore en attente de l'étape précédente sont annulés.
   */
  stageKey(view: View): string;
  sfxOnEnter(view: View): SfxPlan[];
  /**
   * Son calé sur une échéance de la vue (ex. dernières secondes). `key` identifie l'occurrence :
   * le directeur ne la joue qu'une fois même si la vue est réémise. Null s'il n'y a rien à
   * programmer (pause, échéance passée, phase sans échéance).
   */
  timedSfx(view: View, clockOffsetMs: number, localNow: number): (SfxPlan & { key: string }) | null;
  /** Son déclenché par un cue (`game:cue`) ; null si le cue n'a pas de son. */
  sfxForCue(cue: string, data: unknown): AudioSlotKey | null;
}
