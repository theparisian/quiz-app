'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Screen {
  id: string;
  name: string;
  capacity: number | null;
  status: string;
  nucs: {
    id: string;
    nucUid: string;
    status: string;
    lastSeenAt: string | null;
  }[];
  createdAt: string;
}

export function useScreens(cinemaSlug: string | null) {
  return useQuery<Screen[]>({
    queryKey: ['screens', cinemaSlug],
    queryFn: () => api.get<Screen[]>(`/api/cinemas/${cinemaSlug}/screens`),
    enabled: !!cinemaSlug,
    staleTime: 30_000,
  });
}
