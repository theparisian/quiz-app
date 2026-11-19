'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_PRIZE_CODES_PER_IMPORT,
  type ImportPrizeCodesResponse,
  type PrizeCodesStats,
  type PrizeRedeemMode,
} from '@quiz-app/validation';
import { api } from '../../../../../lib/api';

interface PrizeTemplate {
  id: string;
  label: string;
  type: string;
  stockLabel: string;
  stock: number | null;
  isActive: boolean;
  redeemMode: PrizeRedeemMode;
  staticCode: string | null;
  redeemInstructions: string | null;
  redeemUrl: string | null;
}

const REDEEM_MODE_LABEL: Record<PrizeRedeemMode, string> = {
  staff_pin: 'Au comptoir (PIN du cinéma)',
  code_pool: 'Codes fournis par la marque',
  static_code: 'Code unique pour tous',
};

function errorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'TOO_MANY_CODES':
      return `${MAX_PRIZE_CODES_PER_IMPORT} codes au plus par import.`;
    case 'NO_CODES':
      return 'Aucun code dans le fichier.';
    case 'INVALID_CODE':
      return 'Un code dépasse 100 caractères.';
    case 'VALIDATION_ERROR':
      return 'Certains champs sont invalides. Vérifiez le formulaire.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}

export default function SponsorPrizeTemplatesPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'discount_qr' | 'video' | 'other'>('discount_qr');
  const [stock, setStock] = useState('');
  const [redeemMode, setRedeemMode] = useState<PrizeRedeemMode>('staff_pin');
  const [staticCode, setStaticCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [redeemUrl, setRedeemUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['sponsor-prize-templates', slug],
    queryFn: () => api.get<{ items: PrizeTemplate[] }>(`/api/sponsors/${slug}/prize-templates`),
    enabled: !!slug,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/sponsors/${slug}/prize-templates`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sponsor-prize-templates', slug] });
      setShowForm(false);
      setLabel('');
      setStock('');
      setRedeemMode('staff_pin');
      setStaticCode('');
      setInstructions('');
      setRedeemUrl('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/prize-templates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor-prize-templates', slug] }),
  });

  const create = () => {
    const isCodeMode = redeemMode !== 'staff_pin';
    createMut.mutate({
      label: label.trim(),
      type,
      redeemMode,
      // En mode « codes fournis », le stock est le nombre de codes importés.
      ...(redeemMode === 'code_pool'
        ? {}
        : stock.trim()
          ? { stock: parseInt(stock, 10) }
          : { stock: null }),
      ...(redeemMode === 'static_code' ? { staticCode: staticCode.trim() } : {}),
      ...(isCodeMode && instructions.trim() ? { redeemInstructions: instructions.trim() } : {}),
      ...(isCodeMode && redeemUrl.trim() ? { redeemUrl: redeemUrl.trim() } : {}),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/sponsors/${slug}`} className="text-sm text-blue-600 hover:underline">
        ← Sponsor
      </Link>
      <h1 className="text-2xl font-bold">Catalogue de lots sponsor</h1>

      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
      >
        Nouveau lot
      </button>

      {showForm && (
        <div className="rounded border bg-gray-50 p-4">
          <input
            className="mb-2 w-full rounded border px-3 py-2"
            placeholder="Libellé"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <select
            className="mb-2 w-full rounded border px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="discount_qr">Code QR</option>
            <option value="video">Vidéo</option>
            <option value="other">Autre</option>
          </select>
          <label className="mb-2 block text-sm font-medium">
            Retrait du lot
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={redeemMode}
              onChange={(e) => setRedeemMode(e.target.value as PrizeRedeemMode)}
            >
              {(Object.keys(REDEEM_MODE_LABEL) as PrizeRedeemMode[]).map((m) => (
                <option key={m} value={m}>
                  {REDEEM_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {redeemMode === 'code_pool' ? (
            <p className="mb-2 text-xs text-gray-500">
              Le stock est le nombre de codes restants : importez les codes après la création.
            </p>
          ) : (
            <input
              type="number"
              className="mb-2 w-full rounded border px-3 py-2"
              placeholder="Stock (vide = illimité)"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          )}
          {redeemMode === 'static_code' && (
            <input
              className="mb-2 w-full rounded border px-3 py-2 font-mono"
              placeholder="Code (le même pour tous les gagnants)"
              value={staticCode}
              maxLength={100}
              onChange={(e) => setStaticCode(e.target.value)}
            />
          )}
          {redeemMode !== 'staff_pin' && (
            <>
              <textarea
                rows={2}
                className="mb-2 w-full rounded border px-3 py-2 text-sm"
                placeholder="Instructions (ex. « Présentez ce code en caisse »)"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <input
                type="url"
                className="mb-2 w-full rounded border px-3 py-2 text-sm"
                placeholder="Lien du partenaire (https://…)"
                value={redeemUrl}
                onChange={(e) => setRedeemUrl(e.target.value)}
              />
            </>
          )}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={
              !label.trim() ||
              (redeemMode === 'static_code' && !staticCode.trim()) ||
              createMut.isPending
            }
            onClick={create}
          >
            Créer
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-2 text-left">Lot</th>
            <th>Retrait</th>
            <th>Stock</th>
            <th>Statut</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data?.items.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onArchive={() => archiveMut.mutate(t.id)}
              onCodesChanged={() =>
                void qc.invalidateQueries({ queryKey: ['sponsor-prize-templates', slug] })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemplateRow({
  template: t,
  onArchive,
  onCodesChanged,
}: {
  template: PrizeTemplate;
  onArchive: () => void;
  onCodesChanged: () => void;
}) {
  const [showCodes, setShowCodes] = useState(false);
  return (
    <>
      <tr className="border-b">
        <td className="py-2">{t.label}</td>
        <td className="text-center text-xs text-gray-600">
          {REDEEM_MODE_LABEL[t.redeemMode]}
          {t.redeemMode === 'static_code' && t.staticCode && (
            <span className="block font-mono">{t.staticCode}</span>
          )}
        </td>
        <td className="text-center">{t.stockLabel}</td>
        <td className="text-center">{t.isActive ? 'Actif' : 'Archivé'}</td>
        <td className="space-x-3 text-right">
          {t.redeemMode === 'code_pool' && (
            <button type="button" className="text-blue-600" onClick={() => setShowCodes((v) => !v)}>
              Codes
            </button>
          )}
          {t.isActive && (
            <button type="button" className="text-red-600" onClick={onArchive}>
              Archiver
            </button>
          )}
        </td>
      </tr>
      {showCodes && (
        <tr className="border-b bg-gray-50">
          <td colSpan={5} className="p-3">
            <CodesPanel templateId={t.id} onChanged={onCodesChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Import des codes fournis par la marque (CSV ou texte, un code par ligne) et compteurs. */
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
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {importMut.isPending ? 'Import…' : 'Importer les codes'}
      </button>
    </div>
  );
}
