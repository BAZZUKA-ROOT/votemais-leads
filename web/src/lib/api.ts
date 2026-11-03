export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

function csrf(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)vml_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export function qs(params?: Query): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrf() } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    if (!window.location.pathname.startsWith('/login')) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, 'unauthorized', 'Sessão expirada');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; issues?: Array<{ path: string; message: string }> };
    const issues = d.issues?.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new ApiError(res.status, d.error ?? 'error', issues ? `${d.message ?? 'Erro'} — ${issues}` : (d.message ?? `Erro ${res.status}`), d.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', `${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro inesperado';
}
