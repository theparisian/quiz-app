'use client';

import { useActiveSessions } from './use-active-sessions';

export function useActiveSession(cinemaSlug: string | null) {
  const query = useActiveSessions(cinemaSlug);
  return {
    ...query,
    data: query.data?.[0] ?? null,
  };
}
