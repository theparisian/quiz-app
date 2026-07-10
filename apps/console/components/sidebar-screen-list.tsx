'use client';

import Link from 'next/link';
import { ProjectorScreen, Users } from '@phosphor-icons/react';
import { activeSessionByScreen, type ActiveSessionItem } from '@/hooks/use-active-sessions';

interface SidebarScreen {
  id: string;
  name: string;
  nucs: { status: string }[];
}

interface SidebarScreenListProps {
  screens: SidebarScreen[];
  selectedScreenId: string | null;
  activeSessions: ActiveSessionItem[] | undefined;
  isLoading: boolean;
}

const LIVE_STATE_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  running: {
    label: 'En cours',
    dotClass: 'bg-green-500 animate-live-pulse',
    badgeClass: 'bg-green-100 text-green-700',
  },
  lobby: {
    label: 'Lobby',
    dotClass: 'bg-amber-400 animate-live-pulse',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  paused: {
    label: 'Pause',
    dotClass: 'bg-orange-500 animate-live-pulse',
    badgeClass: 'bg-orange-100 text-orange-700',
  },
};

export function SidebarScreenList({
  screens,
  selectedScreenId,
  activeSessions,
  isLoading,
}: SidebarScreenListProps) {
  const liveByScreen = activeSessionByScreen(activeSessions);

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <p className="text-xs text-gray-400">Chargement des salles…</p>
      </div>
    );
  }

  if (screens.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-xs text-gray-400">Aucune salle configurée</p>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5">
      {screens.map((screen) => {
        const isSelected = screen.id === selectedScreenId;
        const liveSession = liveByScreen.get(screen.id);
        const nuc = screen.nucs[0];
        const isNucOnline = nuc?.status === 'online';
        const liveConfig = liveSession ? LIVE_STATE_CONFIG[liveSession.state] : null;

        return (
          <li key={screen.id}>
            <Link
              href={`/screens/${screen.id}`}
              className={`group relative flex items-start gap-2.5 rounded-md px-3 py-2.5 transition ${
                isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              {isSelected && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-blue-600" />
              )}

              <ProjectorScreen
                className={`mt-0.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}
                size={18}
                weight={isSelected ? 'fill' : 'duotone'}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`truncate text-sm font-medium ${
                      isSelected ? 'text-blue-800' : 'text-gray-700'
                    }`}
                  >
                    {screen.name}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isNucOnline ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    title={isNucOnline ? 'NUC connecté' : 'NUC hors ligne'}
                  />
                </div>

                {liveSession && liveConfig && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${liveConfig.dotClass}`} />
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${liveConfig.badgeClass}`}
                    >
                      {liveConfig.label}
                    </span>
                    <span className="truncate text-xs text-gray-500">{liveSession.quizTitle}</span>
                  </div>
                )}

                {liveSession && (
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                    <Users size={11} weight="bold" />
                    <span>
                      {liveSession.totalPlayers} joueur{liveSession.totalPlayers > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
