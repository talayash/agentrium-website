import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { issueSessionCookie } from '../api/_lib/admin-session.js';
import summary from '../api/admin-summary.js';
import users from '../api/admin-users.js';
import user from '../api/admin-user.js';

const API = 'https://agentrium-api.vercel.app';
const WORKER = 'https://ct-analytics.claude-terminal.workers.dev';
let calls; let cookie;

beforeEach(async () => {
  process.env.ADMIN_SESSION_SECRET = 's3';
  process.env.ADMIN_API_TOKEN = 'api-tok';
  process.env.CT_STATS_TOKEN = 'ct';
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).startsWith(`${API}/api/admin/summary`)) {
      return Response.json({ generated_at: 'now', users: { total: 2 }, active_installation_ids: ['a', 'b'] });
    }
    if (String(url) === `${WORKER}/stats/match`) return Response.json({ active_today: 1, active_now: 0 });
    return Response.json({ ok: true });
  }));
  cookie = (await issueSessionCookie('s3')).split(';')[0];
});
afterEach(() => vi.unstubAllGlobals());

describe('admin-summary', () => {
  it('401 without a session', async () => {
    expect((await summary(new Request('https://x/api/admin-summary'))).status).toBe(401);
  });
  it('merges the match result and strips installation ids', async () => {
    const r = await summary(new Request('https://x/api/admin-summary', { headers: { cookie } }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.signed_in).toEqual({ active_today: 1, active_now: 0 });
    expect(body.active_installation_ids).toBeUndefined();
    expect(body.users.total).toBe(2);
    expect(calls[0][1].headers['x-admin-token']).toBe('api-tok');
    expect(JSON.parse(calls[1][1].body)).toEqual({ installation_ids: ['a', 'b'] });
  });
  it('signed_in is null when the match call fails', async () => {
    fetch.mockImplementation(async (url) => String(url).includes('/stats/match')
      ? new Response('x', { status: 500 })
      : Response.json({ generated_at: 'now', users: {}, active_installation_ids: [] }));
    const body = await (await summary(new Request('https://x/api/admin-summary', { headers: { cookie } }))).json();
    expect(body.signed_in).toBeNull();
  });
  it('signed_in is null and the Worker is never called when CT_STATS_TOKEN is unset', async () => {
    delete process.env.CT_STATS_TOKEN;
    const body = await (await summary(new Request('https://x/api/admin-summary', { headers: { cookie } }))).json();
    expect(body.signed_in).toBeNull();
    expect(calls.length).toBe(1);
  });
  it('502s with bad_upstream_response when the upstream body is not JSON', async () => {
    fetch.mockImplementation(async () => new Response('not json', { status: 200 }));
    const r = await summary(new Request('https://x/api/admin-summary', { headers: { cookie } }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('bad_upstream_response');
  });
});

describe('admin-users and admin-user', () => {
  it('401 without a session, and the upstream is never called', async () => {
    const r = await users(new Request('https://x/api/admin-users'));
    expect(r.status).toBe(401);
    expect(calls.length).toBe(0);
  });
  it('401 without a session, and the upstream is never called (admin-user)', async () => {
    const r = await user(new Request('https://x/api/admin-user?id=6f1c2a3e-1111-4222-8333-444455556666'));
    expect(r.status).toBe(401);
    expect(calls.length).toBe(0);
  });
  it('forwards whitelisted params', async () => {
    await users(new Request('https://x/api/admin-users?q=dan&limit=20&cursor=abc&evil=1', { headers: { cookie } }));
    expect(calls[0][0]).toBe(`${API}/api/admin/users?q=dan&limit=20&cursor=abc`);
  });
  it('validates the user id', async () => {
    expect((await user(new Request('https://x/api/admin-user?id=nope', { headers: { cookie } }))).status).toBe(400);
    await user(new Request('https://x/api/admin-user?id=6f1c2a3e-1111-4222-8333-444455556666', { headers: { cookie } }));
    expect(calls[0][0]).toBe(`${API}/api/admin/users/6f1c2a3e-1111-4222-8333-444455556666`);
  });
  it('passes through a non-2xx upstream response with its body and cache-control', async () => {
    fetch.mockImplementation(async () => Response.json({ error: 'boom' }, { status: 500 }));
    const r = await users(new Request('https://x/api/admin-users', { headers: { cookie } }));
    expect(r.status).toBe(500);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: 'boom' });
  });
  it('502s with upstream_unreachable when fetch rejects', async () => {
    fetch.mockImplementation(async () => { throw new Error('network down'); });
    const r = await user(new Request('https://x/api/admin-user?id=6f1c2a3e-1111-4222-8333-444455556666', { headers: { cookie } }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('upstream_unreachable');
  });
});
