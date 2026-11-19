'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SignOut } from '@phosphor-icons/react';
import { AppLogo } from '@quiz-app/ui';
import { isSponsorRole, useAuth } from '@/lib/auth';

/**
 * Portail sponsor (C4) : mise en page propre, sans la barre latérale du cinéma. Réservé au rôle
 * sponsor (et au super_admin) ; un rôle cinéma est renvoyé vers /access-denied.
 */
export default function SponsorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const allowed = !!user && (isSponsorRole(user.role) || user.role === 'super_admin');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!allowed) router.replace('/access-denied');
  }, [user, loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }
  if (!user || !allowed) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/sponsor" className="flex items-center gap-3">
            <AppLogo className="h-7" />
            <span className="text-sm font-medium text-gray-500">Espace sponsor</span>
            {user.sponsorName && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                {user.sponsorName}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden truncate text-sm text-gray-500 sm:inline">
              {user.displayName ?? user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 text-sm text-gray-400 transition hover:text-red-600"
            >
              <SignOut size={16} />
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
