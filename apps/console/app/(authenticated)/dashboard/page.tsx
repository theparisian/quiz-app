'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useScreens } from '@/hooks/use-screens';
import { useActiveSession } from '@/hooks/use-active-session';
import { ScreenCard } from '@/components/screen-card';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const cinemaSlug = user?.cinemaSlug ?? null;

  const { data: screens, isLoading: screensLoading } = useScreens(cinemaSlug);
  const { data: activeSession } = useActiveSession(cinemaSlug);

  useEffect(() => {
    const singleScreen = !screensLoading && screens?.length === 1 ? screens[0] : null;
    if (singleScreen) {
      router.replace(`/screens/${singleScreen.id}`);
    }
  }, [screens, screensLoading, router]);

  if (!user) return null;

  if (user.role === 'super_admin' && !cinemaSlug) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Console</h1>
        <p className="mt-2 text-sm text-gray-500">
          Connecté en super-admin. Sélectionne un cinéma depuis l&apos;interface admin pour accéder
          à ses salles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Mes salles</h1>
      <p className="mt-1 text-sm text-gray-500">{user.cinemaName}</p>

      {activeSession && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-orange-800">
              Session en cours sur {activeSession.screenName ?? 'une salle'} —{' '}
              {activeSession.quizTitle}
            </p>
            <Link
              href={`/sessions/${activeSession.id}/live`}
              className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
            >
              Reprendre la console →
            </Link>
          </div>
        </div>
      )}

      {screensLoading ? (
        <p className="mt-6 text-gray-400">Chargement des salles...</p>
      ) : screens && screens.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((s) => {
            const nuc = s.nucs[0];
            return (
              <ScreenCard
                key={s.id}
                id={s.id}
                name={s.name}
                capacity={s.capacity}
                nucStatus={nuc?.status ?? null}
                lastSeenAt={nuc?.lastSeenAt ?? null}
              />
            );
          })}
        </div>
      ) : (
        <p className="mt-6 text-gray-400">Aucune salle configurée.</p>
      )}
    </div>
  );
}
