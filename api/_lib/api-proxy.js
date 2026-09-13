import { requireAdminSession, jsonResponse } from './admin-session.js';

export const API_ORIGIN = 'https://agentrium-api.vercel.app';

/** Session-gated GET to agentrium-api with the shared admin token. Returns the upstream Response or an error Response. */
export async function fetchApi(request, pathWithQuery) {
  const denied = await requireAdminSession(request);
  if (denied) return { denied };
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return { denied: jsonResponse({ error: 'server_misconfigured', detail: 'ADMIN_API_TOKEN not set' }, 500) };
  try {
    const upstream = await fetch(`${API_ORIGIN}${pathWithQuery}`, { headers: { 'x-admin-token': token }, cache: 'no-store' });
    return { upstream };
  } catch (err) {
    return { denied: jsonResponse({ error: 'upstream_unreachable', detail: String(err) }, 502) };
  }
}

export async function passThrough(upstream) {
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  });
}
