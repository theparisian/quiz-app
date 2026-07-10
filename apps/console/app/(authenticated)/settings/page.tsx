'use client';

import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { user } = useAuth();

  if (!user) return null;

  const roleLabel =
    {
      super_admin: 'Super-admin',
      cinema_admin: 'Administrateur cinéma',
      projectionist: 'Projectionniste',
    }[user.role] ?? user.role;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
      <p className="mt-1 text-sm text-gray-500">Informations de ton compte</p>

      <div className="mt-6 max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user.email ?? '–'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Nom</dt>
            <dd className="font-medium text-gray-900">{user.displayName ?? '–'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Rôle</dt>
            <dd className="font-medium text-gray-900">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Cinéma</dt>
            <dd className="font-medium text-gray-900">{user.cinemaName ?? '–'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
