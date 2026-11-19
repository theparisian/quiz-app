'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';
import { getGameRenderer } from './registry';
import UnknownGame from './unknown-game';

/**
 * Zone de jeu de la console : choisit le composant du moteur (`round.engineKey`) et lui passe
 * la dernière vue validée, plus le contenu authentifié de la séance (`GET /:id/full`). Vue
 * invalide ou moteur inconnu : repli sobre (le store a déjà signalé le problème à Sentry).
 */
export function GameStage() {
  const round = useLiveSessionStore((s) => s.round);
  const gameView = useLiveSessionStore((s) => s.gameView);
  const gameViewInvalid = useLiveSessionStore((s) => s.gameViewInvalid);
  const clockOffsetMs = useLiveSessionStore((s) => s.clockOffsetMs);
  const content = useLiveSessionStore((s) => s.quiz);

  if (!round) return null;
  const Renderer = getGameRenderer(round.engineKey);
  if (gameViewInvalid || !Renderer) return <UnknownGame />;
  if (gameView == null) return null;
  // `key` : une nouvelle manche repart d'un rendu neuf.
  return (
    <Renderer
      key={round.roundId}
      round={round}
      view={gameView}
      clockOffsetMs={clockOffsetMs}
      content={content}
    />
  );
}
