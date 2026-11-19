'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, DotsSixVertical, Image as ImageIcon, X } from '@phosphor-icons/react';
import type { ScreenProgramItem } from '@quiz-app/validation';
import { resolveMediaUrl } from '@/lib/media-url';
import { ENGINE_LABEL, estimateGameSeconds, formatDuration } from '@/components/catalog/format';

/** Identifiant de glisser-déposer d'un jeu au programme d'une salle. */
export function programItemDndId(screenId: string, gameSlug: string): string {
  return `item:${screenId}:${gameSlug}`;
}

const LONG_PRESS_MS = 500;

interface ProgramItemRowProps {
  screenId: string;
  screenName: string;
  item: ScreenProgramItem;
  position: number;
  canEdit: boolean;
  onOpen: (item: ScreenProgramItem) => void;
  onRemove: (gameSlug: string) => void;
}

/**
 * Jeu au programme d'une salle : poignée de déplacement (souris, doigt, clavier), vignette,
 * titre, durée, pastille sponsor, bouton ×. Infobulle au survol, au focus ou à l'appui long.
 */
export function ProgramItemRow({
  screenId,
  screenName,
  item,
  position,
  canEdit,
  onOpen,
  onRemove,
}: ProgramItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: programItemDndId(screenId, item.gameSlug),
    data: {
      type: 'item',
      screenId,
      gameSlug: item.gameSlug,
      label: `« ${item.title} »`,
      overLabel: `la position ${position} de ${screenName}`,
    },
    disabled: !canEdit,
  });

  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(() => clearPress, []);
  useEffect(() => {
    if (isDragging) setTipOpen(false);
  }, [isDragging]);

  const coverUrl = resolveMediaUrl(item.coverImageUrl);
  const unavailable = !item.available;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center gap-2 rounded-md border bg-white px-2 py-1.5 ${
        isDragging ? 'z-10 opacity-60 shadow-lg' : ''
      } ${unavailable ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200'}`}
      onMouseEnter={() => setTipOpen(true)}
      onMouseLeave={() => setTipOpen(false)}
    >
      {canEdit && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Déplacer « ${item.title} » (position ${position})`}
          className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:cursor-grabbing"
        >
          <DotsSixVertical size={18} weight="bold" aria-hidden />
        </button>
      )}
      <span className="w-4 shrink-0 text-center text-xs font-semibold text-gray-500" aria-hidden>
        {position}
      </span>

      <button
        type="button"
        aria-describedby={tipOpen ? tipId : undefined}
        aria-label={`${position}. ${item.title}${unavailable ? ', retiré du catalogue' : ''} : voir la fiche`}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onOpen(item);
        }}
        onFocus={() => setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && tipOpen) {
            e.stopPropagation();
            setTipOpen(false);
          }
        }}
        onTouchStart={() => {
          longPressed.current = false;
          clearPress();
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setTipOpen(true);
          }, LONG_PRESS_MS);
        }}
        onTouchMove={clearPress}
        onTouchEnd={clearPress}
        onContextMenu={(e) => {
          // Appui long sur tablette : pas de menu contextuel du navigateur.
          if (longPressed.current) e.preventDefault();
        }}
        className={`flex min-h-11 min-w-0 flex-1 select-none items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          unavailable ? 'opacity-60 grayscale' : ''
        }`}
      >
        <span className="h-9 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-300">
              <ImageIcon size={18} weight="duotone" aria-hidden />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{item.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
            {unavailable ? (
              <span className="font-medium text-gray-600">Retiré du catalogue</span>
            ) : (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={12} aria-hidden />
                {formatDuration(estimateGameSeconds(item))}
              </span>
            )}
            {item.kind === 'sponsored' && (
              <span className="rounded-full bg-amber-100 px-1.5 font-medium text-amber-800">
                Sponsorisé
              </span>
            )}
          </span>
        </span>
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={() => onRemove(item.gameSlug)}
          aria-label={`Retirer « ${item.title} » de ${screenName}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <X size={16} weight="bold" aria-hidden />
        </button>
      )}

      {tipOpen && !isDragging && (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-8 z-20 mb-1 w-64 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
        >
          <p className="font-semibold">{item.title}</p>
          {item.tagline && <p className="mt-0.5 text-gray-200">{item.tagline}</p>}
          <p className="mt-1 text-gray-300">
            {ENGINE_LABEL[item.engineKey] ?? item.engineKey} ·{' '}
            {formatDuration(estimateGameSeconds(item))}
          </p>
          {item.sponsorName && <p className="text-amber-200">Sponsorisé par {item.sponsorName}</p>}
          {unavailable && <p className="mt-1 text-red-200">Retiré du catalogue</p>}
        </div>
      )}
    </li>
  );
}
