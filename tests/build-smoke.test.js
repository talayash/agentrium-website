import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

describe('Astro build', () => {
  it('astro build completes without errors', () => {
    let output;
    try {
      output = execFileSync(npmCmd, ['run', 'build'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 120_000,
        // .cmd files on Windows require a shell to execute; shell:false is
        // used on POSIX where 'npm' is a real binary (no injection risk).
        shell: process.platform === 'win32',
      });
    } catch (err) {
      const stdout = err.stdout ? err.stdout.toString() : '';
      const stderr = err.stderr ? err.stderr.toString() : '';
      throw new Error(`astro build failed:\n${stdout}\n${stderr}`);
    }
    expect(output).toMatch(/Complete!|built in|generated/i);
  }, 120_000);

  it("emits no inline <script> or inline event handlers, so the CSP script-src can stay 'self'", () => {
    // vercel.json ships script-src without unsafe-inline. Astro inlines any
    // bundled <script> under vite.build.assetsInlineLimit, which the browser
    // would then refuse to run; astro.config.mjs sets the limit to 0 so every
    // script is a hashed /_astro/*.js file. This test pins that contract.
    const files = htmlFiles(DIST);
    expect(files.length).toBeGreaterThan(0);
    const offenders = [];
    for (const f of files) {
      const html = readFileSync(f, 'utf8');
      const rel = f.replace(DIST, 'dist');
      for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
        if (!/\bsrc\s*=/.test(m[1])) offenders.push(`${rel}: <script${m[1]}>`);
      }
      for (const m of html.matchAll(/\son[a-z]+\s*=\s*["']/gi)) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders, `inline script found in built HTML:\n${offenders.join('\n')}`).toEqual([]);
  });
});
