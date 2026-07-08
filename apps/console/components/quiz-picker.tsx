'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';

interface QuizSummary {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  coverImageUrl: string | null;
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
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement des quiz...</p>
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((quiz) => {
            const isSelected = selectedSlug === quiz.slug;
            const coverUrl = resolveMediaUrl(quiz.coverImageUrl);

            return (
              <label
                key={quiz.slug}
                className={`cursor-pointer overflow-hidden rounded-lg border-2 bg-white shadow-sm transition hover:shadow-md ${
                  isSelected ? 'border-blue-600' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="quiz"
                  value={quiz.slug}
                  checked={isSelected}
                  onChange={() => onSelect(quiz.slug)}
                  className="sr-only"
                />
                <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <ImageIcon size={40} weight="duotone" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-gray-900">{quiz.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    <span>{quiz.questionsCount} questions</span>
                    <span className="capitalize">{quiz.type}</span>
                    {quiz.sponsor && <span>{quiz.sponsor.name}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun quiz publié disponible.</p>
      )}
    </div>
  );
}
