import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requireSameOrigin } from '../api/_lib/same-origin.js';
import { issueSessionCookie } from '../api/_lib/admin-session.js';
import login from '../api/admin-login.js';
import logout from '../api/admin-logout.js';
import errorsResolve from '../api/errors-resolve.js';
import feedbackDelete from '../api/feedback-delete.js';
import feedbackMark from '../api/feedback-mark-read.js';

const req = (headers = {}, method = 'POST') => new Request('https://claude-terminal.dev/api/x', { method, headers });

describe('requireSameOrigin', () => {
  it('allows a request that carries no Origin header', () => {
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev' }))).toBeNull();
  });
  it('allows an Origin whose host equals the Host header', () => {
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'https://claude-terminal.dev' }))).toBeNull();
  });
  it('compares hosts case-insensitively and with the port', () => {
    expect(requireSameOrigin(req({ host: 'Localhost:4300', origin: 'http://localhost:4300' }))).toBeNull();
    expect(requireSameOrigin(req({ host: 'localhost:4300', origin: 'http://localhost:4321' }))).not.toBeNull();
  });
  it('403s with a JSON error when the Origin host differs from Host', async () => {
    const r = requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'https://evil.example' }));
    expect(r.status).toBe(403);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await r.json()).error).toBe('cross_origin');
  });
  it('prefers x-forwarded-host over Host when the proxy sets it', () => {
    expect(requireSameOrigin(req({ host: 'internal.vercel.app', 'x-forwarded-host': 'claude-terminal.dev', origin: 'https://claude-terminal.dev' }))).toBeNull();
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', 'x-forwarded-host': 'other.example', origin: 'https://claude-terminal.dev' })).status).toBe(403);
  });
  it('uses the first x-forwarded-host when several are chained', () => {
    expect(requireSameOrigin(req({ 'x-forwarded-host': 'claude-terminal.dev, cdn.internal', origin: 'https://claude-terminal.dev' }))).toBeNull();
  });
  it('falls back to the request URL host when no Host header is present', () => {
    expect(requireSameOrigin(req({ origin: 'https://claude-terminal.dev' }))).toBeNull();
    expect(requireSameOrigin(req({ origin: 'https://evil.example' })).status).toBe(403);
  });
  it('rejects an opaque "null" Origin and an unparseable one', () => {
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'null' })).status).toBe(403);
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'not a url' })).status).toBe(403);
  });
  it('is not fooled by a matching host in the origin path or userinfo', () => {
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'https://evil.example/claude-terminal.dev' })).status).toBe(403);
    expect(requireSameOrigin(req({ host: 'claude-terminal.dev', origin: 'https://claude-terminal.dev@evil.example' })).status).toBe(403);
  });
});

describe('state-changing handlers reject cross-origin requests', () => {
  const SECRET = 's3';
  let upstream;
  let cookie;
  const HOST = 'claude-terminal.dev';

  beforeEach(async () => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = 'correct horse';
    process.env.CT_STATS_TOKEN = 'ct';
    upstream = vi.fn(async () => new Response('{"ok":true,"allowed":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', upstream);
    cookie = (await issueSessionCookie(SECRET)).split(';')[0];
  });
  afterEach(() => vi.unstubAllGlobals());

  const post = (path, origin, extra = {}) => new Request(`https://${HOST}${path}`, {
    method: 'POST',
    body: '{"ids":[1]}',
    headers: { 'content-type': 'application/json', host: HOST, cookie, ...(origin ? { origin } : {}), ...extra },
  });

  describe.each([
    ['errors-resolve', errorsResolve, '/api/errors-resolve'],
    ['feedback-delete', feedbackDelete, '/api/feedback-delete'],
    ['feedback-mark-read', feedbackMark, '/api/feedback-mark-read'],
  ])('%s', (_name, handler, path) => {
    it('403s a foreign Origin even with a valid session and never calls upstream', async () => {
      const r = await handler(post(path, 'https://evil.example'));
      expect(r.status).toBe(403);
      expect((await r.json()).error).toBe('cross_origin');
      expect(upstream).not.toHaveBeenCalled();
    });
    it('forwards when the Origin matches', async () => {
      expect((await handler(post(path, `https://${HOST}`))).status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(1);
    });
    it('forwards when no Origin header is present', async () => {
      expect((await handler(post(path, null))).status).toBe(200);
    });
  });

  it('admin-login 403s a foreign Origin before touching the rate limiter or the password', async () => {
    const r = await login(new Request(`https://${HOST}/api/admin-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: HOST, origin: 'https://evil.example', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ password: 'correct horse' }),
    }));
    expect(r.status).toBe(403);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });
  it('admin-login still issues a cookie for a same-origin request', async () => {
    const r = await login(new Request(`https://${HOST}/api/admin-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: HOST, origin: `https://${HOST}`, 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ password: 'correct horse' }),
    }));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain('agentrium_admin=');
  });
  it('admin-logout 403s a foreign Origin and does not clear the cookie', async () => {
    const r = await logout(new Request(`https://${HOST}/api/admin-logout`, { method: 'POST', headers: { host: HOST, origin: 'https://evil.example' } }));
    expect(r.status).toBe(403);
    expect(r.headers.get('set-cookie')).toBeNull();
  });
  it('admin-logout clears the cookie for a same-origin request', async () => {
    const r = await logout(new Request(`https://${HOST}/api/admin-logout`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}` } }));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
