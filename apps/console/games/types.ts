import type { ComponentType } from 'react';
import type { RoundInfo } from '@quiz-app/validation';

/**
 * Contenu de la séance chargé par la console via `GET /api/sessions/:id/full` (authentifié),
 * jamais par le socket : il peut contenir ce qu'aucune vue ne porte avant la révélation (ex. les
 * bonnes réponses du quiz, affichées au cinéma pendant la question). Null tant qu'il n'est pas
 * chargé ; un moteur qui n'en a pas besoin l'ignore.
 */
export type SessionContent = unknown;

/** Props communes à tous les rendus de moteur dans la console (vue complète, validée). */
export interface GameRendererProps<View = unknown, Content = SessionContent> {
  round: RoundInfo;
  view: View;
  /** `heure serveur - heure locale` (ms), pour `useCountdown`. */
  clockOffsetMs: number;
  /** Jamais fourni dans la console (le cinéma n'agit pas dans la manche). */
  sendAction?: never;
  content: Content | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GameRenderer = ComponentType<GameRendererProps<any, any>>;

/** Schéma de vue d'un moteur (Zod) : seule la forme de `safeParse` est utilisée. */
export interface GameViewSchema {
  safeParse(value: unknown): {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  };
}

/** Ligne de classement qui met à jour les scores de la liste des joueurs. */
export interface ConsoleScoreEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  scoreTotal: number;
}

/**
 * Règles console d'un moteur, sans JSX (lues par le store et les contrôles de plateforme, et
 * testables hors navigateur). Toutes reçoivent une vue déjà validée par le schéma du moteur.
 */
export interface ConsoleGameRules<View = unknown> {
  /** Progression affichée dans l'en-tête (ex. « Question 2 / 10 »). */
  progressLabel(view: View): string;
  /** Le bouton « Forcer la fin » (`force-advance`) a un effet dans cette vue. */
  canForceAdvance(view: View): boolean;
  /** Classement porté par la vue (scores à jour), ou null s'il n'y en a pas. */
  scoreboard(view: View): ConsoleScoreEntry[] | null;
}
