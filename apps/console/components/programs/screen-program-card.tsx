'use client';

import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowRight, Play, Screencast, Users } from '@phosphor-icons/react';
import type { ScreenProgram, ScreenProgramItem } from '@quiz-app/validation';
import { formatDuration } from '@/components/catalog/format';
import { MAX_GAMES_PER_SCREEN, PROGRAM_FULL_MESSAGE, programDurationSeconds } from '@/lib/program';
import { ProgramItemRow, programItemDndId } from './program-item-row';

/** Identifiant de dépôt d'une carte de salle. */
export function screenDndId(screenId: string): string {
  return `screen:${screenId}`;
}

/** Surlignage pendant un glisser depuis le catalogue : dépôt possible, ou salle pleine. */
export type DropHighlight = 'none' | 'accept' | 'full';

interface ScreenProgramCardProps {
  program: ScreenProgram;
  canEdit: boolean;
  highlight: DropHighlight;
  launching: boolean;
  onOpenGame: (item: ScreenProgramItem) => void;
  onRemove: (screenId: string, gameSlug: string) => void;
  onLaunch: (screenId: string) => void;
}

/**
 * Carte d'une salle sur la page Programmation : état du boîtier, séance en direct, programme
 * ordonné (glisser pour réordonner, × pour retirer), durée totale et bouton « Lancer ».
 */
export function ScreenProgramCard({
  program,
  canEdit,
  highlight,
  launching,
  onOpenGame,
  onRemove,
  onLaunch,
}: ScreenProgramCardProps) {
  const { setNodeRef } = useDroppable({
    id: screenDndId(program.screenId),
    data: { type: 'screen', screenId: program.screenId, overLabel: program.name },
    disabled: !canEdit,
  });

  const online = program.nuc?.status === 'online';
  const live = program.activeSession !== null;
  const launchable = program.items.some((i) => i.available);
  const inactive = program.status !== 'active';
  const headingId = `screen-${program.screenId}-title`;

  const ring =
    highlight === 'accept'
      ? 'border-blue-500 ring-2 ring-blue-300 bg-blue-50/40'
      : highlight === 'full'
        ? 'border-red-400 ring-2 ring-red-200'
        : live
          ? 'border-green-200 ring-1 ring-green-100'
          : 'border-gray-200';

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={`flex flex-col rounded-xl border bg-white p-4 shadow-sm transition ${ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              live ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
            }`}
          >
            <Screencast size={20} weight="duotone" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-base font-semibold text-gray-900">
              {program.name}
            </h2>
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Users size={12} aria-hidden />
              {program.capacity != null ? `${program.capacity} places` : 'Capacité inconnue'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              online ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`}
              aria-hidden
            />
            {online ? 'Boîtier en ligne' : 'Boîtier hors ligne'}
          </span>
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-700">
              <span className="animate-live-pulse h-2 w-2 rounded-full bg-red-500" aria-hidden />
              En direct
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex-1">
        {program.items.length === 0 ? (
          <p
            className={`rounded-md border border-dashed px-3 py-6 text-center text-sm ${
              highlight === 'accept' ? 'border-blue-300 text-blue-700' : 'text-gray-400'
            }`}
          >
            {canEdit
              ? 'Glissez un jeu du catalogue ici, ou utilisez « Ajouter à… ».'
              : 'Aucun jeu programmé.'}
          </p>
        ) : (
          <SortableContext
            items={program.items.map((i) => programItemDndId(program.screenId, i.gameSlug))}
            strategy={verticalListSortingStrategy}
          >
            <ol className="space-y-1.5" aria-label={`Programme de ${program.name}`}>
              {program.items.map((item, i) => (
                <ProgramItemRow
                  key={item.gameSlug}
                  screenId={program.screenId}
                  screenName={program.name}
                  item={item}
                  position={i + 1}
                  canEdit={canEdit}
                  onOpen={onOpenGame}
                  onRemove={(slug) => onRemove(program.screenId, slug)}
                />
              ))}
            </ol>
          </SortableContext>
        )}
        {highlight === 'full' && (
          <p className="mt-2 text-sm font-medium text-red-600">{PROGRAM_FULL_MESSAGE}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-500">
          {program.items.length} / {MAX_GAMES_PER_SCREEN} jeux
          {launchable && (
            <> · Durée totale : {formatDuration(programDurationSeconds(program.items))}</>
          )}
        </p>
        {live ? (
          <Link
            href={`/screens/${program.screenId}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
          >
            Ouvrir la session
            <ArrowRight size={14} weight="bold" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onLaunch(program.screenId)}
            disabled={!launchable || launching || inactive}
            title={
              inactive
                ? 'Cette salle est désactivée.'
                : !launchable
                  ? 'Ajoutez au moins un jeu disponible pour lancer.'
                  : undefined
            }
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} weight="fill" aria-hidden />
            {launching ? 'Lancement…' : 'Lancer'}
          </button>
        )}
      </div>
    </section>
  );
}
