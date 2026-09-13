export const config = { runtime: 'edge' };

import { clearSessionCookie } from './_lib/admin-session.js';

export default async function handler() {
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' },
  });
}
