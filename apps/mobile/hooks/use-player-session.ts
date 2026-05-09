'use client';

import { useEffect, useState } from 'react';
import { getMobileSocket, disconnectMobileSocket } from '@/lib/socket';
import { usePlayerStore, type PlayerConnectionStatus } from '@/lib/stores/player-store';
import type { Socket } from 'socket.io-client';

const SESSION_EVENTS = [
  'session:started',
  'session:state_changed',
  'session:question_started',
  'session:timer_update',
  'session:answer_submitted_count',
  'session:question_ended',
  'session:next_question_in',
  'session:paused',
  'session:resumed',
  'session:audio_muted',
  'session:ended',
  'session:aborted',
  'player:joined',
  'player:left',
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

    const applyEvent = usePlayerStore.getState().applyEvent;
    const applySnapshot = usePlayerStore.getState().applySnapshot;
    const setConnectionStatus = usePlayerStore.getState().setConnectionStatus;

    function onConnect() {
      setConnectionStatus('connected');
      sock.emit('player:resume', { resumeToken, sessionId });
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

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.io.on('reconnect_attempt', onReconnectAttempt);
    sock.on('session:state_snapshot', onSnapshot);

    for (const event of SESSION_EVENTS) {
      sock.on(event, (payload: Record<string, unknown>) => {
        applyEvent(event, payload);
      });
    }

    sock.connect();

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.io.off('reconnect_attempt', onReconnectAttempt);
      sock.off('session:state_snapshot', onSnapshot);
      for (const event of SESSION_EVENTS) {
        sock.off(event);
      }
      disconnectMobileSocket();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [sessionId]);

  return { socket, connectionStatus };
}
