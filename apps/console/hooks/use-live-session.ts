'use client';

import { useEffect, useRef, useState } from 'react';
import { getConsoleSocket, disconnectConsoleSocket } from '@/lib/socket';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';

const SESSION_EVENTS = [
  'session:state_changed',
  'session:started',
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
  'session:lobby_timer_update',
  'player:joined',
  'player:left',
] as const;

export function useLiveSession(sessionId: string | null) {
  const [socketError, setSocketError] = useState<string | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 3;
  const connectionStatus = useLiveSessionStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!sessionId) return;

    const socket = getConsoleSocket();
    const applyEvent = useLiveSessionStore.getState().applyEvent;
    const applySocketSnapshot = useLiveSessionStore.getState().applySocketSnapshot;
    const setConnectionStatus = useLiveSessionStore.getState().setConnectionStatus;

    const onConnect = () => {
      setConnectionStatus('connected');
      setSocketError(null);
      retriesRef.current = 0;
      socket.emit('console:resume', { sessionId });
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const onReconnectAttempt = () => {
      setConnectionStatus('reconnecting');
    };

    const onSnapshot = (data: Record<string, unknown>) => {
      applySocketSnapshot(data);
    };

    const onError = (data: { code?: string; message?: string }) => {
      setSocketError(data.message ?? 'Socket error');
    };

    const onConnectError = () => {
      retriesRef.current += 1;
      if (retriesRef.current >= maxRetries) {
        setSocketError('Connexion impossible au serveur');
        socket.disconnect();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('session:state_snapshot', onSnapshot);
    socket.on('error', onError);
    socket.on('connect_error', onConnectError);

    for (const event of SESSION_EVENTS) {
      socket.on(event, (payload: unknown) => applyEvent(event, payload));
    }

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('session:state_snapshot', onSnapshot);
      socket.off('error', onError);
      socket.off('connect_error', onConnectError);

      for (const event of SESSION_EVENTS) {
        socket.off(event);
      }

      disconnectConsoleSocket();
      setConnectionStatus('disconnected');
    };
  }, [sessionId]);

  const connected = connectionStatus === 'connected';

  return { connected, connectionStatus, socketError };
}
