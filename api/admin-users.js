export const config = { runtime: 'edge' };
import { fetchApi, passThrough } from './_lib/api-proxy.js';
import { jsonResponse } from './_lib/admin-session.js';

// Mirrors SORT_KEYS in agentrium-api's src/lib/admin-sort.ts. Kept as an
// allowlist here so this proxy stays a fixed surface: an unrecognised key is
// dropped rather than relayed for the broker to reject.
const SORT_KEYS = new Set([
  'created', 'last_seen', 'email', 'name', 'provider',
  'devices', 'app_version', 'os', 'profiles', 'workspaces',
]);

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const incoming = new URL(request.url);
  const qs = new URLSearchParams();
  const q = incoming.searchParams.get('q');
  if (q) qs.set('q', q.slice(0, 100));
  const sort = incoming.searchParams.get('sort');
  if (sort && SORT_KEYS.has(sort)) qs.set('sort', sort);
  const dir = incoming.searchParams.get('dir');
  if (dir === 'asc' || dir === 'desc') qs.set('dir', dir);
  const limit = parseInt(incoming.searchParams.get('limit') ?? '', 10);
  if (Number.isFinite(limit)) qs.set('limit', String(Math.min(Math.max(limit, 1), 100)));
  const cursor = incoming.searchParams.get('cursor');
  if (cursor && /^[A-Za-z0-9_-]{1,200}$/.test(cursor)) qs.set('cursor', cursor);
  const suffix = qs.toString() ? `?${qs}` : '';
  const { denied, upstream } = await fetchApi(request, `/api/admin/users${suffix}`);
  return denied ?? passThrough(upstream);
}
