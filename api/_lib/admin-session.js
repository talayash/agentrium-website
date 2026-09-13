// Signed session cookie for /admin. Edge runtime: Web Crypto only.
// Cookie value = "<expiresUnixMs>.<hmacSha256Hex(expires, secret)>".

export const COOKIE_NAME = 'agentrium_admin';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const enc = new TextEncoder();

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against self when lengths differ so timing stays flat; result is false either way.
  const other = ab.length === bb.length ? bb : ab;
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ other[i];
  return diff === 0;
}

export async function issueSessionCookie(secret, nowMs = Date.now()) {
  const expires = String(nowMs + MAX_AGE_SECONDS * 1000);
  const sig = await hmacHex(expires, secret);
  return `${COOKIE_NAME}=${expires}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function readCookie(header, name) {
  if (typeof header !== 'string' || !header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function verifySessionCookie(cookieHeader, secret, nowMs = Date.now()) {
  const value = readCookie(cookieHeader, COOKIE_NAME);
  if (!value || !secret) return false;
  const dot = value.indexOf('.');
  if (dot < 0) return false;
  const expires = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d{1,16}$/.test(expires) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = await hmacHex(expires, secret);
  if (!constantTimeEqual(sig, expected)) return false;
  return Number(expires) > nowMs;
}

export function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });
}

/** null when the request carries a valid session; otherwise a ready-to-return Response. */
export async function requireAdminSession(request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return jsonResponse({ error: 'server_misconfigured', detail: 'ADMIN_SESSION_SECRET not set' }, 500);
  const ok = await verifySessionCookie(request.headers.get('cookie'), secret);
  return ok ? null : jsonResponse({ error: 'unauthorized' }, 401);
}
