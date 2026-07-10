'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ActiveSessionItem {
  id: string;
  slugShort: string;
  state: string;
  quizTitle: string;
  screenId: string;
  screenName: string;
  totalPlayers: number;
  createdAt: string;
}

interface SessionListResponse {
  items: ActiveSessionItem[];
  total: number;
}

const LIVE_STATES = ['lobby', 'running', 'paused'] as const;

export function useActiveSessions(cinemaSlug: string | null) {
  return useQuery<ActiveSessionItem[]>({
    queryKey: ['active-sessions', cinemaSlug],
    queryFn: async () => {
      const results = await Promise.all(
        LIVE_STATES.map((status) =>
          api
            .get<SessionListResponse>(
              `/api/cinemas/${cinemaSlug}/sessions?status=${status}&limit=50`,
            )
            .catch(() => ({ items: [], total: 0 })),
        ),
      );
      return results.flatMap((r) => r.items);
    },
    enabled: !!cinemaSlug,
    refetchInterval: 10_000,
  });
}

export function activeSessionByScreen(
  sessions: ActiveSessionItem[] | undefined,
): Map<string, ActiveSessionItem> {
  const map = new Map<string, ActiveSessionItem>();
  if (!sessions) return map;
  for (const s of sessions) {
    if (!map.has(s.screenId)) map.set(s.screenId, s);
  }
  return map;
}
