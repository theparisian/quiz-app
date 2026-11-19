'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_PRIZE_CODES_PER_IMPORT,
  type ImportPrizeCodesResponse,
  type PrizeCodesStats,
  type PrizeRedeemMode,
} from '@quiz-app/validation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface PrizeTemplate {
  id: string;
  label: string;
  type: 'discount_qr' | 'video' | 'other';
  value: string | null;
  stock: number | null;
  stockLabel: string;
  validityDays: number | null;
  isActive: boolean;
  redeemMode: PrizeRedeemMode;
  staticCode: string | null;
  redeemInstructions: string | null;
  redeemUrl: string | null;
}

const TYPE_LABEL: Record<PrizeTemplate['type'], string> = {
  discount_qr: 'Code QR',
  video: 'Vidéo',
  other: 'Autre',
};

const REDEEM_MODE_LABEL: Record<PrizeRedeemMode, string> = {
  staff_pin: 'Au comptoir (PIN du cinéma)',
  code_pool: 'Codes uniques importés',
  static_code: 'Code unique pour tous',
};

function errorMessage(err: unknown): string {
  switch ((err as { code?: string } | null)?.code) {
    case 'TOO_MANY_CODES':
      return `${MAX_PRIZE_CODES_PER_IMPORT} codes au plus par import.`;
    case 'NO_CODES':
      return 'Aucun code dans le fichier.';
    case 'INVALID_CODE':
      return 'Un code dépasse 100 caractères.';
    case 'STATIC_CODE_REQUIRED':
      return 'Saisissez le code commun à tous les gagnants.';
    case 'FORBIDDEN':
      return "Vous n'avez pas les droits pour modifier ce lot.";
    case 'VALIDATION_ERROR':
      return 'Certains champs sont invalides. Vérifiez le formulaire.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}

interface FormState {
  label: string;
  type: PrizeTemplate['type'];
  value: string;
  stock: string;
  validityDays: string;
  redeemMode: PrizeRedeemMode;
  staticCode: string;
  instructions: string;
  redeemUrl: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  type: 'discount_qr',
  value: '',
  stock: '',
  validityDays: '',
  redeemMode: 'staff_pin',
  staticCode: '',
  instructions: '',
  redeemUrl: '',
};

function formFromTemplate(t: PrizeTemplate): FormState {
  return {
    label: t.label,
    type: t.type,
    value: t.value ?? '',
    stock: t.stock != null ? String(t.stock) : '',
    validityDays: t.validityDays != null ? String(t.validityDays) : '',
    redeemMode: t.redeemMode,
    staticCode: t.staticCode ?? '',
    instructions: t.redeemInstructions ?? '',
    redeemUrl: t.redeemUrl ?? '',
  };
}

function bodyFromForm(f: FormState): Record<string, unknown> {
  const isCodeMode = f.redeemMode !== 'staff_pin';
  return {
    label: f.label.trim(),
    type: f.type,
    ...(f.value.trim() ? { value: f.value.trim() } : {}),
    // En mode « codes uniques importés », le stock est le nombre de codes restants.
    ...(f.redeemMode === 'code_pool'
      ? {}
      : { stock: f.stock.trim() ? parseInt(f.stock, 10) : null }),
    validityDays: f.validityDays.trim() ? parseInt(f.validityDays, 10) : null,
    redeemMode: f.redeemMode,
    ...(f.redeemMode === 'static_code' ? { staticCode: f.staticCode.trim() } : {}),
    redeemInstructions: isCodeMode && f.instructions.trim() ? f.instructions.trim() : null,
    redeemUrl: isCodeMode && f.redeemUrl.trim() ? f.redeemUrl.trim() : null,
  };
}

/** Lots du cinéma (gabarits) : mode de retrait et codes, gérés par l'administrateur du cinéma. */
export default function LotsPage() {
  const { user } = useAuth();
  const cinemaSlug = user?.cinemaSlug ?? null;
  const canManage = user?.role === 'cinema_admin' || user?.role === 'super_admin';
  const qc = useQueryClient();
  const queryKey = ['cinema-prize-templates', cinemaSlug];

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [codesOpenId, setCodesOpenId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey,
    queryFn: () =>
      api.get<{ items: PrizeTemplate[] }>(
        `/api/cinemas/${encodeURIComponent(cinemaSlug!)}/prize-templates`,
      ),
    enabled: !!cinemaSlug && canManage,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editId
        ? api.patch(`/api/prize-templates/${editId}`, body)
        : api.post(`/api/cinemas/${encodeURIComponent(cinemaSlug!)}/prize-templates`, body),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  const toggleMut = useMutation({
    mutationFn: (t: PrizeTemplate) =>
      t.isActive
        ? api.delete(`/api/prize-templates/${t.id}`)
        : api.patch(`/api/prize-templates/${t.id}`, { isActive: true }),
    onSuccess: invalidate,
  });

  function openForm(t: PrizeTemplate | null) {
    setEditId(t?.id ?? null);
    setForm(t ? formFromTemplate(t) : EMPTY_FORM);
    setFormError(null);
  }

  function closeForm() {
    setEditId(null);
    setForm(null);
    setFormError(null);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lots</h1>
          <p className="mt-1 text-sm text-gray-500">
            Les lots de votre cinéma et la façon dont les gagnants les retirent.
          </p>
        </div>
        {canManage && cinemaSlug && !form && (
          <button
            type="button"
            onClick={() => openForm(null)}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Nouveau lot
          </button>
        )}
      </div>

      {!canManage && (
        <p className="text-sm text-gray-600">
          La gestion des lots est réservée aux administrateurs du cinéma.
        </p>
      )}

      {canManage && form && (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-800">
            {editId ? 'Modifier le lot' : 'Nouveau lot'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Libellé
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
              />
            </label>
            <label className="text-sm">
              Type
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.type}
                onChange={(e) => set('type', e.target.value as PrizeTemplate['type'])}
              >
                {(Object.keys(TYPE_LABEL) as PrizeTemplate['type'][]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Valeur (optionnel)
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.value}
                onChange={(e) => set('value', e.target.value)}
              />
            </label>
            <label className="text-sm">
              Validité (jours, vide = sans expiration)
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.validityDays}
                onChange={(e) => set('validityDays', e.target.value)}
              />
            </label>
            <label className="text-sm">
              Retrait du lot
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.redeemMode}
                onChange={(e) => set('redeemMode', e.target.value as PrizeRedeemMode)}
              >
                {(Object.keys(REDEEM_MODE_LABEL) as PrizeRedeemMode[]).map((m) => (
                  <option key={m} value={m}>
                    {REDEEM_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            {form.redeemMode === 'code_pool' ? (
              <p className="self-end text-xs text-gray-500">
                Le stock est le nombre de codes restants. Après l&apos;enregistrement, importez vos
                codes avec le bouton « Codes » de la liste.
              </p>
            ) : (
              <label className="text-sm">
                Stock (vide = illimité)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                />
              </label>
            )}
            {form.redeemMode === 'static_code' && (
              <label className="text-sm">
                Code (le même pour tous les gagnants)
                <input
                  className="mt-1 w-full rounded border px-3 py-2 font-mono"
                  maxLength={100}
                  value={form.staticCode}
                  onChange={(e) => set('staticCode', e.target.value)}
                />
              </label>
            )}
            {form.redeemMode !== 'staff_pin' && (
              <>
                <label className="text-sm sm:col-span-2">
                  Instructions pour le gagnant (optionnel)
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded border px-3 py-2"
                    placeholder="Ex. « Présentez ce code en caisse »"
                    value={form.instructions}
                    onChange={(e) => set('instructions', e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Lien du partenaire (optionnel)
                  <input
                    type="url"
                    className="mt-1 w-full rounded border px-3 py-2"
                    placeholder="https://…"
                    value={form.redeemUrl}
                    onChange={(e) => set('redeemUrl', e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => saveMut.mutate(bodyFromForm(form))}
              disabled={
                !form.label.trim() ||
                (form.redeemMode === 'static_code' && !form.staticCode.trim()) ||
                saveMut.isPending
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {canManage && templatesQ.isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {canManage && templatesQ.isError && (
        <p className="text-sm text-red-600">Les lots ne sont pas disponibles pour le moment.</p>
      )}
      {canManage && templatesQ.data && templatesQ.data.items.length === 0 && (
        <p className="text-sm text-gray-500">Aucun lot pour le moment.</p>
      )}
      {canManage && templatesQ.data && templatesQ.data.items.length > 0 && (
        <table className="w-full rounded-lg border bg-white text-left text-sm shadow-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="px-3 py-2">Lot</th>
              <th className="px-3 py-2">Retrait</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templatesQ.data.items.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">{t.label}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {REDEEM_MODE_LABEL[t.redeemMode]}
                    {t.redeemMode === 'static_code' && t.staticCode && (
                      <span className="block font-mono">{t.staticCode}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{t.stockLabel}</td>
                  <td className="px-3 py-2">{t.isActive ? 'Actif' : 'Archivé'}</td>
                  <td className="space-x-3 px-3 py-2 text-right">
                    {t.redeemMode === 'code_pool' && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={() => setCodesOpenId(codesOpenId === t.id ? null : t.id)}
                      >
                        Codes
                      </button>
                    )}
                    {t.isActive && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={() => openForm(t)}
                      >
                        Modifier
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        t.isActive
                          ? 'text-red-600 hover:underline'
                          : 'text-green-700 hover:underline'
                      }
                      onClick={() => toggleMut.mutate(t)}
                    >
                      {t.isActive ? 'Archiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
                {codesOpenId === t.id && t.redeemMode === 'code_pool' && (
                  <tr className="border-b bg-gray-50">
                    <td colSpan={5} className="p-3">
                      <CodesPanel templateId={t.id} onChanged={invalidate} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Import des codes à usage unique (CSV ou texte, un code par ligne) et compteurs. */
function CodesPanel({ templateId, onChanged }: { templateId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportPrizeCodesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ['prize-codes-stats', templateId],
    queryFn: () => api.get<PrizeCodesStats>(`/api/prize-templates/${templateId}/codes/stats`),
  });

  const importMut = useMutation({
    mutationFn: (body: { text: string }) =>
      api.post<ImportPrizeCodesResponse>(`/api/prize-templates/${templateId}/codes/import`, body),
    onSuccess: (res) => {
      setResult(res);
      setError(null);
      setText('');
      void qc.invalidateQueries({ queryKey: ['prize-codes-stats', templateId] });
      onChanged();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
  };

  return (
    <div className="space-y-2">
      {stats.data && (
        <p className="text-sm text-gray-700">
          {stats.data.total} codes · {stats.data.assigned} attribués · {stats.data.remaining}{' '}
          restants
        </p>
      )}
      <p className="text-xs text-gray-500">
        Collez vos codes ou choisissez un fichier CSV / texte : un code par ligne, les doublons sont
        ignorés.
      </p>
      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="block text-sm"
        onChange={(e) => void readFile(e.target.files?.[0])}
      />
      <textarea
        rows={4}
        className="w-full rounded border px-3 py-2 font-mono text-xs"
        placeholder={`Un code par ligne (${MAX_PRIZE_CODES_PER_IMPORT} au plus par import)`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="text-sm text-green-700">
          {result.imported} code{result.imported > 1 ? 's' : ''} importé
          {result.imported > 1 ? 's' : ''}, {result.duplicates} doublon
          {result.duplicates > 1 ? 's' : ''} ignoré{result.duplicates > 1 ? 's' : ''}.
        </p>
      )}
      <button
        type="button"
        disabled={!text.trim() || importMut.isPending}
        onClick={() => importMut.mutate({ text })}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {importMut.isPending ? 'Import…' : 'Importer les codes'}
      </button>
    </div>
  );
}
