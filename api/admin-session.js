export const config = { runtime: 'edge' };

import { requireAdminSession } from './_lib/admin-session.js';

export default async function handler(request) {
  const denied = await requireAdminSession(request);
  if (denied) return denied;
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
