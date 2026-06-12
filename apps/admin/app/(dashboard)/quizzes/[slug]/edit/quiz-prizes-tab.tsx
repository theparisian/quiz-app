'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';

type RankMode = 'inherit' | 'none' | 'template';

interface PrizeTemplate {
  id: string;
  label: string;
  stockLabel: string;
  stock: number | null;
  isActive: boolean;
}

interface InheritedPreview {
  type: string;
  label: string;
  value?: string;
}

interface QuizPrizesConfigResponse {
  config: {
    rank1?: { mode: RankMode; templateId?: string };
    rank2?: { mode: RankMode; templateId?: string };
    rank3?: { mode: RankMode; templateId?: string };
    all?: { mode: RankMode; templateId?: string };
  };
  inheritedPreview: {
    rank1: InheritedPreview | null;
    rank2: InheritedPreview | null;
    rank3: InheritedPreview | null;
    all?: InheritedPreview | null;
  };
}

const RANKS = [
  { key: 'rank1' as const, label: '🥇 1ère place' },
  { key: 'rank2' as const, label: '🥈 2ème place' },
  { key: 'rank3' as const, label: '🥉 3ème place' },
  { key: 'all' as const, label: '🎁 Tous les joueurs' },
];

export function QuizPrizesTab({ slug, sponsorId }: { slug: string; sponsorId: string | null }) {
  const qc = useQueryClient();
  const [modes, setModes] = useState<Record<string, RankMode>>({
    rank1: 'inherit',
    rank2: 'inherit',
    rank3: 'inherit',
    all: 'inherit',
  });
  const [templateIds, setTemplateIds] = useState<Record<string, string>>({});

  const configQ = useQuery({
    queryKey: ['quiz-prizes-config', slug],
    queryFn: () => api.get<QuizPrizesConfigResponse>(`/api/quizzes/${slug}/prizes-config`),
    enabled: !!slug,
  });

  const cinemaSlugQ = useQuery({
    queryKey: ['cinemas-list-pick'],
    queryFn: () => api.get<{ items: { slug: string }[] }>('/api/cinemas?limit=1'),
  });
  const cinemaSlug = cinemaSlugQ.data?.items[0]?.slug ?? '';

  const cinemaTemplatesQ = useQuery({
    queryKey: ['cinema-prize-templates-pick', cinemaSlug],
    queryFn: () =>
      api.get<{ items: PrizeTemplate[] }>(`/api/cinemas/${cinemaSlug}/prize-templates`),
    enabled: !!cinemaSlug,
  });

  const sponsorTemplatesQ = useQuery({
    queryKey: ['sponsor-prize-templates-pick', sponsorId],
    queryFn: async () => {
      if (!sponsorId) return { items: [] as PrizeTemplate[] };
      const sponsors = await api.get<{ items: { id: string; slug: string }[] }>(
        '/api/sponsors?limit=500',
      );
      const sp = sponsors.items.find((s: { id: string }) => s.id === sponsorId);
      if (!sp) return { items: [] };
      return api.get<{ items: PrizeTemplate[] }>(`/api/sponsors/${sp.slug}/prize-templates`);
    },
    enabled: !!sponsorId,
  });

  useEffect(() => {
    const d = configQ.data;
    if (!d) return;
    const nextModes: Record<string, RankMode> = {
      rank1: 'inherit',
      rank2: 'inherit',
      rank3: 'inherit',
      all: 'inherit',
    };
    const nextTpl: Record<string, string> = {};
    for (const { key } of RANKS) {
      const a = d.config[key];
      if (a?.mode) nextModes[key] = a.mode;
      if (a?.mode === 'template' && a.templateId) nextTpl[key] = a.templateId;
    }
    setModes(nextModes);
    setTemplateIds(nextTpl);
  }, [configQ.data]);

  const saveMut = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.patch(`/api/quizzes/${slug}/prizes-config`, { config }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quiz-prizes-config', slug] }),
  });

  const allTemplates = [
    ...(cinemaTemplatesQ.data?.items ?? []).map((t: PrizeTemplate) => ({ ...t, source: 'cinéma' })),
    ...(sponsorTemplatesQ.data?.items ?? []).map((t: PrizeTemplate) => ({
      ...t,
      source: 'sponsor',
    })),
  ].filter((t) => t.isActive);

  function buildConfig() {
    const config: Record<string, unknown> = {};
    for (const { key } of RANKS) {
      const mode = modes[key];
      if (mode === 'inherit') config[key] = { mode: 'inherit' };
      else if (mode === 'none') config[key] = { mode: 'none' };
      else if (mode === 'template' && templateIds[key]) {
        config[key] = { mode: 'template', templateId: templateIds[key] };
      }
    }
    return config;
  }

  if (configQ.isLoading) return <p className="text-gray-500">Chargement…</p>;

  return (
    <div className="space-y-6">
      {RANKS.map(({ key, label }) => {
        const mode = modes[key];
        const preview =
          configQ.data?.inheritedPreview[key as keyof QuizPrizesConfigResponse['inheritedPreview']];
        return (
          <div key={key} className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold">{label}</h3>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              {(['inherit', 'none', 'template'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`mode-${key}`}
                    checked={mode === m}
                    onChange={() => setModes((prev) => ({ ...prev, [key]: m }))}
                  />
                  {m === 'inherit' ? 'Hériter' : m === 'none' ? 'Aucun lot' : 'Choisir un lot'}
                </label>
              ))}
            </div>
            {mode === 'inherit' && preview && (
              <p className="text-sm text-gray-600">
                Héritage effectif : <strong>{preview.label}</strong> ({preview.type})
              </p>
            )}
            {mode === 'inherit' && !preview && (
              <p className="text-sm text-gray-500">Aucun lot configuré en héritage pour ce rang.</p>
            )}
            {mode === 'template' && (
              <select
                className="w-full max-w-md rounded border px-3 py-2 text-sm"
                value={templateIds[key] ?? ''}
                onChange={(e) => setTemplateIds((prev) => ({ ...prev, [key]: e.target.value }))}
              >
                <option value="">— Sélectionner —</option>
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.source}) — {t.stockLabel}
                    {t.stock === 0 ? ' [Épuisé — fallback auto]' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => saveMut.mutate(buildConfig())}
        disabled={saveMut.isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Enregistrer les lots
      </button>
    </div>
  );
}
