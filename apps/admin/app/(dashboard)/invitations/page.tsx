'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, XCircle } from '@phosphor-icons/react';
import { api } from '../../../lib/api';

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  cinemaName: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

interface InvitationsResponse {
  items: Invitation[];
  total: number;
}

interface Cinema {
  id: string;
  slug: string;
  name: string;
}

interface CinemasResponse {
  items: Cinema[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  revoked: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

export default function InvitationsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'projectionist' | 'cinema_admin'>('projectionist');
  const [newCinemaId, setNewCinemaId] = useState('');

  const { data } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get<InvitationsResponse>('/api/invitations?limit=50'),
  });

  const { data: cinemas } = useQuery({
    queryKey: ['cinemas-list'],
    queryFn: () => api.get<CinemasResponse>('/api/cinemas?limit=100'),
    enabled: showCreate,
  });

  const createMutation = useMutation({
    mutationFn: (body: { email: string; role: string; cinemaId: string }) =>
      api.post('/api/invitations', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setShowCreate(false);
      setNewEmail('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/invitations/${id}/revoke`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.total ?? 0} invitation(s)</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <UserPlus size={16} weight="bold" />
          Inviter un projectionniste
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouvelle invitation</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'projectionist' | 'cinema_admin')}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="projectionist">Projectionniste</option>
              <option value="cinema_admin">Admin cinéma</option>
            </select>
            <select
              value={newCinemaId}
              onChange={(e) => setNewCinemaId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Choisir un cinéma...</option>
              {cinemas?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  createMutation.mutate({ email: newEmail, role: newRole, cinemaId: newCinemaId })
                }
                disabled={!newEmail || !newCinemaId || createMutation.isPending}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Inviter
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500">
                Annuler
              </button>
            </div>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-red-600">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Erreur'}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Rôle
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Cinéma
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Statut
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Date
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.items.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{inv.email}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {inv.role === 'projectionist' ? 'Projectionniste' : 'Admin cinéma'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{inv.cinemaName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? ''}`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {new Date(inv.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => revokeMutation.mutate(inv.id)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                    >
                      <XCircle size={14} />
                      Révoquer
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucune invitation
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
