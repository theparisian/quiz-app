'use client';

import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveSessions } from './use-active-sessions';
import { useAuth } from '@/lib/auth';

interface SessionScreenRef {
  screenId: string;
}

function screenIdFromSearchParams(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('screenId');
}

export function useSelectedScreenId(): string | null {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: activeSessions } = useActiveSessions(user?.cinemaSlug ?? null);

  const screenFromPath = pathname.match(/^\/screens\/([^/]+)/)?.[1] ?? null;
  const sessionId = pathname.match(/^\/sessions\/([^/]+)/)?.[1];
  const needsSessionLookup = !!sessionId && sessionId !== 'new';
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

  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/bb886729-3067-42e7-8e36-4c5165f027e2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6b2aa5' },
    body: JSON.stringify({
      sessionId: '6b2aa5',
      runId: 'post-fix',
      hypothesisId: 'H1',
      location: 'use-selected-screen-id.ts:render',
      message: 'useSelectedScreenId render',
      data: {
        pathname,
        screenFromPath,
        sessionId: sessionId ?? null,
        needsSessionLookup,
        result:
          screenFromPath ??
          (pathname === '/sessions/new' ? screenIdFromSearchParams() : null) ??
          (needsSessionLookup ? (fromActive?.screenId ?? data?.screenId ?? null) : null),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (screenFromPath) return screenFromPath;

  if (pathname === '/sessions/new') {
    return screenIdFromSearchParams();
  }

  if (needsSessionLookup) {
    return fromActive?.screenId ?? data?.screenId ?? null;
  }

  return null;
}
