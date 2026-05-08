'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import type { QuizApiDetail } from '../../../../../lib/quiz-editor-store';
import { resolveMediaUrl } from '../../../../../lib/media-url';

function readBranding(json: unknown): { primary: string; secondary: string } {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    return {
      primary: typeof o.primary === 'string' ? o.primary : '#1e40af',
      secondary: typeof o.secondary === 'string' ? o.secondary : '#64748b',
    };
  }
  return { primary: '#1e40af', secondary: '#64748b' };
}

export function QuizPreviewClient({ slug }: { slug: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quiz', slug, 'preview'],
    queryFn: () => api.get<QuizApiDetail>(`/api/quizzes/${slug}`),
  });

  if (isLoading) return <p className="text-gray-500">Chargement…</p>;
  if (error || !data) return <p className="text-red-600">Impossible de charger le quizz.</p>;

  const brand = readBranding(data.brandingJson);
  const cover = resolveMediaUrl(data.coverImageUrl);
  const ordered = [...data.questions].sort((a, b) => a.position - b.position);

  return (
    <div
      className="min-h-screen p-8"
      style={{
        background: `linear-gradient(160deg, ${brand.primary}22, ${brand.secondary}18)`,
      }}
    >
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href={`/quizzes/${slug}/edit`} className="text-sm text-blue-600 hover:underline">
            ← Édition
          </Link>
          <Link href="/quizzes" className="text-sm text-gray-500 hover:underline">
            Liste
          </Link>
        </div>

        {cover && (
          <img src={cover} alt="" className="mb-6 max-h-48 w-full rounded-lg object-cover" />
        )}

        <h1 className="text-3xl font-bold" style={{ color: brand.primary }}>
          {data.title}
        </h1>
        {data.description && (
          <p className="mt-2 whitespace-pre-wrap text-gray-700">{data.description}</p>
        )}
        <p className="mt-2 text-sm text-gray-500">
          {data.type} · {data.language} · {data.status}
        </p>

        <hr className="my-8" />

        <ol className="space-y-10">
          {ordered.map((q, i) => {
            const img = resolveMediaUrl(q.imageUrl);
            return (
              <li key={q.id}>
                <p className="text-sm font-semibold text-gray-500">Question {i + 1}</p>
                <p className="mt-1 text-lg text-gray-900">{q.text}</p>
                {img && (
                  <img
                    src={img}
                    alt=""
                    className="mt-3 max-h-40 rounded-md border object-contain"
                  />
                )}
                <ul className="mt-4 space-y-2">
                  {q.answers.map((a) => (
                    <li
                      key={a.id}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        a.isCorrect ? 'border-green-300 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <span className="font-mono font-semibold text-gray-600">{a.position}.</span>{' '}
                      {a.text}
                    </li>
                  ))}
                </ul>
                {q.explanation && (
                  <p className="mt-3 text-sm text-gray-600">
                    <span className="font-medium">Explication :</span> {q.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
