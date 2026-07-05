'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppLogo } from '@quiz-app/ui';
import { useAuth } from '@/lib/auth';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Mes salles',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    href: '/settings',
    label: 'Réglages',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  },
];

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r bg-white">
        <div className="border-b px-4 py-4">
          <AppLogo className="h-7" />
          <p className="mt-1 text-xs text-gray-400">Console</p>
          {user.cinemaName && (
            <p className="mt-1 truncate text-xs font-medium text-gray-600">{user.cinemaName}</p>
          )}
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-4 py-3">
          <p className="truncate text-sm font-medium text-gray-700">
            {user.displayName ?? user.email}
          </p>
          <p className="truncate text-xs text-gray-400">{user.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-2 text-xs text-gray-400 hover:text-red-600"
          >
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
