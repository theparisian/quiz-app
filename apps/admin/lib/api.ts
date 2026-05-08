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
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : null }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body != null ? JSON.stringify(body) : null }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
