'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface QuizSummary {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  questionsCount: number;
  sponsor: { name: string } | null;
}

interface QuizListResponse {
  items: QuizSummary[];
  total: number;
}

interface QuizPickerProps {
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

export function QuizPicker({ selectedSlug, onSelect }: QuizPickerProps) {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<QuizListResponse>({
    queryKey: ['quizzes', 'published', search],
    queryFn: () => {
      const params = new URLSearchParams({ status: 'published', limit: '100' });
      if (search) params.set('search', search);
      return api.get<QuizListResponse>(`/api/quizzes?${params}`);
    },
    staleTime: 30_000,
  });

  return (
    <div>
      <input
        type="text"
        placeholder="Rechercher un quiz..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement des quiz...</p>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-2">
          {data.items.map((quiz) => (
            <label
              key={quiz.slug}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                selectedSlug === quiz.slug
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="quiz"
                value={quiz.slug}
                checked={selectedSlug === quiz.slug}
                onChange={() => onSelect(quiz.slug)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{quiz.title}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>{quiz.questionsCount} questions</span>
                  <span className="capitalize">{quiz.type}</span>
                  {quiz.sponsor && <span>Sponsor : {quiz.sponsor.name}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun quiz publié disponible.</p>
      )}
    </div>
  );
}
