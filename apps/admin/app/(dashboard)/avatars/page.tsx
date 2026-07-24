'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCircle } from '@phosphor-icons/react';
import { api } from '../../../lib/api';
import { resolveMediaUrl } from '../../../lib/media-url';

interface AvatarLibraryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  avatarsCount?: number;
  quizzesCount?: number;
  previewImageUrl?: string | null;
}

interface ListResponse {
  items: AvatarLibraryRow[];
}

export default function AvatarLibrariesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['avatar-libraries', 'all'],
    queryFn: () => api.get<ListResponse>('/api/avatar-libraries'),
  });

  const createMut = useMutation({
    mutationFn: () => api.post<{ slug: string }>('/api/avatar-libraries', { name: newName }),
    onSuccess: (lib) => {
      void qc.invalidateQueries({ queryKey: ['avatar-libraries'] });
      setShowCreate(false);
      setNewName('');
      router.push(`/avatars/${lib.slug}`);
    },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bibliothèques d&apos;avatars</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.items.length ?? 0} bibliothèque(s)</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} weight="bold" />
          Nouvelle bibliothèque
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouvelle bibliothèque</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Nom (ex: Animaux, Cinéma…)"
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
          Aucune bibliothèque. Créez-en une pour commencer.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((lib) => {
            const preview = resolveMediaUrl(lib.previewImageUrl);
            return (
              <Link
                key={lib.id}
                href={`/avatars/${lib.slug}`}
                className="group flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-colors hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex aspect-square items-center justify-center bg-gray-50 p-6">
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="aspect-square w-3/4 max-w-[160px] rounded-full border-4 border-white object-cover shadow-sm transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex aspect-square w-3/4 max-w-[160px] items-center justify-center rounded-full border-4 border-white bg-gray-100 text-gray-300 shadow-sm">
                      <UserCircle size={64} weight="duotone" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col border-t p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
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
                  <p className="mt-1 text-xs text-gray-500">{lib.slug}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    {lib.avatarsCount ?? 0} avatar{(lib.avatarsCount ?? 0) !== 1 ? 's' : ''}
                    {' · '}
                    {lib.quizzesCount ?? 0} quizz
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
