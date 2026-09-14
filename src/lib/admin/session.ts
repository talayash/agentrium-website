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

/**
 * How long one admin fetch may take before it is abandoned. Panels fetch their
 * sources in parallel, so a hanging upstream must not hold back the siblings
 * that already answered, and repeated polls must not queue up behind requests
 * that will never settle.
 */
export const FETCH_TIMEOUT_MS = 20_000;

function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** GET JSON from a same-origin admin proxy. Throws on non-2xx; calls onUnauthorized on 401. */
export async function getJson<T>(url: string, onUnauthorized: () => void): Promise<T> {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (r.status === 401) {
      onUnauthorized();
      throw new Error('unauthorized');
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (err) {
    // Callers label failures by source, so an abort reads as "<source> timeout"
    // rather than as a DOMException name.
    if (isAbortError(err)) throw new Error('timeout');
    throw err;
  }
}
