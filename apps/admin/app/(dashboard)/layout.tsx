'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  type Icon,
  FilmSlate,
  Gauge,
  EnvelopeSimple,
  Megaphone,
  Question,
  SignOut,
  Sparkle,
  Smiley,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';

const NAV_ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/cinemas', label: 'Cinémas', icon: FilmSlate },
  { href: '/invitations', label: 'Invitations', icon: EnvelopeSimple },
  { href: '/quizzes', label: 'Quizz', icon: Question },
  { href: '/ai/usage', label: 'IA', icon: Sparkle },
  { href: '/sponsors', label: 'Sponsors', icon: Megaphone },
  { href: '/avatars', label: 'Avatars', icon: Smiley },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
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
          <h1 className="text-lg font-bold text-gray-900">Quiz App</h1>
          <p className="text-xs text-gray-400">Super Admin</p>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ItemIcon className="shrink-0" size={20} weight={isActive ? 'fill' : 'regular'} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-4 py-3">
          <p className="truncate text-sm font-medium text-gray-700">
            {user.displayName ?? user.email}
          </p>
          <button
            onClick={logout}
            className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600"
          >
            <SignOut size={14} weight="regular" />
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
