'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ListNumbers } from '@phosphor-icons/react';
import type { CatalogGame, ScreenProgramItem } from '@quiz-app/validation';
import { useAuth } from '@/lib/auth';
import {
  PROGRAM_FULL_MESSAGE,
  catalogGameFromProgramItem,
  isProgramFull,
  programErrorMessage,
  programItemFromCatalog,
  type ProgramChange,
} from '@/lib/program';
import { useLaunchProgram, usePrograms, useUpdateProgram } from '@/hooks/use-programs';
import { GameDetailDrawer } from '@/components/catalog/game-detail-drawer';
import { AddToScreensMenu } from '@/components/programs/add-to-screens-menu';
import { ProgramsCatalog } from '@/components/programs/programs-catalog';
import { ScreenProgramCard, type DropHighlight } from '@/components/programs/screen-program-card';

interface Notice {
  tone: 'error' | 'info';
  text: string;
}

type DragData =
  | { type: 'catalog'; game: CatalogGame; label: string }
  | { type: 'item'; screenId: string; gameSlug: string; label: string };

function dragData(active: Active | null): DragData | null {
  return (active?.data.current as DragData | undefined) ?? null;
}

/** Salle visée par un dépôt (la carte elle-même ou un jeu de son programme). */
function overScreenId(over: Over | null): string | null {
  const data = over?.data.current as { screenId?: string } | undefined;
  return data?.screenId ?? null;
}

/**
 * Catalogue → salle : la salle sous le pointeur (au clavier, la plus proche). Réordonner : les
 * jeux de la même salle seulement.
 */
const collisionDetection: CollisionDetection = (args) => {
  const data = dragData(args.active);
  if (data?.type === 'item') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const d = c.data.current as { type?: string; screenId?: string } | undefined;
        return d?.type === 'item' && d.screenId === data.screenId;
      }),
    });
  }
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

const announcements: Announcements = {
  onDragStart: ({ active }) => `${dragData(active)?.label ?? 'Jeu'} saisi.`,
  onDragOver: ({ active, over }) => {
    const label = dragData(active)?.label ?? 'Le jeu';
    const target = (over?.data.current as { overLabel?: string } | undefined)?.overLabel;
    return target ? `${label} au-dessus de ${target}.` : `${label} hors d’une zone de dépôt.`;
  },
  onDragEnd: ({ active, over }) => {
    const label = dragData(active)?.label ?? 'Le jeu';
    const target = (over?.data.current as { overLabel?: string } | undefined)?.overLabel;
    return target ? `${label} déposé sur ${target}.` : `${label} relâché.`;
  },
  onDragCancel: ({ active }) => `Déplacement de ${dragData(active)?.label ?? 'jeu'} annulé.`,
};

const screenReaderInstructions = {
  draggable:
    'Pour déplacer ce jeu, appuyez sur Espace ou Entrée, utilisez les flèches haut et bas, puis ' +
    'appuyez de nouveau sur Espace ou Entrée pour le déposer, ou sur Échap pour annuler.',
};

