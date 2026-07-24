'use client';

import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveSessions } from './use-active-sessions';
import { useAuth } from '@/lib/auth';

interface SessionScreenRef {
  screenId: string;
}

export function useSelectedScreenId(): string | null {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: activeSessions } = useActiveSessions(user?.cinemaSlug ?? null);

  const screenFromPath = pathname.match(/^\/screens\/([^/]+)/)?.[1] ?? null;
  const sessionId = pathname.match(/^\/sessions\/([^/]+)/)?.[1];
  const needsSessionLookup = !!sessionId;
  const fromActive = needsSessionLookup
    ? activeSessions?.find((s) => s.id === sessionId)
    : undefined;

  const { data } = useQuery<SessionScreenRef>({
    queryKey: ['session-screen-ref', sessionId ?? null],
    queryFn: async () => {
      const detail = await api.get<{ screenId: string }>(`/api/sessions/${sessionId}/full`);
      return { screenId: detail.screenId };
    },
    enabled: needsSessionLookup && !fromActive,
    staleTime: 60_000,
  });

  if (screenFromPath) return screenFromPath;

  if (needsSessionLookup) {
    return fromActive?.screenId ?? data?.screenId ?? null;
  }

  return null;
}
