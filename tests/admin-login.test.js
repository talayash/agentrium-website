import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import login from '../api/admin-login.js';
import session from '../api/admin-session.js';
import logout from '../api/admin-logout.js';
import { COOKIE_NAME } from '../api/_lib/admin-session.js';

const SECRET = 'unit-test-secret';
const post = (body, headers = {}) => new Request('https://x/api/admin-login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', ...headers }, body: JSON.stringify(body),
});

let limiter;
beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'correct horse';
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.CT_STATS_TOKEN = 'ct-token';
  limiter = vi.fn(async () => new Response(JSON.stringify({ allowed: true, remaining: 9 }), { status: 200 }));
  vi.stubGlobal('fetch', limiter);
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/admin-login', () => {
  it('sets the session cookie on the right password', async () => {
    const r = await login(post({ password: 'correct horse' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain(`${COOKIE_NAME}=`);
    const [url, init] = limiter.mock.calls[0];
    expect(String(url)).toBe('https://ct-analytics.claude-terminal.workers.dev/admin/login_attempt');
    expect(init.headers['x-ct-token']).toBe('ct-token');
    expect(JSON.parse(init.body)).toEqual({ ip: '203.0.113.9' });
  });
  it('401 on a wrong password and never sets a cookie', async () => {
    const r = await login(post({ password: 'wrong' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });
  it('400 on a body without a string password', async () => {
    expect((await login(post({}))).status).toBe(400);
  });
  it('400 invalid_payload when the password is longer than 512 chars', async () => {
    const r = await login(post({ password: 'x'.repeat(513) }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_payload');
  });
  it('400 invalid_json on a malformed request body', async () => {
    const r = await login(new Request('https://x/api/admin-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      body: '{',
    }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_json');
  });
  it('429 with Retry-After when the limiter denies, before checking the password', async () => {
    limiter.mockResolvedValue(new Response(JSON.stringify({ allowed: false, retry_after_seconds: 612 }), { status: 200 }));
    const r = await login(post({ password: 'correct horse' }));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('612');
  });
  it('503 when the limiter is unreachable (fail closed)', async () => {
    limiter.mockRejectedValue(new Error('boom'));
    expect((await login(post({ password: 'correct horse' }))).status).toBe(503);
  });
  it('503 rate_limiter_unavailable when the limiter responds non-2xx, and no cookie set', async () => {
    limiter.mockResolvedValue(new Response('x', { status: 500 }));
    const r = await login(post({ password: 'correct horse' }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('rate_limiter_unavailable');
    expect(r.headers.get('set-cookie')).toBeNull();
  });
  it('500 when ADMIN_PASSWORD is unset', async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await login(post({ password: 'x' }))).status).toBe(500);
  });
  it('405 method_not_allowed on a non-POST request', async () => {
    const r = await login(new Request('https://x/api/admin-login', { method: 'GET' }));
    expect(r.status).toBe(405);
    expect((await r.json()).error).toBe('method_not_allowed');
  });
});

describe('GET /api/admin-session and POST /api/admin-logout', () => {
  it('session is 401 without a cookie and 204 with the one login issued', async () => {
    expect((await session(new Request('https://x/api/admin-session'))).status).toBe(401);
    const sc = (await login(post({ password: 'correct horse' }))).headers.get('set-cookie');
    const cookie = sc.split(';')[0];
    expect((await session(new Request('https://x/api/admin-session', { headers: { cookie } }))).status).toBe(204);
  });
  it('logout clears the cookie', async () => {
    const r = await logout(new Request('https://x/api/admin-logout', { method: 'POST' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('405 method_not_allowed on a non-GET request to admin-session', async () => {
    const r = await session(new Request('https://x/api/admin-session', { method: 'POST' }));
    expect(r.status).toBe(405);
    expect((await r.json()).error).toBe('method_not_allowed');
  });
  it('405 method_not_allowed on a non-POST request to admin-logout, and no cookie set', async () => {
    const r = await logout(new Request('https://x/api/admin-logout', { method: 'GET' }));
    expect(r.status).toBe(405);
    expect((await r.json()).error).toBe('method_not_allowed');
    expect(r.headers.get('set-cookie')).toBeNull();
  });
});
