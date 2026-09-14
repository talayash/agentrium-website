import { describe, it, expect } from 'vitest';
import {
  COOKIE_NAME, issueSessionCookie, clearSessionCookie, verifySessionCookie,
  requireAdminSession, constantTimeEqual,
} from '../api/_lib/admin-session.js';

const SECRET = 'unit-test-secret-please-ignore';
const cookieValue = (setCookie) => setCookie.split(';')[0].split('=')[1];

describe('admin session cookie', () => {
  it('issues an HttpOnly, Secure, SameSite=Strict cookie with a 30 day max-age', async () => {
    const sc = await issueSessionCookie(SECRET);
    expect(sc.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=2592000']) expect(sc).toContain(attr);
  });
  it('verifies its own cookie', async () => {
    const sc = await issueSessionCookie(SECRET);
    expect(await verifySessionCookie(`foo=bar; ${COOKIE_NAME}=${cookieValue(sc)}`, SECRET)).toBe(true);
  });
  it('rejects a tampered signature, a wrong secret, and an expired cookie', async () => {
    const sc = await issueSessionCookie(SECRET, 1_000_000_000_000);
    const v = cookieValue(sc);
    expect(await verifySessionCookie(`${COOKIE_NAME}=${v}`, 'other-secret')).toBe(false);
    const [exp, sig] = v.split('.');
    expect(await verifySessionCookie(`${COOKIE_NAME}=${exp}.${sig.slice(0, -1)}0`, SECRET)).toBe(false);
    expect(await verifySessionCookie(`${COOKIE_NAME}=${Number(exp) + 999}.${sig}`, SECRET)).toBe(false);
    expect(await verifySessionCookie(`${COOKIE_NAME}=${v}`, SECRET, 1_000_000_000_000 + 31 * 86400 * 1000)).toBe(false);
  });
  it('rejects a missing or malformed cookie', async () => {
    expect(await verifySessionCookie('', SECRET)).toBe(false);
    expect(await verifySessionCookie(null, SECRET)).toBe(false);
    expect(await verifySessionCookie(`${COOKIE_NAME}=garbage`, SECRET)).toBe(false);
  });
  it('clearSessionCookie expires the cookie', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
  it('constantTimeEqual compares strings of unequal length as false', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('requireAdminSession', () => {
  it('returns 500 when the secret is missing', async () => {
    delete process.env.ADMIN_SESSION_SECRET;
    const r = await requireAdminSession(new Request('https://x/api/x'));
    expect(r.status).toBe(500);
  });
  it('returns 401 without a valid cookie and null with one', async () => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
    expect((await requireAdminSession(new Request('https://x/api/x'))).status).toBe(401);
    const sc = await issueSessionCookie(SECRET);
    const ok = await requireAdminSession(new Request('https://x/api/x', { headers: { cookie: `${COOKIE_NAME}=${cookieValue(sc)}` } }));
    expect(ok).toBeNull();
  });
});
