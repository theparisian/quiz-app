'use client';

import { useEffect, useState } from 'react';
import { getMobileSocket, disconnectMobileSocket } from '@/lib/socket';
import { usePlayerStore, type PlayerConnectionStatus } from '@/lib/stores/player-store';
import type { Socket } from 'socket.io-client';

/** Événements de plateforme et de manche appliqués au store (`game:cue` : aucun sur mobile). */
const SESSION_EVENTS = [
  'session:state_changed',
  'session:paused',
  'session:resumed',
  'session:ended',
  'session:aborted',
  'player:joined',
  'player:left',
  'round:started',
  'game:state',
  'round:ended',
] as const;

export function usePlayerSession(sessionId: string | null): {
  socket: Socket | null;
  connectionStatus: PlayerConnectionStatus;
} {
  const [socket, setSocket] = useState<Socket | null>(null);
  const connectionStatus = usePlayerStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!sessionId) return;

    const playerId = localStorage.getItem('quiz_player_id');
    const resumeToken = localStorage.getItem('quiz_resume_token');
    if (!playerId || !resumeToken) return;

    const sock = getMobileSocket();
    setSocket(sock);

    const { applyEvent, applySnapshot, setConnectionStatus, markKicked } =
      usePlayerStore.getState();

    function resume() {
      sock.emit('player:resume', { resumeToken, sessionId });
    }

    function onConnect() {
      setConnectionStatus('connected');
      resume();
    }

    function onDisconnect() {
      setConnectionStatus('disconnected');
    }

    function onReconnectAttempt() {
      setConnectionStatus('reconnecting');
    }

    function onSnapshot(data: Record<string, unknown>) {
      applySnapshot(data);
    }

    function onError(err: { code?: string } | undefined) {
      if (err?.code === 'PLAYER_KICKED') markKicked();
    }

    const handlers = SESSION_EVENTS.map((event) => {
      const handler = (payload: unknown) => {
        applyEvent(event, payload);
        // Retiré de la séance alors qu'il est connecté (exclusion par le cinéma) : un resume
        // le confirme (`PLAYER_KICKED`) ou le remet dans la partie s'il n'était que reparti.
        if (
          event === 'player:left' &&
          (payload as { playerId?: string } | undefined)?.playerId === playerId
        ) {
          resume();
        }
      };
      sock.on(event, handler);
      return [event, handler] as const;
    });

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.io.on('reconnect_attempt', onReconnectAttempt);
    sock.on('session:state_snapshot', onSnapshot);
    sock.on('error', onError);

    // Socket déjà ouvert (transition depuis la page join) : 'connect' ne se redéclenche
    // pas, on lance donc le resume manuellement. Sinon on ouvre la connexion.
    if (sock.connected) {
      onConnect();
    } else {
      sock.connect();
    }

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.io.off('reconnect_attempt', onReconnectAttempt);
      sock.off('session:state_snapshot', onSnapshot);
      sock.off('error', onError);
      for (const [event, handler] of handlers) {
        sock.off(event, handler);
      }
      disconnectMobileSocket();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [sessionId]);

  return { socket, connectionStatus };
}