export default function ProgrammationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const cinemaSlug = user?.cinemaSlug ?? null;
  const canEdit = user?.role === 'cinema_admin' || user?.role === 'super_admin';

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((tone: Notice['tone'], text: string) => {
    setNotice({ tone, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const { data, isLoading, isError } = usePrograms(cinemaSlug);
  const programs = useMemo(() => data?.items ?? [], [data]);
  const updateProgram = useUpdateProgram(cinemaSlug, (message) => notify('error', message));
  const launchProgram = useLaunchProgram(cinemaSlug);

  /** Jeu dont la fiche est ouverte ; `available` est faux pour un jeu retiré du catalogue. */
  const [opened, setOpened] = useState<{ game: CatalogGame; available: boolean } | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [overScreen, setOverScreen] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Applique un changement au programme d'une salle et l'enregistre (optimiste). */
  const changeProgram = (screenId: string, change: ProgramChange, gameTitle: string) => {
    const result = updateProgram.change(screenId, change);
    if (result.ok) return;
    if (result.reason === 'full') notify('error', PROGRAM_FULL_MESSAGE);
    if (result.reason === 'duplicate') {
      const name = programs.find((p) => p.screenId === screenId)?.name ?? 'cette salle';
      notify('info', `« ${gameTitle} » est déjà au programme de ${name}.`);
    }
  };

  const addGame = (screenId: string, game: CatalogGame) =>
    changeProgram(screenId, { kind: 'add', item: programItemFromCatalog(game) }, game.title);

  const removeGame = (screenId: string, gameSlug: string) =>
    changeProgram(screenId, { kind: 'remove', gameSlug }, gameSlug);

  const toggleScreen = (game: CatalogGame, screenId: string, checked: boolean) =>
    checked ? addGame(screenId, game) : removeGame(screenId, game.slug);

  const onDragStart = (e: DragStartEvent) => setActiveDrag(dragData(e.active));
  const onDragOver = (e: DragOverEvent) => setOverScreen(overScreenId(e.over));
  const onDragCancel = () => {
    setActiveDrag(null);
    setOverScreen(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    onDragCancel();
    const data = dragData(e.active);
    const screenId = overScreenId(e.over);
    if (!data || !screenId) return;
    if (data.type === 'catalog') {
      addGame(screenId, data.game);
      return;
    }
    // Réordonner dans la salle d'origine.
    const overData = e.over?.data.current as { type?: string; gameSlug?: string } | undefined;
    if (screenId !== data.screenId || overData?.type !== 'item') return;
    const items = programs.find((p) => p.screenId === screenId)?.items ?? [];
    const from = items.findIndex((i) => i.gameSlug === data.gameSlug);
    const to = items.findIndex((i) => i.gameSlug === overData.gameSlug);
    changeProgram(screenId, { kind: 'move', from, to }, data.label);
  };

  const highlightFor = (screenId: string, itemsFull: boolean): DropHighlight => {
    if (activeDrag?.type !== 'catalog' || overScreen !== screenId) return 'none';
    return itemsFull ? 'full' : 'accept';
  };

  const launch = (screenId: string) => {
    launchProgram.mutate(screenId, {
      onSuccess: () => router.push(`/screens/${screenId}`),
      onError: (err) => notify('error', programErrorMessage(err, 'launch')),
    });
  };

  const openItem = (item: ScreenProgramItem) =>
    setOpened({ game: catalogGameFromProgramItem(item), available: item.available });

  if (!user) return null;

  if (!cinemaSlug) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <ListNumbers className="text-gray-300" size={48} weight="duotone" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Programmation</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Sélectionnez un cinéma depuis l&apos;interface admin pour programmer ses salles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmation</h1>
          <p className="mt-1 text-sm text-gray-500">
            {canEdit
              ? 'Associez jusqu’à 5 jeux à chaque salle, dans l’ordre de projection, puis lancez le programme en un clic.'
              : 'Programme de chaque salle. Lancez le programme d’une salle en un clic.'}
          </p>
        </div>
      </div>

      <div
        id="programs-notice"
        aria-live="polite"
        className={`mt-4 rounded-md px-4 py-2 text-sm font-medium ${
          notice
            ? notice.tone === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-blue-50 text-blue-700'
            : 'sr-only'
        }`}
      >
        {notice?.text}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading ? (
              <p className="text-sm text-gray-400">Chargement des salles…</p>
            ) : isError ? (
              <p className="text-sm text-red-600">
                Les salles n&apos;ont pas pu être chargées. Réessayez dans un instant.
              </p>
            ) : programs.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-white px-6 py-10 text-center text-sm text-gray-400">
                Aucune salle configurée pour ce cinéma.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {programs.map((program) => (
                  <ScreenProgramCard
                    key={program.screenId}
                    program={program}
                    canEdit={canEdit}
                    highlight={highlightFor(program.screenId, isProgramFull(program.items))}
                    launching={
                      launchProgram.isPending && launchProgram.variables === program.screenId
                    }
                    onOpenGame={openItem}
                    onRemove={removeGame}
                    onLaunch={launch}
                  />
                ))}
              </div>
            )}
          </div>

          <aside>
            <ProgramsCatalog
              cinemaSlug={cinemaSlug}
              programs={programs}
              canEdit={canEdit}
              onOpen={(game) => setOpened({ game, available: true })}
              onToggleScreen={toggleScreen}
            />
          </aside>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag?.type === 'catalog' ? (
            <div className="w-48 cursor-grabbing rounded-lg border-2 border-blue-500 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xl">
              {activeDrag.game.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {opened && (
        <GameDetailDrawer
          game={opened.game}
          cinemaSlug={cinemaSlug}
          onClose={() => setOpened(null)}
          footer={
            !canEdit ? null : opened.available ? (
              <AddToScreensMenu
                game={opened.game}
                programs={programs}
                placement="up"
                onToggle={(screenId, checked) => toggleScreen(opened.game, screenId, checked)}
              />
            ) : (
              <p className="text-sm text-gray-600">
                Ce jeu a été retiré du catalogue. Retirez-le des salles avec le bouton ×.
              </p>
            )
          }
        />
      )}
    </div>
  );
}
