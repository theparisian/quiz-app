'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import type { CatalogGame, ScreenProgram } from '@quiz-app/validation';
import { MAX_GAMES_PER_SCREEN, PROGRAM_FULL_MESSAGE, isProgramFull } from '@/lib/program';

interface AddToScreensMenuProps {
  game: CatalogGame;
  programs: ScreenProgram[];
  /** Coche (ajout) ou décoche (retrait) une salle. */
  onToggle: (screenId: string, checked: boolean) => void;
  /** Ouverture vers le bas (carte du catalogue) ou vers le haut (pied du panneau de détail). */
  placement?: 'down' | 'up';
  className?: string;
}

/**
 * « Ajouter à… » : chemin sans glisser-déposer pour associer un jeu aux salles. Bouton de
 * divulgation + panneau de cases à cocher natives (une par salle) : utilisable entièrement au
 * clavier (Tab, Espace, Échap rend le focus au bouton) et au doigt (cibles de 44 px).
 */
export function AddToScreensMenu({
  game,
  programs,
  onToggle,
  placement = 'down',
  className = '',
}: AddToScreensMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  const inCount = programs.filter((p) => p.items.some((i) => i.gameSlug === game.slug)).length;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // À l'ouverture : focus sur la première case active. Clic ou appui hors du menu : fermeture.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)');
    (first ?? panelRef.current)?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      // Ne ferme que le menu (pas le panneau de détail qui l'entoure).
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopPropagation();
      close(true);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !wrapperRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="whitespace-nowrap">Ajouter à…</span>
        {inCount > 0 && (
          <span className="rounded-full bg-blue-100 px-1.5 text-xs text-blue-800">
            {inCount}
            <span className="sr-only">
              {' '}
              {inCount > 1 ? 'salles' : 'salle'} déjà programmée{inCount > 1 ? 's' : ''}
            </span>
          </span>
        )}
        <CaretDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`absolute right-0 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 shadow-lg focus:outline-none ${
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <p id={titleId} className="text-sm font-semibold text-gray-900">
            Programmer « {game.title} » dans :
          </p>
          {programs.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucune salle configurée.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {programs.map((program) => {
                const checked = program.items.some((i) => i.gameSlug === game.slug);
                const full = !checked && isProgramFull(program.items);
                const hintId = `${panelId}-${program.screenId}-hint`;
                return (
                  <li key={program.screenId}>
                    <label
                      className={`flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-sm ${
                        full
                          ? 'cursor-not-allowed text-gray-400'
                          : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={full}
                        aria-describedby={hintId}
                        onChange={(e) => onToggle(program.screenId, e.target.checked)}
                        className="h-5 w-5 shrink-0 accent-blue-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">
                          {program.name}
                        </span>
                        <span id={hintId} className="block text-xs text-gray-500">
                          {full
                            ? `Complet : ${PROGRAM_FULL_MESSAGE}`
                            : `${program.items.length} / ${MAX_GAMES_PER_SCREEN} jeux`}
                        </span>
                      </span>
                      {checked && (
                        <Check size={16} weight="bold" className="text-blue-600" aria-hidden />
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => close(true)}
            className="mt-2 min-h-11 w-full rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
