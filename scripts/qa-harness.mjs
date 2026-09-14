// Local QA harness for the Agentrium website's /admin page.
// Serves the Astro build (dist/) and runs the Vercel edge functions in api/*.js
// as plain Node handlers. Upstream origins are rewritten via a fetch shim so the
// proxies talk to local servers instead of production:
//   ct-analytics worker  -> WORKER_LOCAL (default http://127.0.0.1:8787, `wrangler dev --remote`)
//   agentrium-api        -> API_LOCAL    (default http://127.0.0.1:3000, `next dev`)
// Usage: node qa-harness.mjs <website-repo-dir> [port]
// Env: ADMIN_PASSWORD, ADMIN_SESSION_SECRET, CT_STATS_TOKEN, ADMIN_API_TOKEN, WORKER_LOCAL, API_LOCAL

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 4300);
const WORKER_PROD = 'https://ct-analytics.claude-terminal.workers.dev';
const API_PROD = 'https://agentrium-api.vercel.app';
const WORKER_LOCAL = process.env.WORKER_LOCAL ?? 'http://127.0.0.1:8787';
const API_LOCAL = process.env.API_LOCAL ?? 'http://127.0.0.1:3000';

for (const k of ['ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'CT_STATS_TOKEN', 'ADMIN_API_TOKEN']) {
  if (!process.env[k]) console.warn(`[qa] warning: ${k} is not set`);
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const orig = url;
  // Only the two routes that are not deployed yet go to the local worker; data
  // routes keep hitting production so the dashboard shows real telemetry.
  const LOCAL_WORKER_PATHS = ['/admin/login_attempt', '/stats/match'];
  // WORKER_ALL_LOCAL=1 sends every worker call to the local wrangler (fully offline QA).
  if (url.startsWith(WORKER_PROD)) {
    const path = url.slice(WORKER_PROD.length);
    if (process.env.WORKER_ALL_LOCAL === '1' || LOCAL_WORKER_PATHS.some((p) => path.startsWith(p))) url = WORKER_LOCAL + path;
  } else if (url.startsWith(API_PROD)) url = API_LOCAL + url.slice(API_PROD.length);
  if (url !== orig) console.log(`[qa] upstream ${init?.method ?? 'GET'} ${orig} -> ${url}`);
  return realFetch(url, init);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.gif': 'image/gif', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

async function serveStatic(pathname, res) {
  let file = join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
  } catch {
    if (!extname(file)) file = `${file}.html`; // Astro's /admin -> dist/admin.html (or admin/index.html)
    try { await stat(file); } catch { file = join(root, 'dist', pathname, 'index.html'); }
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + pathname);
  }
}

async function runEdge(name, req, res) {
  const modPath = join(root, 'api', `${name}.js`);
  let mod;
  try { mod = await import(pathToFileURL(modPath).href); } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end(`no edge function ${name}: ${e.message}`); return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? '127.0.0.1');
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method, headers, body: body && !['GET', 'HEAD'].includes(req.method) ? body : undefined,
  });
  let response;
  try { response = await mod.default(request); } catch (e) {
    console.error(`[qa] ${name} threw`, e);
    res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(e)); return;
  }
  const out = {};
  response.headers.forEach((v, k) => { out[k] = v; });
  // Local http: drop Secure so the browser accepts the cookie.
  if (out['set-cookie']) out['set-cookie'] = out['set-cookie'].replace(/;\s*Secure/i, '');
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`);
  console.log(`[qa] ${req.method} ${req.url}`);
  if (pathname.startsWith('/api/')) return runEdge(pathname.slice(5), req, res);
  return serveStatic(pathname, res);
}).listen(port, '127.0.0.1', () => {
  console.log(`[qa] website at http://localhost:${port}/admin  (dist from ${root})`);
  console.log(`[qa] worker -> ${WORKER_LOCAL}, api -> ${API_LOCAL}`);
});
