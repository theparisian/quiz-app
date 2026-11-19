'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import { useRoundDisplayProof } from '@/hooks/use-round-display-proof';
import { getGameRenderer } from './registry';
import UnknownGame from './unknown-game';

/**
 * Rendu de la manche en cours : choisit le composant du moteur (`round.engineKey`) et lui passe
 * la dernière vue validée. Vue invalide ou moteur inconnu : repli sobre, jamais d'erreur à
 * l'écran (le store a déjà signalé le problème à Sentry).
 * Quand le rendu du moteur est affiché, l'écran envoie la preuve de diffusion de la manche (C3).
 */
export default function GameStage() {
  const round = useNucStore((s) => s.round);
  const gameView = useNucStore((s) => s.gameView);
  const gameViewInvalid = useNucStore((s) => s.gameViewInvalid);
  const clockOffsetMs = useNucStore((s) => s.clockOffsetMs);

  const Renderer = round ? getGameRenderer(round.engineKey) : null;
  const rendered = !!round && !gameViewInvalid && !!Renderer && gameView != null;
  useRoundDisplayProof(rendered ? round.roundId : null);
  if (!round || gameViewInvalid || !Renderer) return <UnknownGame />;
  if (gameView == null) return null;
  // `key` : une nouvelle manche repart d'un rendu neuf (aucun état d'animation hérité).
  return (
    <Renderer key={round.roundId} round={round} view={gameView} clockOffsetMs={clockOffsetMs} />
  );
}
