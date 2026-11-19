'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_PRIZE_CODES_PER_IMPORT,
  type ImportPrizeCodesResponse,
  type PrizeCodesStats,
  type PrizeRedeemMode,
} from '@quiz-app/validation';
import { api } from '../../lib/api';

export const REDEEM_MODE_LABEL: Record<PrizeRedeemMode, string> = {
  staff_pin: 'Au comptoir (PIN du cinéma)',
  code_pool: 'Codes uniques importés',
  static_code: 'Code unique pour tous',
};

export function prizeTemplateErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'TOO_MANY_CODES':
      return `${MAX_PRIZE_CODES_PER_IMPORT} codes au plus par import.`;
    case 'NO_CODES':
      return 'Aucun code dans le fichier.';
    case 'INVALID_CODE':
      return 'Un code dépasse 100 caractères.';
    case 'STATIC_CODE_REQUIRED':
      return 'Un code fixe est requis pour ce mode.';
    case 'NOT_CODE_POOL':
      return "Ce lot n'est pas en mode « codes uniques importés ».";
    case 'FORBIDDEN':
      return "Vous n'avez pas les droits pour modifier ce lot.";
    case 'VALIDATION_ERROR':
      return 'Certains champs sont invalides. Vérifiez le formulaire.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}

/** Import des codes à usage unique (CSV ou texte, un code par ligne) et compteurs. */
export function PrizeCodesPanel({
  templateId,
  onChanged,
}: {
  templateId: string;
  onChanged: () => void;
}) {
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
    onError: (err) => setError(prizeTemplateErrorMessage(err)),
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
