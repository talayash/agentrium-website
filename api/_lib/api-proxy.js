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
  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') ?? '';

  if (!upstream.ok) {
    // A non-2xx upstream body is relayed only when it is genuinely the JSON
    // error shape callers expect; a platform error page (HTML, plain text,
    // or malformed JSON) from the broker must not reach the browser as-is.
    let isJson = contentType.includes('application/json');
    if (isJson) {
      try {
        JSON.parse(text);
      } catch {
        isJson = false;
      }
    }
    if (!isJson) return jsonResponse({ error: 'upstream_error' }, upstream.status);
  }

  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': contentType || 'application/json', 'cache-control': 'no-store' },
  });
}
