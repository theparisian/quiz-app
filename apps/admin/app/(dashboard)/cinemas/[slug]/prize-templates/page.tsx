'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';

interface PrizeTemplate {
  id: string;
  label: string;
  type: string;
  stock: number | null;
  stockInitial: number | null;
  stockLabel: string;
  isActive: boolean;
  value: string | null;
  validityDays: number | null;
}

interface TemplatesResponse {
  items: PrizeTemplate[];
}

interface SuperPrizeConfig {
  templateId: string;
  oddsOneIn: number;
  enabled: boolean;
}

export default function CinemaPrizeTemplatesPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'discount_qr' | 'video' | 'other'>('discount_qr');
  const [value, setValue] = useState('');
  const [stock, setStock] = useState('');
  const [validityDays, setValidityDays] = useState('');

  const templatesQ = useQuery({
    queryKey: ['cinema-prize-templates', slug],
    queryFn: () => api.get<TemplatesResponse>(`/api/cinemas/${slug}/prize-templates`),
    enabled: !!slug,
  });

  const superQ = useQuery({
    queryKey: ['cinema-super-prize', slug],
    queryFn: () =>
      api.get<{ config: SuperPrizeConfig | null }>(`/api/cinemas/${slug}/super-prize-config`),
    enabled: !!slug,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/cinemas/${slug}/prize-templates`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cinema-prize-templates', slug] });
      resetForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/prize-templates/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cinema-prize-templates', slug] });
      resetForm();
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/prize-templates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cinema-prize-templates', slug] }),
  });

  const superMut = useMutation({
    mutationFn: (config: SuperPrizeConfig | null) =>
      api.patch(`/api/cinemas/${slug}/super-prize-config`, { config }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cinema-super-prize', slug] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setLabel('');
    setType('discount_qr');
    setValue('');
    setStock('');
    setValidityDays('');
  }

  function openEdit(t: PrizeTemplate) {
    setEditId(t.id);
    setLabel(t.label);
    setType(t.type as 'discount_qr' | 'video' | 'other');
    setValue(t.value ?? '');
    setStock(t.stock != null ? String(t.stock) : '');
    setValidityDays(t.validityDays != null ? String(t.validityDays) : '');
    setShowForm(true);
  }

  function submitTemplate() {
    const body: Record<string, unknown> = {
      label: label.trim(),
      type,
      ...(value.trim() ? { value: value.trim() } : {}),
      ...(stock.trim() ? { stock: parseInt(stock, 10) } : { stock: null }),
      ...(validityDays.trim()
        ? { validityDays: parseInt(validityDays, 10) }
        : { validityDays: null }),
    };
    if (editId) updateMut.mutate({ id: editId, body });
    else createMut.mutate(body);
  }

  const [superEnabled, setSuperEnabled] = useState(false);
  const [superTemplateId, setSuperTemplateId] = useState('');
  const [superOdds, setSuperOdds] = useState('20');

  useEffect(() => {
    const cfg = superQ.data?.config;
    if (!cfg) return;
    setSuperEnabled(cfg.enabled);
    setSuperTemplateId(cfg.templateId);
    setSuperOdds(String(cfg.oddsOneIn));
  }, [superQ.data]);

  const activeTemplates = templatesQ.data?.items.filter((t) => t.isActive) ?? [];

  const sessionsPerDay = 4;
  const oddsNum = parseInt(superOdds, 10) || 20;
  const avgDays = Math.round(oddsNum / sessionsPerDay);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/cinemas/${slug}`} className="text-sm text-blue-600 hover:underline">
          ← Cinéma
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Catalogue de lots</h1>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/cinemas/${slug}/prizes`} className="text-blue-600 hover:underline">
          Config lots par défaut (legacy)
        </Link>
        <span className="text-gray-300">|</span>
        <Link href={`/cinemas/${slug}/prizes/history`} className="text-blue-600 hover:underline">
          Historique des lots émis
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Nouveau lot
          </button>
        </div>

        {showForm && (
          <div className="mb-6 rounded border bg-gray-50 p-4">
            <h3 className="mb-3 font-medium">{editId ? 'Modifier' : 'Créer'} un lot</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Libellé
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Type
                <select
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  <option value="discount_qr">Code QR</option>
                  <option value="video">Vidéo</option>
                  <option value="other">Autre</option>
                </select>
              </label>
              <label className="text-sm">
                Valeur (optionnel)
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Stock (vide = illimité)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Validité (jours, vide = sans expiration)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={submitTemplate}
                disabled={!label.trim() || createMut.isPending || updateMut.isPending}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded border px-4 py-2 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {templatesQ.isLoading ? (
          <p className="text-gray-500">Chargement…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2">Lot</th>
                <th>Type</th>
                <th>Stock</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templatesQ.data?.items.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-2 font-medium">{t.label}</td>
                  <td>{t.type}</td>
                  <td>
                    {t.stockLabel}
                    {t.stock === 0 && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">
                        Épuisé
                      </span>
                    )}
                  </td>
                  <td>{t.isActive ? 'Actif' : 'Archivé'}</td>
                  <td className="space-x-2 text-right">
                    {t.isActive && (
                      <>
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => openEdit(t)}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => archiveMut.mutate(t.id)}
                        >
                          Archiver
                        </button>
                      </>
                    )}
                    {!t.isActive && (
                      <button
                        type="button"
                        className="text-green-600 hover:underline"
                        onClick={() => updateMut.mutate({ id: t.id, body: { isActive: true } })}
                      >
                        Réactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Super lot</h2>
        <p className="mb-4 text-sm text-gray-600">
          Tirage aléatoire au démarrage de chaque séance. Le stock n&apos;est consommé qu&apos;à la
          réclamation.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={superEnabled}
            onChange={(e) => setSuperEnabled(e.target.checked)}
          />
          Activé
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Template
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={superTemplateId}
              onChange={(e) => setSuperTemplateId(e.target.value)}
              disabled={!superEnabled}
            >
              <option value="">— Choisir —</option>
              {activeTemplates
                .filter((t) => t.stock === null || t.stock > 0)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.stockLabel})
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            1 chance sur N séances
            <input
              type="number"
              min={2}
              max={1000}
              className="mt-1 w-full rounded border px-3 py-2"
              value={superOdds}
              onChange={(e) => setSuperOdds(e.target.value)}
              disabled={!superEnabled}
            />
          </label>
        </div>
        {superEnabled && (
          <p className="mt-2 text-xs text-gray-500">
            Avec {sessionsPerDay} séances/jour, ce lot tombera en moyenne tous les {avgDays} jours.
          </p>
        )}
        <button
          type="button"
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={superMut.isPending || (superEnabled && !superTemplateId)}
          onClick={() =>
            superMut.mutate(
              superEnabled
                ? {
                    enabled: true,
                    templateId: superTemplateId,
                    oddsOneIn: parseInt(superOdds, 10) || 20,
                  }
                : null,
            )
          }
        >
          Enregistrer le super lot
        </button>
      </section>

      <StaffPinSection slug={slug} />
    </div>
  );
}

function StaffPinSection({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');

  const statusQ = useQuery({
    queryKey: ['cinema-staff-pin', slug],
    queryFn: () => api.get<{ configured: boolean }>(`/api/cinemas/${slug}/staff-pin`),
    enabled: !!slug,
  });

  const saveMut = useMutation({
    mutationFn: (body: { pin: string }) => api.patch(`/api/cinemas/${slug}/staff-pin`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cinema-staff-pin', slug] });
      setPin('');
      setConfirm('');
    },
  });

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">PIN comptoir</h2>
      <p className="mb-4 text-sm text-gray-600">
        Ce code permet à votre équipe de valider les lots au comptoir. Communiquez-le uniquement au
        staff.
      </p>
      <p className="mb-3 text-sm">
        État :{' '}
        {statusQ.data?.configured ? (
          <span className="font-medium text-green-700">Configuré</span>
        ) : (
          <span className="font-medium text-orange-600">Non configuré ⚠</span>
        )}
      </p>
      <div className="grid max-w-sm gap-3">
        <input
          type="password"
          inputMode="numeric"
          placeholder="Nouveau PIN (4-6 chiffres)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="Confirmer le PIN"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="rounded border px-3 py-2"
        />
        <button
          type="button"
          disabled={pin.length < 4 || pin !== confirm || saveMut.isPending}
          onClick={() => saveMut.mutate({ pin })}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Enregistrer le PIN
        </button>
      </div>
    </section>
  );
}
