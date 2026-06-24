'use client';

import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useNucStore } from '@/lib/stores/nuc-store';
import { setMuted } from '@/lib/audio';

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
  'session:lobby_timer_update',
  'player:joined',
  'player:left',
] as const;

export function useNucEvents(socket: Socket | null) {
  useEffect(() => {
    if (!socket) return;

    const applyEvent = useNucStore.getState().applyEvent;
    const applySnapshot = useNucStore.getState().applySnapshot;

    const handlers: Array<{ event: string; handler: (payload: Record<string, unknown>) => void }> =
      [];

    for (const event of SESSION_EVENTS) {
      const handler = (payload: Record<string, unknown>) => {
        applyEvent(event, payload);

        if (event === 'session:audio_muted') {
          setMuted(payload.muted as boolean);
        }
      };
      socket.on(event, handler);
      handlers.push({ event, handler });
    }

    const onSnapshot = (data: Record<string, unknown>) => {
      applySnapshot(data);
    };
    socket.on('session:state_snapshot', onSnapshot);

    return () => {
      for (const { event, handler } of handlers) {
        socket.off(event, handler);
      }
      socket.off('session:state_snapshot', onSnapshot);
    };
  }, [socket]);
}
