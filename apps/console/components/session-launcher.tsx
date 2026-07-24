'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Play } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { QuizPicker } from '@/components/quiz-picker';

interface SessionLauncherProps {
  screenId: string;
  onLaunched: (sessionId: string) => void;
}

export function SessionLauncher({ screenId, onLaunched }: SessionLauncherProps) {
  const queryClient = useQueryClient();
  const [selectedQuizSlug, setSelectedQuizSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!selectedQuizSlug) return;
    setCreating(true);
    setError('');
    try {
      const session = await api.post<{ id: string }>('/api/sessions', {
        quizSlug: selectedQuizSlug,
        screenId,
      });
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
      <p className="mt-1 text-sm text-gray-500">Choisis un quiz à projeter sur cette salle.</p>

      <div className="mt-4">
        <QuizPicker selectedSlug={selectedQuizSlug} onSelect={setSelectedQuizSlug} />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!selectedQuizSlug || creating}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Play size={16} weight="fill" />
          {creating ? 'Création...' : 'Lancer la session'}
        </button>
      </div>
    </div>
  );
}
