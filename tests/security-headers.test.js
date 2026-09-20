import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function loadHeaders() {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  expect(Array.isArray(config.headers), 'vercel.json must declare a headers block').toBe(true);
  return config.headers;
}

/** Vercel `source` patterns are path-to-regexp; the ones this repo uses are plain regex groups. */
function matches(source, path) {
  return new RegExp(`^${source}$`).test(path);
}

function headersFor(entries, path) {
  const out = {};
  for (const entry of entries) {
    if (!matches(entry.source, path)) continue;
    for (const h of entry.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

function directive(csp, name) {
  const part = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `) || s === name);
  return part ? part.slice(name.length).trim() : null;
}

const ROUTES = ['/', '/admin', '/changelog', '/api/stats', '/api/admin-login', '/_astro/x.js'];

describe('vercel.json security headers', () => {
  it('sets the baseline hardening headers on every route', async () => {
    const entries = await loadHeaders();
    for (const path of ROUTES) {
      const h = headersFor(entries, path);
      expect(h['x-content-type-options'], `${path} X-Content-Type-Options`).toBe('nosniff');
      expect(h['referrer-policy'], `${path} Referrer-Policy`).toBe('strict-origin-when-cross-origin');
      expect(h['x-frame-options'], `${path} X-Frame-Options`).toBe('DENY');
      expect(h['permissions-policy'], `${path} Permissions-Policy`).toMatch(/camera=\(\)/);
      expect(h['permissions-policy'], `${path} Permissions-Policy`).toMatch(/microphone=\(\)/);
      expect(h['permissions-policy'], `${path} Permissions-Policy`).toMatch(/geolocation=\(\)/);
    }
  });

  it('sets a Content-Security-Policy on every route, including /admin and /api/*', async () => {
    const entries = await loadHeaders();
    for (const path of ROUTES) {
      const csp = headersFor(entries, path)['content-security-policy'];
      expect(csp, `${path} must carry a CSP`).toBeTruthy();
      expect(directive(csp, 'default-src'), `${path} default-src`).toBe("'self'");
      expect(directive(csp, 'frame-ancestors'), `${path} frame-ancestors`).toBe("'none'");
      expect(directive(csp, 'base-uri'), `${path} base-uri`).toBe("'self'");
      expect(directive(csp, 'form-action'), `${path} form-action`).toBe("'self'");
      expect(directive(csp, 'object-src'), `${path} object-src`).toBe("'none'");
      expect(csp).not.toContain("'unsafe-eval'");
      // Scripts must be served as files: inline script execution is what an
      // injected <script> needs, so script-src never falls back to unsafe-inline.
      const scriptSrc = directive(csp, 'script-src');
      expect(scriptSrc, `${path} script-src`).toContain("'self'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain('*');
    }
  });

  it('allows exactly the third-party origins the layout uses', async () => {
    const entries = await loadHeaders();
    const csp = headersFor(entries, '/')['content-security-policy'];
    // Layout.astro: Inter Variable from rsms.me; Vercel Analytics + Speed Insights.
    expect(directive(csp, 'style-src')).toContain('https://rsms.me');
    expect(directive(csp, 'font-src')).toContain('https://rsms.me');
    expect(directive(csp, 'script-src')).toContain('https://va.vercel-scripts.com');
    expect(directive(csp, 'connect-src')).toContain("'self'");
    expect(directive(csp, 'connect-src')).toContain('https://vitals.vercel-insights.com');
  });

  it('keeps every origin the CSP allows in sync with the source that needs it', async () => {
    // If rsms.me is ever dropped from Layout.astro the CSP should shrink with it.
    const layout = await readFile(`${ROOT}src/layouts/Layout.astro`, 'utf8');
    expect(layout).toContain('https://rsms.me/inter/inter.css');
    expect(layout).toMatch(/@vercel\/analytics\/astro/);
    expect(layout).toMatch(/@vercel\/speed-insights\/astro/);
  });
});
