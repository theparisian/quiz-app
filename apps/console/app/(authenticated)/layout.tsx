'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Gear, SignOut } from '@phosphor-icons/react';
import { AppLogo } from '@quiz-app/ui';
import { useAuth } from '@/lib/auth';
import { useScreens } from '@/hooks/use-screens';
import { useActiveSessions } from '@/hooks/use-active-sessions';
import { useSelectedScreenId } from '@/hooks/use-selected-screen-id';
import { SidebarScreenList } from '@/components/sidebar-screen-list';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const cinemaSlug = user?.cinemaSlug ?? null;

  const { data: screens, isLoading: screensLoading } = useScreens(cinemaSlug);
  const { data: activeSessions } = useActiveSessions(cinemaSlug);
  const selectedScreenId = useSelectedScreenId();

  const isSettingsActive = pathname === '/settings';

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
    if (!loading && user && user.role === 'player') {
      router.replace('/access-denied');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (!user) return null;

  const hasCinema = !!cinemaSlug;
  const liveCount = activeSessions?.length ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
        <div className="border-b px-4 py-4">
          <AppLogo className="h-7" />
          <p className="mt-1 text-xs text-gray-400">Console</p>
          {user.cinemaName && (
            <p className="mt-1 truncate text-xs font-medium text-gray-600">{user.cinemaName}</p>
          )}
        </div>

        {hasCinema ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Salles
              </p>
              {liveCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="animate-live-pulse h-1.5 w-1.5 rounded-full bg-green-500" />
                  {liveCount} live
                </span>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto px-2 pb-3">
              <SidebarScreenList
                screens={screens ?? []}
                selectedScreenId={selectedScreenId}
                activeSessions={activeSessions}
                isLoading={screensLoading}
              />
            </nav>
          </div>
        ) : (
          <div className="flex-1 px-4 py-3">
            <p className="text-xs text-gray-400">
              Connecté en super-admin. Sélectionne un cinéma depuis l&apos;admin.
            </p>
          </div>
        )}

        <div className="border-t px-4 py-3">
          <p className="truncate text-sm font-medium text-gray-700">
            {user.displayName ?? user.email}
          </p>
          <p className="truncate text-xs text-gray-400">{user.email}</p>
          <div className="mt-2 flex items-center gap-3">
            <Link
              href="/settings"
              className={`flex items-center gap-1 text-xs transition ${
                isSettingsActive ? 'font-medium text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Gear size={14} weight={isSettingsActive ? 'fill' : 'regular'} />
              Réglages
            </Link>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 text-xs text-gray-400 transition hover:text-red-600"
            >
              <SignOut size={14} weight="regular" />
              Déconnexion
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
