import type { SoundKind } from '@quiz-app/validation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface SoundRow {
  id: string;
  label: string;
  kind: SoundKind;
  audioUrl: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
  scope: 'library' | 'quiz';
  createdAt: string;
}

export interface SoundLibraryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  soundsCount?: number;
  sounds?: SoundRow[];
}

export interface SoundLibraryDetail extends SoundLibraryRow {
  sounds: SoundRow[];
}

/**
 * Upload d'un son : multipart avec le libellé et le type, que `apiUploadFile`
 * (limité au seul fichier) ne sait pas transporter.
 */
export async function uploadSound<T>(
  path: string,
  file: File,
  fields: { label?: string; kind: SoundKind },
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', fields.kind);
  if (fields.label) form.append('label', fields.label);

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.error?.message ?? `Upload failed: ${res.status}`);
    (error as Error & { code: string }).code = body?.error?.code ?? 'UNKNOWN';
    throw error;
  }
  return res.json() as Promise<T>;
}

export function formatSoundSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
