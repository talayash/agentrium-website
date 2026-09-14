export const config = { runtime: 'edge' };
import { fetchApi, passThrough } from './_lib/api-proxy.js';
import { jsonResponse, requireAdminSession } from './_lib/admin-session.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const sessionDenied = await requireAdminSession(request);
  if (sessionDenied) return sessionDenied;

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return jsonResponse({ error: 'invalid_id' }, 400);
  const { denied, upstream } = await fetchApi(request, `/api/admin/users/${id}`);
  return denied ?? passThrough(upstream);
}
