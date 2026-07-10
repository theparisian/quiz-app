'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProjectorScreen, HandPointing } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';
import { useScreens } from '@/hooks/use-screens';
import { useActiveSessions } from '@/hooks/use-active-sessions';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const cinemaSlug = user?.cinemaSlug ?? null;

  const { data: screens, isLoading: screensLoading } = useScreens(cinemaSlug);
  const { data: activeSessions } = useActiveSessions(cinemaSlug);

  useEffect(() => {
    const singleScreen = !screensLoading && screens?.length === 1 ? screens[0] : null;
    if (singleScreen) {
      router.replace(`/screens/${singleScreen.id}`);
    }
  }, [screens, screensLoading, router]);

  if (!user) return null;

  if (user.role === 'super_admin' && !cinemaSlug) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <ProjectorScreen className="text-gray-300" size={48} weight="duotone" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Console</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Connecté en super-admin. Sélectionne un cinéma depuis l&apos;interface admin pour accéder
          à ses salles.
        </p>
      </div>
    );
  }

  if (screensLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  const liveCount = activeSessions?.length ?? 0;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <HandPointing className="text-blue-300" size={48} weight="duotone" />
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        {screens && screens.length > 1 ? 'Choisis une salle' : 'Bienvenue'}
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        {screens && screens.length > 1
          ? 'Sélectionne une salle dans le menu de gauche pour voir ses sessions et en lancer une nouvelle.'
          : 'Aucune salle configurée pour ce cinéma.'}
      </p>
      {liveCount > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
          <span className="animate-live-pulse h-2 w-2 rounded-full bg-green-500" />
          {liveCount} session{liveCount > 1 ? 's' : ''} en cours
        </p>
      )}
    </div>
  );
}
