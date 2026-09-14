import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function walk(dir, exts) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      results.push(...(await walk(full, exts)));
    } else if (exts.includes(extname(e.name))) {
      results.push(full);
    }
  }
  return results;
}

describe('Copy conventions', () => {
  it('no em-dash characters in src/**', async () => {
    const files = await walk(join(ROOT, 'src'), ['.astro', '.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md']);
    const offenders = [];
    for (const f of files) {
      const content = await readFile(f, 'utf8');
      if (content.includes('—')) offenders.push(f.replace(ROOT, ''));
    }
    expect(offenders, `Em-dash (U+2014) found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no em-dash in README.md', async () => {
    const content = await readFile(join(ROOT, 'README.md'), 'utf8');
    expect(content.includes('—')).toBe(false);
  });
});

describe('Palette discipline (Midnight Glass)', () => {
  it('global.css declares the Midnight ramp and Apple-blue accent', async () => {
    const css = await readFile(join(ROOT, 'src/styles/global.css'), 'utf8');
    expect(css).toMatch(/--night-canvas:\s*#080A12/i);
    expect(css).toMatch(/--night-0:\s*#0F1320/i);
    expect(css).toMatch(/--accent:\s*#0A84FF/i);
    expect(css).toMatch(/--ink:\s*#1D1D1F/i);
  });

  it('global.css keeps the legacy aliases /stat depends on', async () => {
    // /stat styles itself with var(--coral), var(--ink), var(--muted-label),
    // var(--muted-body) and the .surface card class. The aliases may point at
    // the new palette, but they must exist.
    const css = await readFile(join(ROOT, 'src/styles/global.css'), 'utf8');
    for (const token of ['--coral:', '--paper:', '--muted-label:', '--muted-body:', '--hairline:']) {
      expect(css, `global.css must keep declaring ${token}`).toContain(token);
    }
  });

  it('global.css does not reintroduce the retired coral-era palette', async () => {
    const css = await readFile(join(ROOT, 'src/styles/global.css'), 'utf8');
    for (const pattern of [/c86a4a/i, /faf9f5/i, /a3e635/i, /ec4899/i]) {
      expect(css, `global.css contains retired color ${pattern}`).not.toMatch(pattern);
    }
  });

  it('global.css defines the .surface utility used by /stat', async () => {
    const css = await readFile(join(ROOT, 'src/styles/global.css'), 'utf8');
    expect(css).toMatch(/\.surface\s*\{[^}]*(background|border)/);
  });
});

describe('Homepage IA', () => {
  it('index.astro composes the Midnight Glass sections in order', async () => {
    const src = await readFile(join(ROOT, 'src/pages/index.astro'), 'utf8');
    const expectedImports = ['Layout', 'Intro', 'Navbar', 'Hero', 'Agents', 'Features', 'Screenshots', 'Download', 'Footer'];
    for (const name of expectedImports) {
      expect(src, `index.astro missing import: ${name}`).toMatch(new RegExp(`import\\s+${name}\\s+from`));
    }
    const bannedImports = ['Trust', 'Parallel', 'Compare', 'ChangelogPreview', 'CallToAction', 'TechStack'];
    for (const name of bannedImports) {
      expect(src, `index.astro still imports removed component: ${name}`).not.toMatch(new RegExp(`import\\s+${name}\\s+from`));
    }
  });
});

describe('Load-bearing behavior', () => {
  it('Hero keeps the platform-aware download CTA contract', async () => {
    const src = await readFile(join(ROOT, 'src/components/Hero.astro'), 'utf8');
    expect(src).toMatch(/id="hero-primary-dl"/);
    expect(src).toMatch(/data-win=/);
    expect(src).toMatch(/data-mac=/);
  });

  it('index.astro still fetches the release version from GitHub', async () => {
    const src = await readFile(join(ROOT, 'src/pages/index.astro'), 'utf8');
    expect(src).toMatch(/api\.github\.com\/repos\/talayash\/agentrium\/releases\/latest/);
    // The Node 24 + Windows teardown workaround must survive too.
    expect(src).toMatch(/setTimeout\(resolve,\s*500\)/);
  });

  it('Download links point at the GitHub release artifacts', async () => {
    const src = await readFile(join(ROOT, 'src/components/Download.astro'), 'utf8');
    expect(src).toMatch(/releases\/latest\/download/);
    for (const artifact of ['aarch64.dmg', 'x64.dmg', 'x64-setup.exe', 'x64_en-US.msi']) {
      expect(src, `Download.astro missing artifact ${artifact}`).toContain(artifact);
    }
  });
});

describe('Intro splash', () => {
  it('is session-gated and honors reduced motion', async () => {
    const src = await readFile(join(ROOT, 'src/components/Intro.astro'), 'utf8');
    expect(src).toMatch(/sessionStorage/);
    expect(src).toMatch(/prefers-reduced-motion/);
  });

  it('is hidden by default so no-JS visitors never see an overlay', async () => {
    const src = await readFile(join(ROOT, 'src/components/Intro.astro'), 'utf8');
    expect(src).toMatch(/#agr-intro\s*\{[^}]*display:\s*none/);
  });
});

describe('Motion discipline', () => {
  it('global.css disables reveal animations under prefers-reduced-motion', async () => {
    const css = await readFile(join(ROOT, 'src/styles/global.css'), 'utf8');
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

describe('Layout head', () => {
  it('Layout.astro exposes a <slot name="head" /> for per-page meta', async () => {
    // Required so /stat can inject its noindex robots meta. Without this,
    // the /stat page becomes indexable.
    const src = await readFile(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    expect(src).toMatch(/<slot\s+name=["']head["']\s*\/?>/);
  });

  it('Layout.astro declares social preview meta tags', async () => {
    const src = await readFile(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    expect(src).toMatch(/property=["']og:image["']/);
    expect(src).toMatch(/name=["']twitter:card["']/);
    expect(src).toMatch(/name=["']twitter:image["']/);
  });

  it('Layout.astro declares a favicon', async () => {
    const src = await readFile(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    expect(src).toMatch(/rel=["']icon["'][^>]+href=/);
  });
});

describe('Admin dashboard', () => {
  it('admin.astro composes the five tabs and is noindex', async () => {
    const src = await readFile(join(ROOT, 'src/pages/admin.astro'), 'utf8');
    for (const tab of ['overview', 'users', 'telemetry', 'errors', 'inbox']) {
      expect(src).toContain(`data-tab="${tab}"`);
      expect(src).toContain(`data-panel="${tab}"`);
    }
    expect(src).toMatch(/name="robots" content="noindex/);
  });

  it('only admin.astro and its panels call the admin proxies', async () => {
    const files = (await walk(join(ROOT, 'src'), ['.astro', '.ts', '.js']))
      .filter((f) => !f.includes(`${join('src', 'lib', 'admin')}`) && !f.endsWith('admin.astro'));
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      expect(src, `${f} must not call /api/admin-*`).not.toMatch(/\/api\/admin-/);
    }
  });

  it('every api/*.js data proxy is session-gated', async () => {
    const dir = join(ROOT, 'api');
    const entries = (await readdir(dir)).filter((n) => n.endsWith('.js'));
    const exempt = new Set(['admin-login.js', 'admin-logout.js', 'admin-session.js']);
    for (const name of entries) {
      if (exempt.has(name)) continue;
      const src = await readFile(join(dir, name), 'utf8');
      expect(src, `${name} must go through proxyWorker/fetchApi (session gate)`).toMatch(/proxyWorker|fetchApi/);
    }
  });
});
