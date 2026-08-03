'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Trash } from '@phosphor-icons/react';
import { AUDIO_MIME_TYPES, type SoundKind } from '@quiz-app/validation';
import { api } from '../../../../lib/api';
import {
  formatSoundSize,
  uploadSound,
  type SoundLibraryDetail,
  type SoundRow,
} from '../../../../lib/audio-api';
import { SoundPreview } from '../../../components/sound-preview';

const ACCEPT_AUDIO = AUDIO_MIME_TYPES.join(',');

const KIND_LABELS: Record<SoundKind, string> = {
  music: 'Musique',
  sfx: 'Effet',
};

export default function SoundLibraryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const slug = params.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadKind, setUploadKind] = useState<SoundKind>('sfx');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sound-library', slug],
    queryFn: () => api.get<SoundLibraryDetail>(`/api/sound-libraries/${slug}`),
  });

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.description ?? '');
    }
  }, [data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['sound-library', slug] });
    void qc.invalidateQueries({ queryKey: ['sound-libraries'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch<SoundLibraryDetail>(`/api/sound-libraries/${slug}`, {
        name,
        description: description.trim() || null,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (active: boolean) =>
      api.post<SoundLibraryDetail>(
        `/api/sound-libraries/${slug}/${active ? 'activate' : 'deactivate'}`,
        {},
      ),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const updateSoundMut = useMutation({
    mutationFn: (input: { soundId: string; label?: string; kind?: SoundKind }) =>
      api.patch<SoundLibraryDetail>(`/api/sound-libraries/${slug}/sounds/${input.soundId}`, {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const deleteSoundMut = useMutation({
    mutationFn: (soundId: string) =>
      api.delete<SoundLibraryDetail>(`/api/sound-libraries/${slug}/sounds/${soundId}`),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.patch<SoundLibraryDetail>(`/api/sound-libraries/${slug}/sounds/reorder`, { orderedIds }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  const deleteLibraryMut = useMutation({
    mutationFn: () => api.delete(`/api/sound-libraries/${slug}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sound-libraries'] });
      router.push('/audio');
    },
    onError: (e: Error) => alert(e.message),
  });

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadSound<SoundLibraryDetail>(`/api/sound-libraries/${slug}/sounds`, file, {
          kind: uploadKind,
        });
      }
      invalidate();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function move(sounds: SoundRow[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sounds.length) return;
    const ordered = sounds.map((s) => s.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);
    reorderMut.mutate(ordered);
  }

  if (isLoading || !data) {
    return <p className="text-gray-400">Chargement…</p>;
  }

  const musics = data.sounds.filter((s) => s.kind === 'music');
  const sfx = data.sounds.filter((s) => s.kind === 'sfx');

  function renderGroup(title: string, sounds: SoundRow[], hint: string) {
    return (
      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">
          {title} ({sounds.length})
        </h2>
        <p className="mt-1 text-xs text-gray-500">{hint}</p>

        {sounds.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Aucun son dans cette catégorie.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {sounds.map((sound, index) => (
              <li key={sound.id} className="flex items-center gap-3 py-2.5">
                <SoundPreview audioUrl={sound.audioUrl} label={sound.label} />
                <input
                  type="text"
                  defaultValue={sound.label}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (label && label !== sound.label) {
                      updateSoundMut.mutate({ soundId: sound.id, label });
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-gray-200 focus:border-gray-300"
                />
                <select
                  value={sound.kind}
                  onChange={(e) =>
                    updateSoundMut.mutate({ soundId: sound.id, kind: e.target.value as SoundKind })
                  }
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600"
                >
                  {(Object.keys(KIND_LABELS) as SoundKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-400">
                  {formatSoundSize(sound.sizeBytes)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(sounds, index, -1)}
                    disabled={index === 0 || reorderMut.isPending}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Monter"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(sounds, index, 1)}
                    disabled={index === sounds.length - 1 || reorderMut.isPending}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Descendre"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer « ${sound.label} » ?`)) {
                        deleteSoundMut.mutate(sound.id);
                      }
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer le son"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/audio"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={14} />
        Bibliothèques de sons
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
              if (confirm('Supprimer cette bibliothèque et tous ses sons ?')) {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800">Ajouter des sons</h2>
          <div className="flex items-center gap-2">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as SoundKind)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              {(Object.keys(KIND_LABELS) as SoundKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <label className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {uploading ? 'Envoi…' : 'Téléverser'}
              <input
                type="file"
                accept={ACCEPT_AUDIO}
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          MP3, OGG, WAV, M4A ou FLAC. Les musiques sont jouées en boucle : privilégiez des pistes
          qui bouclent proprement. Les effets doivent rester très courts.
        </p>
      </div>

      {renderGroup(
        'Musiques',
        musics,
        'Fonds sonores du lobby, de la partie et du tableau des scores.',
      )}
      {renderGroup(
        'Effets sonores',
        sfx,
        "Sons ponctuels : ouverture de question, apparition d'une réponse, dernières secondes, réponse d'un joueur.",
      )}
    </div>
  );
}
