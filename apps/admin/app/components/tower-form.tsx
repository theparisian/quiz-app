'use client';

import { useState } from 'react';
import { towerConfigSchema, type TowerConfig } from '@quiz-app/validation';

/**
 * Formulaire du mini-jeu tour de livres, partagé par la création (`/games/new-tower`) et la
 * modification (`/games/[slug]/edit-tower`). Les livres et la règle d'équilibre sont fixes ;
 * seuls le rythme et les points se règlent. Validé par `towerConfigSchema` avant l'envoi, puis par l'API.
 */

export interface TowerFormValues {
  title: string;
  config: TowerConfig;
}

interface TowerFormProps {
  initial?: TowerFormValues;
  submitLabel: string;
  onSubmit: (values: TowerFormValues) => Promise<void>;
}

const DEFAULTS = towerConfigSchema.parse({});

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

const FIELDS: { key: keyof TowerConfig; label: string; hint: string }[] = [
  {
    key: 'countdownSeconds',
    label: 'Compte à rebours (s)',
    hint: '3 à 10 s avant la construction.',
  },
  { key: 'durationSeconds', label: 'Durée de la construction (s)', hint: '20 à 180 s.' },
  { key: 'resultsSeconds', label: 'Écran des résultats (s)', hint: '3 à 30 s.' },
  {
    key: 'pointsPerCm',
    label: 'Points par centimètre',
    hint: 'Hauteur de la tour debout à la fin (1 m = 100 cm).',
  },
  { key: 'firstPlacePoints', label: 'Bonus de la plus haute tour', hint: '1re place.' },
  { key: 'secondPlacePoints', label: 'Bonus de la 2e tour', hint: '2e place.' },
  { key: 'thirdPlacePoints', label: 'Bonus de la 3e tour', hint: '3e place.' },
];

export function TowerForm({ initial, submitLabel, onSubmit }: TowerFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [values, setValues] = useState<TowerConfig>(initial?.config ?? DEFAULTS);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (title.trim().length < 2) problems.push('Le titre doit faire au moins 2 caractères.');
    const parsed = towerConfigSchema.safeParse(values);
    if (!parsed.success) {
      problems.push(...parsed.error.errors.map((err) => `${err.path.join('.')} : ${err.message}`));
    }
    setErrors(problems);
    if (problems.length > 0 || !parsed.success) return;
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), config: parsed.data });
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Une erreur est survenue.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-6 rounded-lg border bg-white p-6"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">Titre</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. La tour de livres"
          maxLength={255}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">{f.label}</span>
            <input
              type="number"
              className={inputClass}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
            />
            <span className="text-xs text-gray-400">{f.hint}</span>
          </label>
        ))}
      </div>

      <p className="text-sm text-gray-500">
        Les joueurs empilent des livres (romans, BD, mangas, dictionnaires…) qui glissent au-dessus
        de leur tour : un tap lâche le livre. Une pile mal équilibrée s’écroule. Tous reçoivent la
        même suite de livres ; la plus haute tour debout à la fin gagne.
      </p>

      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-600">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
