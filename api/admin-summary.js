export const config = { runtime: 'edge' };
import { fetchApi, passThrough } from './_lib/api-proxy.js';
import { jsonResponse } from './_lib/admin-session.js';
import { WORKER_ORIGIN } from './_lib/worker-proxy.js';

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const { denied, upstream } = await fetchApi(request, '/api/admin/summary');
  if (denied) return denied;
  if (!upstream.ok) return passThrough(upstream);

  let summary;
  try {
    summary = await upstream.json();
  } catch {
    return jsonResponse({ error: 'bad_upstream_response' }, 502);
  }
  if (!summary || typeof summary !== 'object') {
    return jsonResponse({ error: 'bad_upstream_response' }, 502);
  }
  const ids = Array.isArray(summary.active_installation_ids) ? summary.active_installation_ids : [];
  delete summary.active_installation_ids;

  let signed_in = null;
  const token = process.env.CT_STATS_TOKEN;
  if (token) {
    try {
      const m = await fetch(`${WORKER_ORIGIN}/stats/match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ct-token': token },
        body: JSON.stringify({ installation_ids: ids }),
        cache: 'no-store',
      });
      if (m.ok) {
        const j = await m.json();
        signed_in = { active_today: Number(j.active_today) || 0, active_now: Number(j.active_now) || 0 };
      }
    } catch {
      // Leave signed_in null; the tile shows "n/a" rather than failing the page.
    }
  }
  return jsonResponse({ ...summary, signed_in }, 200);
}
