'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash } from '@phosphor-icons/react';
import {
  AUDIO_MIME_TYPES,
  AUDIO_SLOTS,
  CONTINUOUS_MUSIC_SLOTS,
  type AudioSlotDefinition,
  type QuizAudioConfig,
  type SoundKind,
} from '@quiz-app/validation';
import { api } from '../../../../../lib/api';
import {
  formatSoundSize,
  uploadSound,
  type SoundLibraryRow,
  type SoundRow,
} from '../../../../../lib/audio-api';
import { SoundPreview } from '../../../../components/sound-preview';
import { useQuizEditorStore } from '../../../../../lib/quiz-editor-store';

interface SelectableSounds {
  libraries: (SoundLibraryRow & { sounds: SoundRow[] })[];
  quizSounds: SoundRow[];
}

const PHASE_SECTIONS: { phase: AudioSlotDefinition['phase']; title: string; hint: string }[] = [
  {
    phase: 'lobby',
    title: 'Lobby',
    hint: 'Avant le lancement du quiz, pendant que la salle rejoint la partie.',
  },
  {
    phase: 'game',
    title: 'Déroulé de la partie',
    hint: 'Questions, apparition des réponses et clôture.',
  },
  {
    phase: 'results',
    title: 'Scores et podium',
    hint: 'Tableau des scores et résultats finaux.',
  },
];

function AudioSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function SlotRow({
  slot,
  config,
  sounds,
  disabled,
  onChange,
}: {
  slot: AudioSlotDefinition;
  config: QuizAudioConfig;
  sounds: SelectableSounds;
  disabled: boolean;
  onChange: (patch: { soundId?: string | null; volume?: number }) => void;
}) {
  const assignment = config.slots[slot.key] ?? { soundId: null, volume: slot.defaultVolume };
  const byKind = (list: SoundRow[]) => list.filter((s) => s.kind === slot.kind);

  const selected =
    [...sounds.quizSounds, ...sounds.libraries.flatMap((l) => l.sounds)].find(
      (s) => s.id === assignment.soundId,
    ) ?? null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{slot.label}</p>
          <p className="mt-1 text-xs text-gray-500">{slot.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
          {slot.kind === 'music' ? 'Musique' : 'Effet'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {selected ? <SoundPreview audioUrl={selected.audioUrl} label={selected.label} /> : null}
        <select
          disabled={disabled}
          value={assignment.soundId ?? ''}
          onChange={(e) => onChange({ soundId: e.target.value || null })}
          className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="">
            {slot.builtInUrl ? '— Son par défaut —' : '— Aucun son (silence) —'}
          </option>
          {byKind(sounds.quizSounds).length > 0 ? (
            <optgroup label="Sons de ce quiz">
              {byKind(sounds.quizSounds).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {sounds.libraries.map((lib) =>
            byKind(lib.sounds).length > 0 ? (
              <optgroup key={lib.id} label={lib.name}>
                {byKind(lib.sounds).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            value={assignment.volume}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
            className="w-28"
          />
          <span className="w-8 text-right tabular-nums">{assignment.volume}</span>
        </label>
      </div>
    </div>
  );
}

export function QuizAudioTab({ slug, readOnly }: { slug: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const audioConfig = useQuizEditorStore((s) => s.audioConfig);
  const updateMetadata = useQuizEditorStore((s) => s.updateMetadata);
  const [uploadKind, setUploadKind] = useState<SoundKind>('sfx');
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['quiz-sounds', slug],
    queryFn: () => api.get<SelectableSounds>(`/api/quizzes/${slug}/sounds`),
  });

  const sounds: SelectableSounds = data ?? { libraries: [], quizSounds: [] };

  const deleteSoundMut = useMutation({
    mutationFn: (soundId: string) => api.delete(`/api/quizzes/${slug}/sounds/${soundId}`),
    onSuccess: (_res, soundId) => {
      // Un slot qui pointait sur ce son deviendrait une référence invalide au save.
      clearSlotsUsing(soundId);
      void qc.invalidateQueries({ queryKey: ['quiz-sounds', slug] });
    },
    onError: (e: Error) => alert(e.message),
  });

  function patchConfig(patch: Partial<QuizAudioConfig>) {
    updateMetadata({ audioConfig: { ...audioConfig, ...patch } });
  }

  function patchSlot(key: string, patch: { soundId?: string | null; volume?: number }) {
    const current = audioConfig.slots[key] ?? { soundId: null, volume: 50 };
    patchConfig({ slots: { ...audioConfig.slots, [key]: { ...current, ...patch } } });
  }

  function clearSlotsUsing(soundId: string) {
    const slots = { ...audioConfig.slots };
    let touched = false;
    for (const [key, slot] of Object.entries(slots)) {
      if (slot.soundId === soundId) {
        slots[key] = { ...slot, soundId: null };
        touched = true;
      }
    }
    if (touched) patchConfig({ slots });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadSound(`/api/quizzes/${slug}/sounds`, file, { kind: uploadKind });
      }
      void qc.invalidateQueries({ queryKey: ['quiz-sounds', slug] });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const continuousActive = audioConfig.continuousMusic;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Réglages généraux</h3>
        <p className="mt-1 text-xs text-gray-500">
          Le son est diffusé uniquement sur l&apos;écran de la salle. Les téléphones des joueurs
          restent silencieux.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={audioConfig.enabled}
              onChange={(e) => patchConfig({ enabled: e.target.checked })}
            />
            Activer l&apos;audio pour ce quiz
          </label>

          <label className="flex flex-wrap items-center gap-3 text-sm">
            Volume général
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={readOnly || !audioConfig.enabled}
              value={audioConfig.masterVolume}
              onChange={(e) => patchConfig({ masterVolume: Number(e.target.value) })}
              className="w-48"
            />
            <span className="w-8 text-right text-xs tabular-nums text-gray-600">
              {audioConfig.masterVolume}
            </span>
          </label>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={readOnly || !audioConfig.enabled}
                checked={continuousActive}
                onChange={(e) => patchConfig({ continuousMusic: e.target.checked })}
              />
              Une seule musique, sans interruption
            </label>
            <p className="mt-1 text-xs text-gray-500">
              La piste choisie pour le lobby continue pendant la partie et le tableau des scores.
              Les musiques des autres phases sont ignorées.
            </p>
          </div>
        </div>
      </section>

      {PHASE_SECTIONS.map((section) => {
        const slots = AUDIO_SLOTS.filter((slot) => slot.phase === section.phase);
        return (
          <AudioSection key={section.phase} title={section.title} hint={section.hint}>
            {slots.map((slot) => {
              const ignoredByContinuous =
                continuousActive &&
                slot.kind === 'music' &&
                CONTINUOUS_MUSIC_SLOTS.includes(slot.key) &&
                slot.key !== CONTINUOUS_MUSIC_SLOTS[0];

              return (
                <div key={slot.key} className={ignoredByContinuous ? 'opacity-50' : undefined}>
                  <SlotRow
                    slot={slot}
                    config={audioConfig}
                    sounds={sounds}
                    disabled={readOnly || !audioConfig.enabled || ignoredByContinuous}
                    onChange={(patch) => patchSlot(slot.key, patch)}
                  />
                </div>
              );
            })}
          </AudioSection>
        );
      })}

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Sons propres à ce quiz</h3>
            <p className="mt-1 text-xs text-gray-500">
              Pour les sons qui n&apos;ont pas vocation à être réutilisés. Les sons partagés se
              gèrent dans la section Audio du menu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as SoundKind)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="sfx">Effet</option>
              <option value="music">Musique</option>
            </select>
            <label
              className={`cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${
                readOnly ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {uploading ? 'Envoi…' : 'Téléverser'}
              <input
                type="file"
                accept={AUDIO_MIME_TYPES.join(',')}
                multiple
                disabled={uploading || readOnly}
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
          </div>
        </div>

        {sounds.quizSounds.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Aucun son spécifique à ce quiz.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {sounds.quizSounds.map((sound) => (
              <li key={sound.id} className="flex items-center gap-3 py-2.5">
                <SoundPreview audioUrl={sound.audioUrl} label={sound.label} />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{sound.label}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  {sound.kind === 'music' ? 'Musique' : 'Effet'}
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-400">
                  {formatSoundSize(sound.sizeBytes)}
                </span>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    if (confirm(`Supprimer « ${sound.label} » ?`)) {
                      deleteSoundMut.mutate(sound.id);
                    }
                  }}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  aria-label="Supprimer le son"
                >
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
