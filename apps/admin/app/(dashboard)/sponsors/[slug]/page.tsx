'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, apiUploadFile } from '../../../../lib/api';
import { resolveMediaUrl } from '../../../../lib/media-url';

const optionalHex = z.string().refine((s) => s === '' || /^#[0-9A-Fa-f]{6}$/.test(s), {
  message: 'Couleur au format #RRGGBB',
});

const schema = z.object({
  name: z.string().min(2),
  brandColorPrimary: optionalHex,
  brandColorSecondary: optionalHex,
  contactEmail: z.string().refine((s) => s === '' || z.string().email().safeParse(s).success, {
    message: 'Email invalide',
  }),
  contractTerms: z.string().optional(),
  metadataJson: z.string().optional(),
});

type FormVals = z.infer<typeof schema>;

interface SponsorDetail {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColorPrimary: string | null;
  brandColorSecondary: string | null;
  contactEmail: string | null;
  contractTerms: string | null;
  active: boolean;
  metadata: unknown;
}

export default function SponsorDetailPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ['sponsor', slug],
    queryFn: () => api.get<SponsorDetail>(`/api/sponsors/${slug}`),
    enabled: !!slug,
  });

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      brandColorPrimary: '',
      brandColorSecondary: '',
      contactEmail: '',
      contractTerms: '',
      metadataJson: '',
    },
  });

  useEffect(() => {
    const d = detailQ.data;
    if (!d) return;
    form.reset({
      name: d.name,
      brandColorPrimary: d.brandColorPrimary ?? '',
      brandColorSecondary: d.brandColorSecondary ?? '',
      contactEmail: d.contactEmail ?? '',
      contractTerms: d.contractTerms ?? '',
      metadataJson: d.metadata == null ? '' : JSON.stringify(d.metadata, null, 2),
    });
  }, [detailQ.data, form]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<SponsorDetail>(`/api/sponsors/${slug}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor', slug] }),
  });

  const deactivateMut = useMutation({
    mutationFn: () => api.post<SponsorDetail>(`/api/sponsors/${slug}/deactivate`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor', slug] }),
  });

  const activateMut = useMutation({
    mutationFn: () => api.post<SponsorDetail>(`/api/sponsors/${slug}/activate`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor', slug] }),
  });

  const logoMut = useMutation({
    mutationFn: (file: File) => apiUploadFile<SponsorDetail>(`/api/sponsors/${slug}/logo`, file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor', slug] }),
  });

  const removeLogoMut = useMutation({
    mutationFn: () => api.delete<SponsorDetail>(`/api/sponsors/${slug}/logo`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor', slug] }),
  });

  const onSubmit = form.handleSubmit((vals) => {
    let metadata: Record<string, unknown> | undefined;
    if (vals.metadataJson?.trim()) {
      try {
        const parsed = JSON.parse(vals.metadataJson) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          metadata = parsed as Record<string, unknown>;
        else {
          alert('Metadata doit être un objet JSON.');
          return;
        }
      } catch {
        alert('JSON invalide dans metadata.');
        return;
      }
    }
    const body: Record<string, unknown> = {
      name: vals.name,
      contractTerms: vals.contractTerms || undefined,
      ...(vals.brandColorPrimary ? { brandColorPrimary: vals.brandColorPrimary } : {}),
      ...(vals.brandColorSecondary ? { brandColorSecondary: vals.brandColorSecondary } : {}),
      ...(vals.contactEmail ? { contactEmail: vals.contactEmail } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    saveMut.mutate(body);
  });

  const s = detailQ.data;
  const logo = resolveMediaUrl(s?.logoUrl);

  if (detailQ.isLoading) return <p className="text-gray-500">Chargement…</p>;
  if (detailQ.error || !s) return <p className="text-red-600">Sponsor introuvable.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sponsors" className="text-sm text-blue-600 hover:underline">
          ← Liste
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{s.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            s.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
          }`}
        >
          {s.active ? 'actif' : 'inactif'}
        </span>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Logo</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {logo ? (
            <img src={logo} alt="" className="h-24 w-24 rounded-lg border object-cover" />
          ) : (
            <div className="h-24 w-24 rounded-lg bg-gray-100" />
          )}
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={logoMut.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) logoMut.mutate(f);
                e.target.value = '';
              }}
              className="text-sm"
            />
            <button
              type="button"
              disabled={!s.logoUrl || removeLogoMut.isPending}
              onClick={() => removeLogoMut.mutate()}
              className="text-left text-sm text-red-600 hover:underline disabled:opacity-40"
            >
              Retirer le logo
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Fiche</h2>

        <label className="block text-sm font-medium">
          Nom
          <input
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            {...form.register('name')}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Couleur primaire (#RRGGBB)
            <input
              className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
              placeholder="#1e40af"
              {...form.register('brandColorPrimary')}
            />
          </label>
          <label className="block text-sm font-medium">
            Couleur secondaire (#RRGGBB)
            <input
              className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
              placeholder="#64748b"
              {...form.register('brandColorSecondary')}
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Email contact
          <input
            type="email"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            {...form.register('contactEmail')}
          />
        </label>

        <label className="block text-sm font-medium">
          Conditions contrat
          <textarea
            rows={4}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            {...form.register('contractTerms')}
          />
        </label>

        <label className="block text-sm font-medium">
          Metadata (JSON objet)
          <textarea
            rows={6}
            className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
            {...form.register('metadataJson')}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
          {s.active ? (
            <button
              type="button"
              onClick={() => deactivateMut.mutate()}
              disabled={deactivateMut.isPending}
              className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              onClick={() => activateMut.mutate()}
              disabled={activateMut.isPending}
              className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 hover:bg-green-100"
            >
              Réactiver
            </button>
          )}
        </div>
      </form>
      {saveMut.isSuccess && <p className="text-sm text-green-700">Modifications enregistrées.</p>}
    </div>
  );
}
