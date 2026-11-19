'use client';

import { useState } from 'react';
import { downloadContactsExport, type ContactsExportTarget } from '../../lib/contacts-api';

/** Bouton d'export des emails consentis d'un périmètre (C5, super_admin). */
export function ContactsExportButton({
  target,
  disabled,
  label = 'Exporter les emails',
}: {
  target: ContactsExportTarget;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadContactsExport(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void run()}
        className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? 'Export…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
