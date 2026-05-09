'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../../../../../lib/api';

const rankFields = z.object({
  type: z.enum(['discount_qr', 'video', 'other']),
  label: z.string(),
  value: z.string(),
});

const schema = z.object({
  rank1: rankFields,
  rank2: rankFields,
  rank3: rankFields,
});

type FormVals = z.infer<typeof schema>;

const emptyRank = (): FormVals['rank1'] => ({
  type: 'discount_qr',
  label: '',
  value: '',
});

interface ConfigResponse {
  config: {
    rank1?: { type: string; label: string; value?: string };
    rank2?: { type: string; label: string; value?: string };
    rank3?: { type: string; label: string; value?: string };
  };
}

function rankFromApi(
  r: { type: string; label: string; value?: string } | undefined,
): FormVals['rank1'] {
  if (!r) return emptyRank();
  return {
    type: r.type as FormVals['rank1']['type'],
    label: r.label,
    value: r.value ?? '',
  };
}

export default function CinemaPrizesConfigPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['cinema-prizes-config', slug],
    queryFn: () => api.get<ConfigResponse>(`/api/cinemas/${slug}/prizes-config`),
    enabled: !!slug,
  });

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      rank1: emptyRank(),
      rank2: emptyRank(),
      rank3: emptyRank(),
    },
  });

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    form.reset({
      rank1: rankFromApi(d.config.rank1),
      rank2: rankFromApi(d.config.rank2),
      rank3: rankFromApi(d.config.rank3),
    });
  }, [q.data, form]);

  const mut = useMutation({
    mutationFn: (body: { config: Record<string, unknown> }) =>
      api.patch(`/api/cinemas/${slug}/prizes-config`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cinema-prizes-config', slug] }),
  });

  const onSubmit = form.handleSubmit((vals) => {
    const config: Record<string, { type: string; label: string; value?: string }> = {};
    (['rank1', 'rank2', 'rank3'] as const).forEach((key) => {
      const r = vals[key];
      if (!r.label.trim()) return;
      const entry: { type: string; label: string; value?: string } = {
        type: r.type,
        label: r.label.trim(),
      };
      if (r.value.trim()) entry.value = r.value.trim();
      config[key] = entry;
    });
    mut.mutate({ config });
  });

  if (q.isLoading) return <p className="text-gray-500">Chargement…</p>;
  if (q.error) return <p className="text-red-600">Impossible de charger la configuration.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/cinemas/${slug}`} className="text-sm text-blue-600 hover:underline">
          ← Cinéma
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Lots du cinéma</h1>
      </div>
      <p className="text-sm text-gray-600">
        Configure les 3 lots pour le podium par défaut. Si un quiz est sponsorisé, les lots du
        sponsor remplacent ceux-ci.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        {(['rank1', 'rank2', 'rank3'] as const).map((key, i) => (
          <div key={key} className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              {i === 0 ? '🥇 1ère place' : i === 1 ? '🥈 2ème place' : '🥉 3ème place'}
            </h2>
            <div className="grid gap-3">
              <label className="block text-sm font-medium">
                Type
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  {...form.register(`${key}.type`)}
                >
                  <option value="discount_qr">Code de réduction QR</option>
                  <option value="video">Vidéo</option>
                  <option value="other">Autre</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Libellé
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder='ex: "20% sur la confiserie"'
                  {...form.register(`${key}.label`)}
                />
              </label>
              <label className="block text-sm font-medium">
                Valeur (optionnel)
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder='ex: code promo "WIN20"'
                  {...form.register(`${key}.value`)}
                />
              </label>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              q.data &&
              form.reset({
                rank1: rankFromApi(q.data.config.rank1),
                rank2: rankFromApi(q.data.config.rank2),
                rank3: rankFromApi(q.data.config.rank3),
              })
            }
            className="rounded border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={mut.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </form>

      <p className="text-sm">
        <Link href={`/cinemas/${slug}/prizes/history`} className="text-blue-600 hover:underline">
          Voir l&apos;historique des lots émis
        </Link>
      </p>
    </div>
  );
}
