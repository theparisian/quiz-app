'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nucStatusChangedSchema } from '@quiz-app/validation';
import { getAdminSocket, disconnectAdminSocket } from '../lib/socket';

interface CinemaNucMonitorScreen {
  id: string;
  nucs: Array<{ id: string; status: string; lastSeenAt: string | null }>;
}

interface CinemaNucMonitorData {
  screens: CinemaNucMonitorScreen[];
}

export function useCinemaNucMonitor(slug: string, enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !slug) return;

    const socket = getAdminSocket();

    const onConnect = () => {
      socket.emit('admin:watch_cinema', { cinemaSlug: slug });
    };

    const onStatusChanged = (data: unknown) => {
      const parsed = nucStatusChangedSchema.safeParse(data);
      if (!parsed.success) return;

      const { nucId, status, screenId } = parsed.data;
      const lastSeenAt = new Date().toISOString();

      queryClient.setQueryData<CinemaNucMonitorData>(['cinema', slug], (old) => {
        if (!old) return old;
        return {
          ...old,
          screens: old.screens.map((screen) =>
            screen.id === screenId
              ? {
                  ...screen,
                  nucs: screen.nucs.map((nuc) =>
                    nuc.id === nucId ? { ...nuc, status, lastSeenAt } : nuc,
                  ),
                }
              : screen,
          ),
        };
      });
    };

    socket.on('connect', onConnect);
    socket.on('nuc:status_changed', onStatusChanged);
    socket.connect();

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('nuc:status_changed', onStatusChanged);
      disconnectAdminSocket();
    };
  }, [slug, enabled, queryClient]);
}
