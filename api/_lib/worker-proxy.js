// Shared same-origin proxy to the ct-analytics Worker. Every caller is gated by
// the /admin session cookie; the Worker token stays server-side.

import { requireAdminSession, jsonResponse } from './admin-session.js';

export const WORKER_ORIGIN = 'https://ct-analytics.claude-terminal.workers.dev';

/**
 * @param {Request} request
 * @param {{ path: string, allowParams?: Record<string, (v: string) => string | null>, method?: 'GET'|'POST' }} opts
 *   allowParams maps a query param name to a sanitizer returning the value to forward, or null to drop it.
 */
export async function proxyWorker(request, opts) {
  const denied = await requireAdminSession(request);
  if (denied) return denied;

  const token = process.env.CT_STATS_TOKEN;
  if (!token) return jsonResponse({ error: 'server_misconfigured', detail: 'CT_STATS_TOKEN not set' }, 500);

  const method = opts.method ?? 'GET';
  if (request.method !== method) return jsonResponse({ error: 'method_not_allowed' }, 405);

  const incoming = new URL(request.url);
  const target = new URL(opts.path, WORKER_ORIGIN);
  for (const [name, sanitize] of Object.entries(opts.allowParams ?? {})) {
    const raw = incoming.searchParams.get(name);
    if (raw === null) continue;
    const clean = sanitize(raw);
    if (clean === null) return jsonResponse({ error: `invalid_${name}` }, 400);
    target.searchParams.set(name, clean);
  }

  const init = { method, headers: { 'x-ct-token': token }, cache: 'no-store' };
  if (method === 'POST') {
    init.headers['content-type'] = request.headers.get('content-type') ?? 'application/json';
    init.body = await request.text();
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (err) {
    return jsonResponse({ error: 'upstream_unreachable', detail: String(err) }, 502);
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const intParam = (min, max, fallback) => (v) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(Math.max(n, min), max));
};
export const oneOf = (allowed) => (v) => (allowed.includes(v) ? v : null);
