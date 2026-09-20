export const config = { runtime: 'edge' };

import { clearSessionCookie, jsonResponse } from './_lib/admin-session.js';
import { requireSameOrigin } from './_lib/same-origin.js';

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const crossOrigin = requireSameOrigin(request);
  if (crossOrigin) return crossOrigin;
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' },
  });
}
