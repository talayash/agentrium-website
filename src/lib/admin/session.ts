// Fetch wrappers for the admin session endpoints.

export async function checkSession(): Promise<boolean> {
  try {
    const r = await fetch('/api/admin-session', { cache: 'no-store', credentials: 'include' });
    return r.status === 204;
  } catch {
    return false;
  }
}

export async function login(
  password: string,
): Promise<{ ok: true } | { ok: false; status: number; retryAfter: number | null }> {
  const r = await fetch('/api/admin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
    cache: 'no-store',
  });
  if (r.status === 204) return { ok: true };
  const retry = r.headers.get('retry-after');
  return { ok: false, status: r.status, retryAfter: retry ? parseInt(retry, 10) : null };
}

export async function logout(): Promise<void> {
  await fetch('/api/admin-logout', { method: 'POST', credentials: 'include', cache: 'no-store' });
}

/** GET JSON from a same-origin admin proxy. Throws on non-2xx; calls onUnauthorized on 401. */
export async function getJson<T>(url: string, onUnauthorized: () => void): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (r.status === 401) {
    onUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}
