'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MusicNote, Plus, SpeakerHigh } from '@phosphor-icons/react';
import { api } from '../../../lib/api';
import type { SoundLibraryRow } from '../../../lib/audio-api';
import { PageHeader } from '../../components/page-header';
import { getNavItem } from '../../../lib/nav-items';

interface ListResponse {
  items: SoundLibraryRow[];
}

export default function SoundLibrariesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sound-libraries', 'all'],
    queryFn: () => api.get<ListResponse>('/api/sound-libraries'),
  });

  const createMut = useMutation({
    mutationFn: () => api.post<{ slug: string }>('/api/sound-libraries', { name: newName }),
    onSuccess: (lib) => {
      void qc.invalidateQueries({ queryKey: ['sound-libraries'] });
      setShowCreate(false);
      setNewName('');
      router.push(`/audio/${lib.slug}`);
    },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <div>
      <PageHeader
        icon={getNavItem('/audio')!.icon}
        title="Bibliothèques de sons"
        subtitle={`${data?.items.length ?? 0} bibliothèque(s) · musiques et effets sonores de l'écran cinéma`}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} weight="bold" />
            Nouvelle bibliothèque
          </button>
        }
      />

      {showCreate && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouvelle bibliothèque</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Nom (ex: Ambiances cinéma, Effets courts…)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={newName.trim().length < 2 || createMut.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-6 text-gray-400">Chargement…</p>
      ) : data?.items.length === 0 ? (
        <p className="mt-6 rounded-lg border bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Aucune bibliothèque. Créez-en une pour commencer à téléverser des sons.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((lib) => (
            <Link
              key={lib.id}
              href={`/audio/${lib.slug}`}
              className="group flex items-start gap-4 rounded-lg border bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <MusicNote size={26} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                    {lib.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      lib.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {lib.isActive ? 'active' : 'inactive'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">{lib.slug}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <SpeakerHigh size={14} />
                  {lib.soundsCount ?? 0} son{(lib.soundsCount ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
