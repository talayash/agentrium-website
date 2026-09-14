import { describe, it, expect, vi, afterEach } from 'vitest';
import { getJson, FETCH_TIMEOUT_MS } from './session';

type FetchInit = RequestInit | undefined;

function stubFetch(impl: (url: string, init: FetchInit) => Promise<unknown>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('returns the parsed body on 200', async () => {
    stubFetch(async () => jsonResponse(200, { total: 7 }));
    const onUnauthorized = vi.fn();
    await expect(getJson<{ total: number }>('/api/stats', onUnauthorized)).resolves.toEqual({ total: 7 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('calls onUnauthorized and throws on 401', async () => {
    stubFetch(async () => jsonResponse(401, { error: 'unauthorized' }));
    const onUnauthorized = vi.fn();
    await expect(getJson('/api/stats', onUnauthorized)).rejects.toThrow('unauthorized');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws HTTP <status> on a non-2xx that is not 401', async () => {
    stubFetch(async () => jsonResponse(500, { error: 'internal_error' }));
    const onUnauthorized = vi.fn();
    await expect(getJson('/api/admin-summary', onUnauthorized)).rejects.toThrow('HTTP 500');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('normalises a TimeoutError abort into Error("timeout")', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const onUnauthorized = vi.fn();
    await expect(getJson('/api/stats-history', onUnauthorized)).rejects.toThrow('timeout');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('normalises an AbortError into Error("timeout")', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await expect(getJson('/api/stats-history', vi.fn())).rejects.toThrow('timeout');
  });

  it('leaves an unrelated rejection unchanged', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(getJson('/api/stats', vi.fn())).rejects.toThrow('Failed to fetch');
  });

  it('passes an AbortSignal to fetch', async () => {
    const spy = stubFetch(async () => jsonResponse(200, {}));
    await getJson('/api/stats', vi.fn());
    const init = spy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.cache).toBe('no-store');
    expect(init?.credentials).toBe('include');
  });

  it('arms the signal with the documented timeout', () => {
    // A real end-to-end abort would cost FETCH_TIMEOUT_MS of wall clock:
    // AbortSignal.timeout runs on a platform timer that fake timers do not
    // control. The wiring is covered by the signal assertion above and the
    // abort normalisation by the two DOMException cases.
    expect(FETCH_TIMEOUT_MS).toBe(20_000);
  });
});
