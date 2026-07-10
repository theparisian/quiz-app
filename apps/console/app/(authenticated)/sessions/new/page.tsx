'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { QuizPicker } from '@/components/quiz-picker';

export default function NewSessionPage() {
  const searchParams = useSearchParams();
  const screenId = searchParams.get('screenId');
  const router = useRouter();
  const [selectedQuizSlug, setSelectedQuizSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!selectedQuizSlug || !screenId) return;
    setCreating(true);
    setError('');
    try {
      const session = await api.post<{ id: string }>('/api/sessions', {
        quizSlug: selectedQuizSlug,
        screenId,
      });
      router.push(`/sessions/${session.id}/live`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={screenId ? `/screens/${screenId}` : '/dashboard'}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← {screenId ? 'Retour à la salle' : 'Retour'}
        </Link>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Nouvelle session</h1>
      <p className="mt-1 text-sm text-gray-500">Choisis un quiz à lancer</p>

      <div className="mt-6">
        <QuizPicker selectedSlug={selectedQuizSlug} onSelect={setSelectedQuizSlug} />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-end gap-3">
        <Link
          href={screenId ? `/screens/${screenId}` : '/dashboard'}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Annuler
        </Link>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!selectedQuizSlug || creating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Création...' : 'Lancer la session →'}
        </button>
      </div>
    </div>
  );
}
