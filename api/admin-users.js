export const config = { runtime: 'edge' };
import { fetchApi, passThrough } from './_lib/api-proxy.js';
import { jsonResponse } from './_lib/admin-session.js';

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const incoming = new URL(request.url);
  const qs = new URLSearchParams();
  const q = incoming.searchParams.get('q');
  if (q) qs.set('q', q.slice(0, 100));
  const limit = parseInt(incoming.searchParams.get('limit') ?? '', 10);
  if (Number.isFinite(limit)) qs.set('limit', String(Math.min(Math.max(limit, 1), 100)));
  const cursor = incoming.searchParams.get('cursor');
  if (cursor && /^[A-Za-z0-9_-]{1,200}$/.test(cursor)) qs.set('cursor', cursor);
  const suffix = qs.toString() ? `?${qs}` : '';
  const { denied, upstream } = await fetchApi(request, `/api/admin/users${suffix}`);
  return denied ?? passThrough(upstream);
}
