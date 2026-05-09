'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SessionListItem {
  id: string;
  slugShort: string;
  state: string;
  totalPlayers: number;
  quizTitle: string;
  quizSlug: string;
  playersCount: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

interface SessionListResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  limit: number;
}

export function useSessionsByScreen(screenId: string | null, page = 1, limit = 20) {
  return useQuery<SessionListResponse>({
    queryKey: ['sessions', 'screen', screenId, page, limit],
    queryFn: () =>
      api.get<SessionListResponse>(`/api/screens/${screenId}/sessions?page=${page}&limit=${limit}`),
    enabled: !!screenId,
    staleTime: 30_000,
  });
}
