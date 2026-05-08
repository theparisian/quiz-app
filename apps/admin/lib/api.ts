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
    (error as Error & { details?: unknown }).details = body?.error?.details;
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
  put: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: 'PUT' };
    if (body != null) init.body = JSON.stringify(body);
    return apiFetch<T>(path, init);
  },
  patch: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: 'PATCH' };
    if (body != null) init.body = JSON.stringify(body);
    return apiFetch<T>(path, init);
  },
  delete: async <T>(path: string): Promise<T | undefined> => {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body?.error?.message ?? `Request failed: ${res.status}`);
      (error as Error & { code: string }).code = body?.error?.code ?? 'UNKNOWN';
      (error as Error & { status: number }).status = res.status;
      (error as Error & { details?: unknown }).details = body?.error?.details;
      throw error;
    }
    if (res.status === 204) return undefined;
    return res.json() as T;
  },
};

export async function apiUploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.error?.message ?? `Upload failed: ${res.status}`);
    (error as Error & { code: string }).code = body?.error?.code ?? 'UNKNOWN';
    (error as Error & { details?: unknown }).details = body?.error?.details;
    throw error;
  }
  return res.json() as Promise<T>;
}
