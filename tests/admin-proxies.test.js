import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { issueSessionCookie } from '../api/_lib/admin-session.js';
import stats from '../api/stats.js';
import live from '../api/stats-live.js';
import history from '../api/stats-history.js';
import feedbackList from '../api/feedback-list.js';
import feedbackMark from '../api/feedback-mark-read.js';
import errorsSummary from '../api/errors-summary.js';
import errorsResolve from '../api/errors-resolve.js';
import feedbackDelete from '../api/feedback-delete.js';

const SECRET = 's3';
let upstream;
let cookie;

beforeEach(async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.CT_STATS_TOKEN = 'ct';
  upstream = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', upstream);
  cookie = (await issueSessionCookie(SECRET)).split(';')[0];
});
afterEach(() => vi.unstubAllGlobals());

const cases = [
  ['stats', stats, 'GET', '/api/stats', 'https://ct-analytics.claude-terminal.workers.dev/stats'],
  ['stats-live', live, 'GET', '/api/stats-live', 'https://ct-analytics.claude-terminal.workers.dev/stats/live'],
  ['stats-history', history, 'GET', '/api/stats-history?metric=dau&days=7', 'https://ct-analytics.claude-terminal.workers.dev/stats/history?metric=dau&days=7'],
  ['feedback-list', feedbackList, 'GET', '/api/feedback-list?limit=5&unread_only=1', 'https://ct-analytics.claude-terminal.workers.dev/feedback/list?limit=5&unread_only=1'],
  ['feedback-mark-read', feedbackMark, 'POST', '/api/feedback-mark-read', 'https://ct-analytics.claude-terminal.workers.dev/feedback/mark_read'],
  ['errors-summary', errorsSummary, 'GET', '/api/errors-summary?days=30&limit=10', 'https://ct-analytics.claude-terminal.workers.dev/errors/summary?days=30&limit=10'],
  ['errors-resolve', errorsResolve, 'POST', '/api/errors-resolve', 'https://ct-analytics.claude-terminal.workers.dev/errors/resolve'],
  ['feedback-delete', feedbackDelete, 'POST', '/api/feedback-delete', 'https://ct-analytics.claude-terminal.workers.dev/feedback/delete'],
];

describe.each(cases)('%s proxy', (_name, handler, method, path, expectedUpstream) => {
  const init = method === 'POST' ? { method, body: '{"ids":[1]}', headers: { 'content-type': 'application/json' } } : {};
  it('401 without a session and never calls upstream', async () => {
    const r = await handler(new Request(`https://x${path}`, init));
    expect(r.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('forwards with the worker token when the session is valid', async () => {
    const r = await handler(new Request(`https://x${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie } }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const [url, opts] = upstream.mock.calls[0];
    expect(String(url)).toBe(expectedUpstream);
    expect(opts.headers['x-ct-token']).toBe('ct');
    if (method === 'POST') expect(opts.body).toBe('{"ids":[1]}');
  });
});

describe('stats-history validation', () => {
  it('rejects an unknown metric with 400', async () => {
    const r = await history(new Request('https://x/api/stats-history?metric=evil', { headers: { cookie } }));
    expect(r.status).toBe(400);
  });
});

describe('upstream failure', () => {
  it('502 when the worker is unreachable', async () => {
    upstream.mockRejectedValue(new Error('down'));
    const r = await stats(new Request('https://x/api/stats', { headers: { cookie } }));
    expect(r.status).toBe(502);
  });
});

describe('write proxies reject the wrong verb', () => {
  it('405s a GET to errors-resolve without calling upstream', async () => {
    const r = await errorsResolve(new Request('https://x/api/errors-resolve', { headers: { cookie } }));
    expect(r.status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('405s a GET to feedback-delete without calling upstream', async () => {
    const r = await feedbackDelete(new Request('https://x/api/feedback-delete', { headers: { cookie } }));
    expect(r.status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('write proxies relay the request body verbatim', () => {
  it('forwards a resolve batch', async () => {
    const body = JSON.stringify({ fingerprints: ['a1b2'], resolved: true });
    await errorsResolve(new Request('https://x/api/errors-resolve', {
      method: 'POST', body, headers: { cookie, 'content-type': 'application/json' },
    }));
    expect(upstream.mock.calls[0][1].body).toBe(body);
  });
  it('forwards an undo as the same route with the flag flipped', async () => {
    const body = JSON.stringify({ ids: [7], deleted: false });
    await feedbackDelete(new Request('https://x/api/feedback-delete', {
      method: 'POST', body, headers: { cookie, 'content-type': 'application/json' },
    }));
    const [url, opts] = upstream.mock.calls[0];
    expect(String(url)).toBe('https://ct-analytics.claude-terminal.workers.dev/feedback/delete');
    expect(opts.body).toBe(body);
  });
});
