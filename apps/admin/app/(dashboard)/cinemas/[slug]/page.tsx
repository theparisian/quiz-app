'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { useCinemaNucMonitor } from '../../../../hooks/use-cinema-nuc-monitor';

interface Nuc {
  id: string;
  nucUid: string;
  status: string;
  lastSeenAt: string | null;
  lastIp: string | null;
  appVersion: string | null;
}

interface Screen {
  id: string;
  name: string;
  capacity: number | null;
  status: string;
  nucs: Nuc[];
}

interface CinemaDetail {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  screens: Screen[];
  createdAt: string;
}

interface NucCreateResponse {
  id: string;
  nucUid: string;
  authKey: string;
  status: string;
  warning: string;
}

export default function CinemaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const queryClient = useQueryClient();

  const [newScreenName, setNewScreenName] = useState('');
  const [newScreenCapacity, setNewScreenCapacity] = useState('');
  const [showAddScreen, setShowAddScreen] = useState(false);
  const [nucModal, setNucModal] = useState<NucCreateResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');

  const { data: cinema, isLoading } = useQuery({
    queryKey: ['cinema', slug],
    queryFn: () => api.get<CinemaDetail>(`/api/cinemas/${slug}`),
  });

  useCinemaNucMonitor(slug, Boolean(cinema));

  const addScreenMutation = useMutation({
    mutationFn: (body: { name: string; capacity?: number }) =>
      api.post(`/api/cinemas/${slug}/screens`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cinema', slug] });
      setShowAddScreen(false);
      setNewScreenName('');
      setNewScreenCapacity('');
    },
  });

  const deleteScreenMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/screens/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cinema', slug] }),
  });

  const addNucMutation = useMutation({
    mutationFn: (screenId: string) => api.post<NucCreateResponse>(`/api/screens/${screenId}/nucs`),
    onSuccess: (data) => {
      setNucModal(data);
      void queryClient.invalidateQueries({ queryKey: ['cinema', slug] });
    },
  });

  const deleteNucMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/nucs/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cinema', slug] }),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { name?: string; city?: string }) => api.patch(`/api/cinemas/${slug}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cinema', slug] });
      setEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/api/cinemas/${slug}`),
    onSuccess: () => router.push('/cinemas'),
  });

  if (isLoading) return <p className="text-gray-400">Chargement...</p>;
  if (!cinema) return <p className="text-red-600">Cinéma non trouvé</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editing ? (
            <div className="flex gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded border px-2 py-1 text-lg font-bold"
              />
              <input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                placeholder="Ville"
                className="rounded border px-2 py-1 text-sm"
              />
              <button
                onClick={() => updateMutation.mutate({ name: editName, city: editCity })}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
              >
                Enregistrer
              </button>
              <button onClick={() => setEditing(false)} className="text-sm text-gray-500">
                Annuler
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{cinema.name}</h1>
              <p className="text-sm text-gray-500">
                {cinema.city ?? ''} — {cinema.status}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={() => {
                setEditing(true);
                setEditName(cinema.name);
                setEditCity(cinema.city ?? '');
              }}
              className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Modifier
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Archiver ce cinéma ?')) archiveMutation.mutate();
            }}
            className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Archiver
          </button>
          <Link
            href={`/cinemas/${slug}/prize-templates`}
            className="rounded border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
          >
            Catalogue de lots
          </Link>
          <Link
            href={`/cinemas/${slug}/prizes`}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Configurer les lots (legacy)
          </Link>
        </div>
      </div>

      {/* Screens */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Salles</h2>
          <button
            onClick={() => setShowAddScreen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Ajouter une salle
          </button>
        </div>

        {showAddScreen && (
          <div className="mt-3 flex gap-2 rounded border bg-white p-3">
            <input
              placeholder="Nom de la salle"
              value={newScreenName}
              onChange={(e) => setNewScreenName(e.target.value)}
              className="flex-1 rounded border px-3 py-1.5 text-sm"
            />
            <input
              placeholder="Capacité"
              type="number"
              value={newScreenCapacity}
              onChange={(e) => setNewScreenCapacity(e.target.value)}
              className="w-28 rounded border px-3 py-1.5 text-sm"
            />
            <button
              onClick={() =>
                addScreenMutation.mutate({
                  name: newScreenName,
                  ...(newScreenCapacity ? { capacity: parseInt(newScreenCapacity) } : {}),
                })
              }
              disabled={!newScreenName}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Créer
            </button>
            <button onClick={() => setShowAddScreen(false)} className="text-sm text-gray-500">
              Annuler
            </button>
          </div>
        )}

        <div className="mt-3 space-y-4">
          {cinema.screens.map((screen) => (
            <div key={screen.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{screen.name}</h3>
                  <p className="text-xs text-gray-500">
                    {screen.capacity ? `${screen.capacity} places` : 'Capacité non définie'} —{' '}
                    {screen.status}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Supprimer cette salle ?')) deleteScreenMutation.mutate(screen.id);
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Supprimer
                </button>
              </div>

              {/* NUCs */}
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-gray-400">NUCs</p>
                  <button
                    onClick={() => addNucMutation.mutate(screen.id)}
                    disabled={addNucMutation.isPending}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Ajouter un NUC
                  </button>
                </div>
                {screen.nucs.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-400">Aucun NUC rattaché</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {screen.nucs.map((nuc) => (
                      <div
                        key={nuc.id}
                        className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${nuc.status === 'online' ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <code className="text-xs text-gray-700">{nuc.nucUid}</code>
                          <span className="text-xs text-gray-400">{nuc.status}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {nuc.lastSeenAt && (
                            <span>Vu : {new Date(nuc.lastSeenAt).toLocaleString('fr-FR')}</span>
                          )}
                          {nuc.lastIp && <span>{nuc.lastIp}</span>}
                          <button
                            onClick={() => {
                              if (confirm('Supprimer ce NUC ?')) deleteNucMutation.mutate(nuc.id);
                            }}
                            className="text-red-500 hover:underline"
                          >
                            Suppr.
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {cinema.screens.length === 0 && <p className="text-sm text-gray-400">Aucune salle</p>}
        </div>
      </div>

      {/* NUC creation modal */}
      {nucModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-bold text-gray-900">NUC créé</h2>
            <div className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">
                ⚠ IMPORTANT : Copie la clé maintenant. Elle ne sera plus jamais affichée.
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500">NUC UID</p>
                <code className="mt-1 block rounded bg-gray-100 px-3 py-2 font-mono text-sm">
                  {nucModal.nucUid}
                </code>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Auth Key (à copier sur le NUC)</p>
                <code className="mt-1 block select-all break-all rounded bg-gray-100 px-3 py-2 font-mono text-xs">
                  {nucModal.authKey}
                </code>
              </div>
            </div>
            <button
              onClick={() => setNucModal(null)}
              className="mt-6 w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              J&apos;ai copié la clé, fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
