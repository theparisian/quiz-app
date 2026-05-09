'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface ActiveSessionItem {
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

export function useActiveSession(cinemaSlug: string | null) {
  return useQuery<ActiveSessionItem | null>({
    queryKey: ['active-session', cinemaSlug],
    queryFn: async () => {
      const results = await Promise.all(
        ['lobby', 'running', 'paused'].map((status) =>
          api
            .get<SessionListResponse>(
              `/api/cinemas/${cinemaSlug}/sessions?status=${status}&limit=1`,
            )
            .catch(() => ({ items: [], total: 0 })),
        ),
      );
      const active = results.flatMap((r) => r.items);
      return active[0] ?? null;
    },
    enabled: !!cinemaSlug,
    refetchInterval: 15_000,
  });
}
