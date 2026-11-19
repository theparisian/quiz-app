'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CinemaProgramsResponse,
  ScreenProgram,
  ScreenProgramItem,
} from '@quiz-app/validation';
import { api } from '@/lib/api';
import {
  applyProgramChange,
  programErrorMessage,
  withScreenItems,
  withScreenProgram,
  type ProgramChange,
  type ProgramChangeResult,
} from '@/lib/program';

export const programsQueryKey = (cinemaSlug: string | null) => ['programs', cinemaSlug] as const;

/** Salles du cinéma et leur programme (état du boîtier et séance active compris). */
export function usePrograms(cinemaSlug: string | null) {
  return useQuery<CinemaProgramsResponse>({
    queryKey: programsQueryKey(cinemaSlug),
    queryFn: () =>
      api.get<CinemaProgramsResponse>(`/api/cinemas/${encodeURIComponent(cinemaSlug!)}/programs`),
    enabled: !!cinemaSlug,
    refetchInterval: 15_000,
  });
}

interface ProgramUpdate {
  screenId: string;
  items: ScreenProgramItem[];
  /** Cache avant ce changement (retour arrière en cas d'erreur). */
  previous: CinemaProgramsResponse;
}

/**
 * Modifie le programme d'une salle : mise à jour optimiste du cache TanStack Query, faite tout
 * de suite (deux changements rapprochés partent chacun de l'état du précédent), puis PUT. Les
 * envois d'un même cinéma passent l'un après l'autre (`scope`), dans l'ordre des changements ;
 * en cas d'erreur, retour à l'état d'avant le changement, resynchronisation et message.
 * `change` renvoie le refus local (salle pleine, jeu déjà présent) sans rien envoyer.
 */
export function useUpdateProgram(cinemaSlug: string | null, onError: (message: string) => void) {
  const queryClient = useQueryClient();
  const queryKey = programsQueryKey(cinemaSlug);
  const mutationKey = ['program-update', cinemaSlug];

  const mutation = useMutation<ScreenProgram, Error, ProgramUpdate>({
    mutationKey,
    scope: { id: `program-update:${cinemaSlug}` },
    mutationFn: ({ screenId, items }) =>
      api.put<ScreenProgram>(`/api/screens/${screenId}/program`, {
        gameSlugs: items.map((i) => i.gameSlug),
      }),
    onSuccess: (program) => {
      // Seulement si aucun autre changement n'attend : sinon il écraserait l'état optimiste.
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        queryClient.setQueryData<CinemaProgramsResponse>(queryKey, (old) =>
          old ? { items: withScreenProgram(old.items, program) } : old,
        );
      }
    },
    onError: (err, { previous }) => {
      queryClient.setQueryData(queryKey, previous);
      onError(`Modification annulée : ${programErrorMessage(err, 'update')}`);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const change = (screenId: string, programChange: ProgramChange): ProgramChangeResult => {
    const previous = queryClient.getQueryData<CinemaProgramsResponse>(queryKey);
    const program = previous?.items.find((p) => p.screenId === screenId);
    if (!previous || !program) return { ok: false, reason: 'noop' };
    const result = applyProgramChange(program.items, programChange);
    if (!result.ok) return result;
    // Une lecture en cours ne doit ni écraser l'état optimiste, ni le rétablir.
    void queryClient.cancelQueries({ queryKey }, { revert: false });
    queryClient.setQueryData<CinemaProgramsResponse>(queryKey, {
      items: withScreenItems(previous.items, screenId, result.items),
    });
    mutation.mutate({ screenId, items: result.items, previous });
    return result;
  };

  return { change, isPending: mutation.isPending };
}

/** Lance le programme d'une salle (POST …/program/launch) ; renvoie la séance créée. */
export function useLaunchProgram(cinemaSlug: string | null) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; screenId: string }, Error, string>({
    mutationFn: (screenId) =>
      api.post<{ id: string; screenId: string }>(`/api/screens/${screenId}/program/launch`),
    onSuccess: async (_session, screenId) => {
      // La console live de la salle lit la séance active : on l'attend avant de rediriger.
      await queryClient.refetchQueries({ queryKey: ['active-sessions'] });
      void queryClient.invalidateQueries({ queryKey: programsQueryKey(cinemaSlug) });
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'screen', screenId] });
    },
  });
}
