// CSRF defence in depth for the state-changing /api/* handlers. The admin
// cookie is SameSite=Strict, which already keeps browsers from attaching it to
// cross-site requests; this adds a second, independent check on the Origin
// header so a future cookie-attribute change or browser quirk cannot silently
// reopen the hole.
//
// Browsers send Origin on every POST. When it is present its host must equal
// the host this request was addressed to; a request with no Origin header
// (same-origin navigations, non-browser clients) passes through.

import { jsonResponse } from './admin-session.js';

function expectedHost(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0].trim();
  const host = request.headers.get('host');
  if (host) return host.trim();
  try {
    return new URL(request.url).host;
  } catch {
    return '';
  }
}

/** null when the request is same-origin (or carries no Origin); otherwise a ready-to-return 403. */
export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin === null) return null;
  const denied = jsonResponse({ error: 'cross_origin' }, 403);
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return denied; // covers the opaque "null" origin and anything unparseable
  }
  const expected = expectedHost(request);
  if (!originHost || !expected) return denied;
  return originHost.toLowerCase() === expected.toLowerCase() ? null : denied;
}
