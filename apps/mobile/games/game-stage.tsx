'use client';

import { useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { usePlayerStore } from '@/lib/stores/player-store';
import { sendGameAction } from '@/lib/game-actions';
import { getGameRenderer } from './registry';
import UnknownGame from './unknown-game';
import type { SendGameAction } from './types';

interface GameStageProps {
  socket: Socket | null;
}

/**
 * Rendu de la manche en cours : choisit le composant du moteur (`round.engineKey`) et lui passe
 * la dernière vue validée. Vue invalide ou moteur inconnu : repli, jamais d'erreur visible.
 */
export default function GameStage({ socket }: GameStageProps) {
  const round = usePlayerStore((s) => s.round);
  const gameView = usePlayerStore((s) => s.gameView);
  const gameViewInvalid = usePlayerStore((s) => s.gameViewInvalid);
  const clockOffsetMs = usePlayerStore((s) => s.clockOffsetMs);
  const roundId = round?.roundId ?? null;

  const sendAction = useCallback<SendGameAction>(
    (type, payload) => {
      if (!roundId) {
        return Promise.resolve({ ok: false, code: 'NO_ACTIVE_ROUND', message: 'No round' });
      }
      return sendGameAction(socket, roundId, type, payload);
    },
    [socket, roundId],
  );

  const Renderer = round ? getGameRenderer(round.engineKey) : null;
  if (!round || gameViewInvalid || !Renderer) {
    return <UnknownGame />;
  }
  if (gameView == null) {
    return <div className="flex flex-1 flex-col" />;
  }
  return (
    <div className="flex flex-1 flex-col">
      <Renderer
        round={round}
        view={gameView}
        clockOffsetMs={clockOffsetMs}
        sendAction={sendAction}
      />
    </div>
  );
}
