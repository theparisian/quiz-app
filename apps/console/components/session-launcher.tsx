'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Play, X } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { QuizPicker, type QuizSummary } from '@/components/quiz-picker';

/** Nombre maximal de jeux (manches) d'une séance (même limite que l'API). */
export const MAX_GAMES_PER_SESSION = 5;

/** Durée par question quand le quiz n'a pas de durée estimée (réponse + résultats). */
const FALLBACK_SECONDS_PER_QUESTION = 30;

interface SessionLauncherProps {
  screenId: string;
  onLaunched: (sessionId: string) => void;
}

/** Durée estimée d'un jeu (secondes) : celle du quiz, sinon d'après son nombre de questions. */
export function estimateGameSeconds(quiz: QuizSummary): number {
  return quiz.durationEstimateSeconds ?? quiz.questionsCount * FALLBACK_SECONDS_PER_QUESTION;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${minutes} min`;
}

/**
 * Lancement d'une séance : un ou plusieurs jeux (5 au maximum), joués dans l'ordre choisi.
 * Un seul jeu : parcours historique (`quizSlug`) ; plusieurs : `gameSlugs` (le jeu d'un quiz
 * reprend le slug du quiz).
 */
export function SessionLauncher({ screenId, onLaunched }: SessionLauncherProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<QuizSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const maxReached = selected.length >= MAX_GAMES_PER_SESSION;
  const totalSeconds = selected.reduce((acc, q) => acc + estimateGameSeconds(q), 0);

  const toggle = (quiz: QuizSummary) => {
    setSelected((prev) => {
      if (prev.some((q) => q.slug === quiz.slug)) return prev.filter((q) => q.slug !== quiz.slug);
      if (prev.length >= MAX_GAMES_PER_SESSION) return prev;
      return [...prev, quiz];
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    setSelected((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const remove = (slug: string) => setSelected((prev) => prev.filter((q) => q.slug !== slug));

  const handleCreate = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    setError('');
    try {
      const body =
        selected.length === 1
          ? { quizSlug: selected[0]!.slug, screenId }
          : { gameSlugs: selected.map((q) => q.slug), screenId };
      const session = await api.post<{ id: string }>('/api/sessions', body);
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'screen', screenId] });
      onLaunched(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
      setCreating(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Lancer une session</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choisissez un ou plusieurs quiz ({MAX_GAMES_PER_SESSION} au maximum) à projeter sur cette
        salle, dans l&apos;ordre des manches.
      </p>

      {selected.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <div className="flex items-center justify-between text-xs font-medium uppercase text-gray-500">
            <span>
              {selected.length === 1 ? '1 manche' : `${selected.length} manches`}
              {maxReached && ' (maximum atteint)'}
            </span>
            <span>Durée totale estimée : {formatDuration(totalSeconds)}</span>
          </div>
          <ol className="mt-2 space-y-1.5">
            {selected.map((quiz, i) => (
              <li
                key={quiz.slug}
                className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm shadow-sm"
              >
                <span className="w-16 shrink-0 text-xs font-semibold text-blue-700">
                  Manche {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-900">{quiz.title}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDuration(estimateGameSeconds(quiz))}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Monter"
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label="Descendre"
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(quiz.slug)}
                  aria-label="Retirer"
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4">
        <QuizPicker
          selectedSlugs={selected.map((q) => q.slug)}
          onToggle={toggle}
          maxReached={maxReached}
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={selected.length === 0 || creating}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Play size={16} weight="fill" />
          {creating ? 'Création...' : 'Lancer la session'}
        </button>
      </div>
    </div>
  );
}
