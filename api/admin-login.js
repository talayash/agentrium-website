// Password gate for /admin. Rate-limited through the ct-analytics Worker's KV
// (edge functions share no memory), then a constant-time password compare,
// then a signed HttpOnly cookie. Fails closed if the limiter is unreachable.

export const config = { runtime: 'edge' };

import { issueSessionCookie, constantTimeEqual, jsonResponse } from './_lib/admin-session.js';
import { requireSameOrigin } from './_lib/same-origin.js';

const LIMITER_URL = 'https://ct-analytics.claude-terminal.workers.dev/admin/login_attempt';

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const crossOrigin = requireSameOrigin(request);
  if (crossOrigin) return crossOrigin;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const ctToken = process.env.CT_STATS_TOKEN;
  if (!password || !secret || !ctToken) return jsonResponse({ error: 'server_misconfigured' }, 500);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid_json' }, 400); }
  const provided = body && typeof body.password === 'string' ? body.password : null;
  if (provided === null || provided.length > 512) return jsonResponse({ error: 'invalid_payload' }, 400);

  let verdict;
  try {
    const res = await fetch(LIMITER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ct-token': ctToken },
      body: JSON.stringify({ ip: clientIp(request) }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`limiter ${res.status}`);
    verdict = await res.json();
  } catch {
    return jsonResponse({ error: 'rate_limiter_unavailable' }, 503);
  }
  if (!verdict || typeof verdict !== 'object') {
    return jsonResponse({ error: 'rate_limiter_unavailable' }, 503);
  }
  if (!verdict.allowed) {
    const retry = Math.max(1, Number(verdict.retry_after_seconds) || 60);
    return jsonResponse({ error: 'rate_limited', retry_after: retry }, 429, { 'retry-after': String(retry) });
  }

  if (!constantTimeEqual(provided, password)) return jsonResponse({ error: 'unauthorized' }, 401);

  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': await issueSessionCookie(secret), 'cache-control': 'no-store' },
  });
}
