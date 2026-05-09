const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    const msg =
      body?.error?.message ??
      (typeof body.message === 'string' ? body.message : undefined) ??
      `Request failed: ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.status = res.status;
    if (body?.error?.code !== undefined) {
      err.code = body.error.code;
    }
    throw err;
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, {
      method: 'PATCH',
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(headers ? { headers } : {}),
    }),
};
