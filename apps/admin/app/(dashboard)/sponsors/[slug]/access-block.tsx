'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SponsorAccess } from '@quiz-app/validation';
import { api } from '../../../../lib/api';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * Bloc « Accès » de la fiche sponsor (C4) : inviter un contact par email (il reçoit un lien
 * vers l'espace sponsor de la console), révoquer une invitation ou un accès.
 */
export function SponsorAccessBlock({ sponsorSlug }: { sponsorSlug: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const key = ['sponsor-access', sponsorSlug];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<SponsorAccess>(`/api/sponsors/${encodeURIComponent(sponsorSlug)}/access`),
  });

  const onDone = {
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Erreur'),
  };

  const invite = useMutation({
    mutationFn: (value: string) =>
      api.post(`/api/sponsors/${encodeURIComponent(sponsorSlug)}/invitations`, { email: value }),
    ...onDone,
    onSuccess: () => {
      setEmail('');
      onDone.onSuccess();
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: (id: string) => api.post(`/api/invitations/${id}/revoke`, {}),
    ...onDone,
  });
  const revokeUser = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/sponsors/${encodeURIComponent(sponsorSlug)}/users/${userId}/revoke`, {}),
    ...onDone,
  });

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Accès</h2>
      <p className="mt-1 text-xs text-gray-500">
        Les contacts invités consultent les chiffres agrégés des campagnes de ce sponsor (lecture
        seule, sans donnée individuelle de joueur).
      </p>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) invite.mutate(email.trim());
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact@sponsor.fr"
          className="min-w-[16rem] flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={invite.isPending || !email.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Inviter
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-3 text-sm text-gray-400">Chargement…</p>}
      {data && (
        <ul className="mt-4 divide-y text-sm">
          {data.users.length === 0 && data.invitations.length === 0 && (
            <li className="py-2 text-gray-500">Aucun accès pour le moment.</li>
          )}
          {data.users.map((u) => (
            <li key={`u-${u.id}`} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium text-gray-900">{u.displayName ?? u.email}</p>
                <p className="text-xs text-gray-500">
                  {u.email} ·{' '}
                  {u.lastLoginAt
                    ? `dernière connexion ${DATE_FORMAT.format(new Date(u.lastLoginAt))}`
                    : 'jamais connecté'}
                </p>
              </div>
              <button
                type="button"
                disabled={revokeUser.isPending}
                onClick={() => {
                  if (confirm(`Révoquer l'accès de ${u.email ?? u.displayName ?? 'ce contact'} ?`))
                    revokeUser.mutate(u.id);
                }}
                className="text-xs text-red-600 hover:underline disabled:opacity-40"
              >
                Révoquer l&apos;accès
              </button>
            </li>
          ))}
          {data.invitations.map((i) => (
            <li key={`i-${i.id}`} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium text-gray-900">{i.email}</p>
                <p className="text-xs text-gray-500">
                  Invitation en attente · expire le {DATE_FORMAT.format(new Date(i.expiresAt))}
                </p>
              </div>
              <button
                type="button"
                disabled={revokeInvitation.isPending}
                onClick={() => revokeInvitation.mutate(i.id)}
                className="text-xs text-red-600 hover:underline disabled:opacity-40"
              >
                Révoquer l&apos;invitation
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
