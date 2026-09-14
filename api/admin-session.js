export const config = { runtime: 'edge' };

import { requireAdminSession, jsonResponse } from './_lib/admin-session.js';

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const denied = await requireAdminSession(request);
  if (denied) return denied;
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
