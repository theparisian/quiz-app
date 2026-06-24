'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus } from '@phosphor-icons/react';
import { api } from '../../../lib/api';

interface AvatarLibraryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  avatarsCount?: number;
  quizzesCount?: number;
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
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Bibliothèque
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Avatars
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  État
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Quizz
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.items.map((lib) => (
                <tr key={lib.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{lib.name}</div>
                    <div className="text-xs text-gray-500">{lib.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{lib.avatarsCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        lib.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {lib.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{lib.quizzesCount ?? 0}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    <Link
                      href={`/avatars/${lib.slug}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      Gérer
                      <ArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.items.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">
              Aucune bibliothèque. Créez-en une pour commencer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
