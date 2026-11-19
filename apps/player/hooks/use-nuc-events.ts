'use client';

import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useNucStore } from '@/lib/stores/nuc-store';

/**
 * Événements de plateforme et de manche appliqués au store. Le temps de jeu ne passe plus par
 * un tic serveur : les vues portent des échéances (`endsAt`) animées localement
 * (`useCountdown`). `game:cue` est filtré par le store puis relayé (`lib/game-cues.ts`).
 */
const SESSION_EVENTS = [
  'session:started',
  'session:paused',
  'session:resumed',
  'session:audio_muted',
  'session:ended',
  'session:aborted',
  'session:lobby_timer_update',
  'player:joined',
  'player:left',
  'round:started',
  'game:state',
  'game:cue',
  'round:ended',
] as const;

export function useNucEvents(socket: Socket | null) {
  useEffect(() => {
    if (!socket) return;

    const { applyEvent, applySnapshot } = useNucStore.getState();

    const handlers = SESSION_EVENTS.map((event) => {
      const handler = (payload: unknown) => {
        applyEvent(event, payload);
      };
      socket.on(event, handler);
      return [event, handler] as const;
    });

    const onSnapshot = (data: Record<string, unknown>) => {
      applySnapshot(data);
    };
    socket.on('session:state_snapshot', onSnapshot);

    return () => {
      for (const [event, handler] of handlers) {
        socket.off(event, handler);
      }
      socket.off('session:state_snapshot', onSnapshot);
    };
  }, [socket]);
}
