'use client';

import { useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import {
  POLL_MAX_OPTIONS,
  POLL_MAX_QUESTIONS,
  POLL_MIN_OPTIONS,
  pollConfigSchema,
  type PollConfig,
} from '@quiz-app/validation';

/**
 * Formulaire d'un sondage (B6), partagé par la création (`/games/new-poll`) et la modification
 * (`/games/[slug]/edit-poll`). Le contenu est validé par `pollConfigSchema` avant l'envoi, puis
 * par l'API.
 */

interface OptionDraft {
  id: string;
  text: string;
}

interface QuestionDraft {
  id: string;
  text: string;
  durationSeconds: number;
  options: OptionDraft[];
}

export interface PollFormValues {
  title: string;
  config: PollConfig;
}

interface PollFormProps {
  initial?: PollFormValues;
  submitLabel: string;
  onSubmit: (values: PollFormValues) => Promise<void>;
}

/** Premier identifiant libre de la forme `<prefix><n>`. */
function nextId(prefix: string, taken: { id: string }[]): string {
  const ids = new Set(taken.map((t) => t.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function newQuestion(taken: QuestionDraft[]): QuestionDraft {
  return {
    id: nextId('q', taken),
    text: '',
    durationSeconds: 20,
    options: [
      { id: 'o1', text: '' },
      { id: 'o2', text: '' },
    ],
  };
}

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50';

export function PollForm({ initial, submitLabel, onSubmit }: PollFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [participationPoints, setParticipationPoints] = useState(
    initial?.config.participationPoints ?? 300,
  );
  const [resultsSeconds, setResultsSeconds] = useState(initial?.config.resultsSeconds ?? 6);
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initial?.config.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })) ?? [
      newQuestion([]),
    ],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, j) => (j === oIndex ? { ...o, text } : o)) }
          : q,
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (title.trim().length < 2) problems.push('Le titre doit contenir au moins 2 caractères.');
    const parsed = pollConfigSchema.safeParse({ questions, participationPoints, resultsSeconds });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, qIndex, field, oIndex] = issue.path;
        const where =
          first === 'questions' && typeof qIndex === 'number'
            ? `Question ${qIndex + 1}${field === 'options' && typeof oIndex === 'number' ? `, option ${oIndex + 1}` : ''}`
            : String(first ?? 'Sondage');
        problems.push(`${where} : ${issue.message}`);
      }
    }
    setErrors(problems);
    if (problems.length > 0 || !parsed.success) return;
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), config: parsed.data });
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Enregistrement impossible.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <label className="block text-sm font-medium text-gray-700">
          Titre
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
            className={`mt-1 ${inputClass}`}
            placeholder="Sondage de la séance"
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-gray-700">
            Points de participation (0 à 1000)
            <input
              type="number"
              min={0}
              max={1000}
              value={participationPoints}
              onChange={(e) => setParticipationPoints(Number(e.target.value))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Affichage des résultats (3 à 20 s)
            <input
              type="number"
              min={3}
              max={20}
              value={resultsSeconds}
              onChange={(e) => setResultsSeconds(Number(e.target.value))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      </section>

      {questions.map((q, qIndex) => (
        <section key={q.id} className="rounded-lg border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Question {qIndex + 1}</h2>
            {questions.length > 1 && (
              <button
                type="button"
                onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIndex))}
                className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
              >
                <Trash size={14} /> Supprimer
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-4">
            <input
              value={q.text}
              onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
              maxLength={200}
              className={inputClass}
              placeholder="Intitulé de la question"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Durée (5 à 60 s)
              <input
                type="number"
                min={5}
                max={60}
                value={q.durationSeconds}
                onChange={(e) =>
                  updateQuestion(qIndex, { durationSeconds: Number(e.target.value) })
                }
                className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {q.options.map((o, oIndex) => (
              <div key={o.id} className="flex items-center gap-2">
                <span className="w-6 text-sm font-bold text-gray-500">
                  {String.fromCharCode(65 + oIndex)}
                </span>
                <input
                  value={o.text}
                  onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                  maxLength={80}
                  className={inputClass}
                  placeholder={`Option ${oIndex + 1}`}
                />
                {q.options.length > POLL_MIN_OPTIONS && (
                  <button
                    type="button"
                    aria-label="Supprimer l'option"
                    onClick={() =>
                      updateQuestion(qIndex, {
                        options: q.options.filter((_, j) => j !== oIndex),
                      })
                    }
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))}
            {q.options.length < POLL_MAX_OPTIONS && (
              <button
                type="button"
                onClick={() =>
                  updateQuestion(qIndex, {
                    options: [...q.options, { id: nextId('o', q.options), text: '' }],
                  })
                }
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus size={14} /> Ajouter une option
              </button>
            )}
          </div>
        </section>
      ))}

      {questions.length < POLL_MAX_QUESTIONS && (
        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, newQuestion(qs)])}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <Plus size={16} /> Ajouter une question ({questions.length} / {POLL_MAX_QUESTIONS})
        </button>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md bg-red-50 p-4 text-sm text-red-700">
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
