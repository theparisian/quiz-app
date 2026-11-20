'use client';

import { useState } from 'react';
import { burgerConfigSchema, type BurgerConfig } from '@quiz-app/validation';

/**
 * Formulaire du mini-jeu burger, partagé par la création (`/games/new-burger`) et la
 * modification (`/games/[slug]/edit-burger`). Les étages et la recette sont fixes ; seuls le
 * rythme et les points se règlent. Validé par `burgerConfigSchema` avant l'envoi, puis par l'API.
 */

export interface BurgerFormValues {
  title: string;
  config: BurgerConfig;
}

interface BurgerFormProps {
  initial?: BurgerFormValues;
  submitLabel: string;
  onSubmit: (values: BurgerFormValues) => Promise<void>;
}

const DEFAULTS = burgerConfigSchema.parse({});

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

const FIELDS: { key: keyof BurgerConfig; label: string; hint: string }[] = [
  { key: 'countdownSeconds', label: 'Compte à rebours (s)', hint: '3 à 10 s avant la course.' },
  { key: 'durationSeconds', label: 'Durée de la course (s)', hint: '15 à 180 s.' },
  { key: 'resultsSeconds', label: 'Écran des résultats (s)', hint: '3 à 30 s.' },
  {
    key: 'pointsMax',
    label: 'Points maximum',
    hint: 'Burger terminé instantanément (décroît avec le temps).',
  },
  {
    key: 'pointsFloor',
    label: 'Points minimum d’un burger terminé',
    hint: 'À la dernière seconde.',
  },
  {
    key: 'partialPointsMax',
    label: 'Points d’un burger non terminé',
    hint: 'Au prorata des étages bien placés.',
  },
];

export function BurgerForm({ initial, submitLabel, onSubmit }: BurgerFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [values, setValues] = useState<BurgerConfig>(initial?.config ?? DEFAULTS);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (title.trim().length < 2) problems.push('Le titre doit faire au moins 2 caractères.');
    const parsed = burgerConfigSchema.safeParse(values);
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
          placeholder="Ex. Le burger express"
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
        Les joueurs remettent dans l’ordre 8 étages (pains, sauce, salade, tomates, steak et
        cheddar, oignons, cornichons). Tous partent du même burger mélangé ; le plus rapide gagne.
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
