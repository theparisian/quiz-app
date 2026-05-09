'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { getPlayerSocket, disconnectPlayerSocket } from '@/lib/socket';
import { useNucStore } from '@/lib/stores/nuc-store';
import { useNucEvents } from './use-nuc-events';
import { startHeartbeat, stopHeartbeat } from '@/lib/heartbeat';
import { api } from '@/lib/api';

export function useNucInit(): void {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const initRef = useRef(false);

  useNucEvents(socket);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const nucUid = localStorage.getItem('nuc_uid');
    if (!nucUid) {
      router.replace('/error?reason=not_provisioned');
      return;
    }

    const sock = getPlayerSocket();
    setSocket(sock);
    const setConnectionStatus = useNucStore.getState().setConnectionStatus;

    function requestResumeAfterScreen(response: {
      ok: boolean;
      screenId: string;
      currentSession?: { sessionId: string; slugShort: string; state: string } | null;
    }) {
      if (!response.ok) return;
      const sid =
        useNucStore.getState().sessionId ??
        (response.currentSession ? response.currentSession.sessionId : undefined);
      if (sid) {
        sock.emit('nuc:resume', { nucUid, sessionId: sid });
      } else {
        sock.emit('nuc:resume', { nucUid });
      }
    }

    sock.on('connect', () => {
      setConnectionStatus('connected');
      sock.emit(
        'nuc:join_screen',
        { nucId: nucUid },
        (response: {
          ok: boolean;
          screenId: string;
          currentSession?: { sessionId: string; slugShort: string; state: string } | null;
        }) => {
          if (!response.ok) return;

          useNucStore.getState().setNucContext({
            nucId: nucUid,
            screenId: response.screenId,
            cinemaSlug: '',
          });

          void loadCinemaInfo(response.screenId);

          if (response.currentSession) {
            const { sessionId, slugShort } = response.currentSession;
            useNucStore.getState().setSessionContext({ sessionId, slugShort });

            sock.emit('nuc:join', { sessionId }, () => {});
          }

          requestResumeAfterScreen(response);
        },
      );
    });

    sock.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    sock.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    sock.on('screen:session_started', (payload: { sessionId: string; slugShort: string }) => {
      useNucStore.getState().setSessionContext({
        sessionId: payload.sessionId,
        slugShort: payload.slugShort,
      });

      sock.emit('nuc:join', { sessionId: payload.sessionId }, () => {});
      sock.emit('nuc:resume', { nucUid, sessionId: payload.sessionId });
    });

    startHeartbeat(() => {
      router.replace('/error?reason=heartbeat_failed');
    });

    sock.connect();

    return () => {
      stopHeartbeat();
      disconnectPlayerSocket();
      setConnectionStatus('disconnected');
    };
  }, [router]);
}

async function loadCinemaInfo(screenId: string) {
  try {
    const data = await api.get<{
      cinema: {
        name: string;
        slug: string;
        logoUrl: string | null;
        backgroundMusicUrl: string | null;
      };
    }>(`/api/screens/${screenId}/cinema`);

    useNucStore.getState().setNucContext({
      nucId: useNucStore.getState().nucId!,
      screenId,
      cinemaSlug: data.cinema.slug,
      cinemaName: data.cinema.name,
      cinemaLogoUrl: data.cinema.logoUrl,
      backgroundMusicUrl: data.cinema.backgroundMusicUrl,
    });
  } catch {
    // Cinema info not critical, continue with defaults
  }
}
