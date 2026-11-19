/** Contacts consentis (C5) : exports CSV réservés au super_admin. */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ContactsExportTarget =
  | { scope: 'platform' }
  | { scope: 'cinema'; cinemaSlug: string }
  | { scope: 'sponsor'; sponsorSlug: string };

function exportQuery(target: ContactsExportTarget): string {
  const params = new URLSearchParams({ scope: target.scope });
  if (target.scope === 'cinema') params.set('cinemaSlug', target.cinemaSlug);
  if (target.scope === 'sponsor') params.set('sponsorSlug', target.sponsorSlug);
  return params.toString();
}

/** Télécharge l'export ; lève une erreur au message lisible (accord absent, etc.). */
export async function downloadContactsExport(target: ContactsExportTarget): Promise<void> {
  const res = await fetch(`${API_URL}/api/contacts/export.csv?${exportQuery(target)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    if (body.error?.code === 'SHARING_NOT_AGREED') {
      throw new Error("Aucun accord de partage des emails n'est activé pour ce périmètre.");
    }
    throw new Error(`Export impossible (${res.status}).`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'contacts.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
