const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.error?.message ?? `Request failed: ${res.status}`);
    (error as Error & { code: string }).code = body?.error?.code ?? 'UNKNOWN';
    (error as Error & { status: number }).status = res.status;
    throw error;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: 'POST' };
    if (body != null) init.body = JSON.stringify(body);
    return apiFetch<T>(path, init);
  },
  patch: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: 'PATCH' };
    if (body != null) init.body = JSON.stringify(body);
    return apiFetch<T>(path, init);
  },
  put: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: 'PUT' };
    if (body != null) init.body = JSON.stringify(body);
    return apiFetch<T>(path, init);
  },
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** Téléchargement d'un fichier de l'API (cookie de session inclus), ex. export CSV. */
export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
