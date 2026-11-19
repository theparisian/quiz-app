import type { ComponentType } from 'react';
import type { GameActionAck, RoundInfo } from '@quiz-app/validation';

/**
 * Action d'un joueur (`game:action`), avec accusé. Ne rejette jamais : un délai dépassé
 * (5 s) ou une absence de connexion donnent `{ ok: false, code: 'TIMEOUT' | 'NOT_CONNECTED' }`.
 */
export type SendGameAction = (type: string, payload: unknown) => Promise<GameActionAck>;

/** Props communes à tous les rendus de moteur (une vue complète, déjà validée). */
export interface GameRendererProps<View = unknown> {
  round: RoundInfo;
  view: View;
  /** `heure serveur - heure locale` (ms), pour `useCountdown`. */
  clockOffsetMs: number;
  sendAction?: SendGameAction;
}

/** Schéma de vue d'un moteur (Zod) : seule la forme de `safeParse` est utilisée. */
export interface GameViewSchema {
  safeParse(value: unknown): {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GameRenderer = ComponentType<GameRendererProps<any>>;
