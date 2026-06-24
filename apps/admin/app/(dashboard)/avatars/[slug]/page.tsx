'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash } from '@phosphor-icons/react';
import { api, apiUploadFile } from '../../../../lib/api';
import { resolveMediaUrl } from '../../../../lib/media-url';

interface AvatarItem {
  id: string;
  imageUrl: string;
  label: string | null;
  position: number;
}

interface AvatarLibraryDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  quizzesCount?: number;
  avatars: AvatarItem[];
}

export default function AvatarLibraryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const slug = params.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['avatar-library', slug],
    queryFn: () => api.get<AvatarLibraryDetail>(`/api/avatar-libraries/${slug}`),
  });

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.description ?? '');
    }
  }, [data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['avatar-library', slug] });
    void qc.invalidateQueries({ queryKey: ['avatar-libraries'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch<AvatarLibraryDetail>(`/api/avatar-libraries/${slug}`, {
        name,
        description: description.trim() || null,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (active: boolean) =>
      api.post<AvatarLibraryDetail>(
        `/api/avatar-libraries/${slug}/${active ? 'activate' : 'deactivate'}`,
        {},
      ),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const deleteAvatarMut = useMutation({
    mutationFn: (avatarId: string) =>
      api.delete<AvatarLibraryDetail>(`/api/avatar-libraries/${slug}/avatars/${avatarId}`),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const deleteLibraryMut = useMutation({
    mutationFn: () => api.delete(`/api/avatar-libraries/${slug}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['avatar-libraries'] });
      router.push('/avatars');
    },
    onError: (e: Error) => alert(e.message),
  });

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await apiUploadFile<AvatarLibraryDetail>(`/api/avatar-libraries/${slug}/avatars`, file);
      }
      invalidate();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (isLoading || !data) {
    return <p className="text-gray-400">Chargement…</p>;
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/avatars"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={14} />
        Bibliothèques
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleActiveMut.mutate(!data.isActive)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {data.isActive ? 'Désactiver' : 'Activer'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Supprimer cette bibliothèque et tous ses avatars ?')) {
                deleteLibraryMut.mutate();
              }
            }}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Informations</h2>
        <div className="mt-3 grid gap-3">
          <label className="text-sm">
            Nom
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={name.trim().length < 2 || saveMut.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Avatars ({data.avatars.length})</h2>
          <label className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            {uploading ? 'Envoi…' : 'Ajouter des avatars'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          PNG transparent recommandé. Les images sont recadrées en cercle 512×512.
        </p>

        {data.avatars.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Aucun avatar pour le moment.</p>
        ) : (
          <div className="mt-4 grid grid-cols-4 gap-4 sm:grid-cols-6">
            {data.avatars.map((a) => (
              <div key={a.id} className="group relative">
                <img
                  src={resolveMediaUrl(a.imageUrl) ?? a.imageUrl}
                  alt={a.label ?? ''}
                  className="aspect-square w-full rounded-full border object-cover"
                />
                <button
                  type="button"
                  onClick={() => deleteAvatarMut.mutate(a.id)}
                  className="absolute -right-1 -top-1 rounded-full bg-red-600 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Supprimer l'avatar"
                >
                  <Trash size={12} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
