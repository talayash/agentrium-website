// Errors panel: renders the ct-analytics /errors/summary payload, the same
// data the /errors slash command reads.
//
// Error messages, stacks and version strings come from user machines, so the
// group list is built entirely with el/text (textContent) and the breakdown
// labels are escaped before reaching the distribution renderer.

import { $, clear, el, text } from '../dom';
import { escapeHtml, formatNumber, osIcon, osLabel, timeAgo } from '../format';
import { renderDistribution, renderLineArea } from '../charts';
import { getJson } from '../session';
import { createPoller, type Poller } from '../poll';
import type { PanelCtx } from './types';

const POLL_MS = 5 * 60_000;
const GROUP_LIMIT = 50;
const SUMMARY_MESSAGE_CHARS = 160;

interface ErrorGroup {
  fingerprint: string;
  occurrences: number;
  users: number;
  last_seen: string;
  first_seen: string;
  source: string;
  kind: string | null;
  message: string;
  stack: string | null;
  versions: string;
}

interface ErrorsSummary {
  window_days?: number;
  total_errors?: number;
  affected_installations?: number;
  unique_fingerprints?: number;
  top_groups?: ErrorGroup[];
  by_source?: Array<{ source: string; count: number }>;
  by_version?: Array<{ version: string; count: number }>;
  by_os?: Array<{ os: string; count: number }>;
  by_day?: Array<{ date: string; count: number }>;
}

const MARKUP = `
<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
  <h2 class="admin-h2">Errors</h2>
  <div class="flex items-center gap-2">
    <select id="err-days" class="admin-input text-xs">
      <option value="1">Last 24 hours</option><option value="7" selected>Last 7 days</option>
      <option value="30">Last 30 days</option><option value="90">Last 90 days</option>
    </select>
    <span id="err-status" class="admin-pill">loading…</span>
  </div>
</div>
<div class="grid grid-cols-3 gap-4 mb-6">
  <div class="admin-card p-5"><div class="admin-label">Total errors</div><div id="err-total" class="admin-big text-[#FF453A]">-</div></div>
  <div class="admin-card p-5"><div class="admin-label">Installations affected</div><div id="err-installs" class="admin-big">-</div></div>
  <div class="admin-card p-5"><div class="admin-label">Unique groups</div><div id="err-groups" class="admin-big">-</div></div>
</div>
<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
  <section class="admin-card p-5"><h3 class="admin-h3">By source</h3><div id="err-by-source" class="space-y-2.5"></div></section>
  <section class="admin-card p-5"><h3 class="admin-h3">By version</h3><div id="err-by-version" class="space-y-2.5"></div></section>
  <section class="admin-card p-5"><h3 class="admin-h3">By OS</h3><div id="err-by-os" class="space-y-2.5"></div></section>
</div>
<section class="admin-card p-5 mb-6">
  <h3 class="admin-h3">Per day</h3>
  <svg id="err-by-day" viewBox="0 0 1000 200" preserveAspectRatio="none" class="w-full h-28 block"></svg>
</section>
<section class="admin-card p-5">
  <h3 class="admin-h3">Top groups</h3>
  <div id="err-top" class="divide-y divide-[var(--night-seam)]"></div>
</section>
`;

let ctx: PanelCtx;
let poller: Poller | null = null;

/**
 * The worker stores timestamps as SQLite `datetime()` text ("YYYY-MM-DD
 * HH:MM:SS", UTC, no zone). Date.parse reads that shape as local time, so
 * normalise it to an explicit UTC instant before formatting.
 */
function toIsoUtc(ts: string): string {
  const s = String(ts ?? '').trim();
  if (!s) return s;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function toRecord<T>(rows: T[] | undefined, key: (row: T) => string, count: (row: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    const k = key(row) || 'unknown';
    out[k] = (out[k] ?? 0) + (count(row) || 0);
  }
  return out;
}

function pill(label: string): HTMLElement {
  return text(
    'span',
    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--night-2)] text-[var(--night-text-2)]',
    label,
  );
}

function buildGroup(group: ErrorGroup): HTMLElement {
  const wrap = el('details', 'py-3');

  const summary = el('summary', 'cursor-pointer select-none list-none');
  const line1 = el('div', 'flex flex-wrap items-center gap-2 mb-1');
  line1.appendChild(
    text('span', 'font-semibold tabular-nums text-[#FF453A]', formatNumber(group.occurrences)),
  );
  line1.appendChild(
    text('span', 'text-xs text-[var(--night-text-3)]', `${formatNumber(group.users)} installations`),
  );
  line1.appendChild(pill(group.source || 'unknown'));
  if (group.kind) {
    line1.appendChild(text('span', 'text-xs text-[var(--night-text-2)]', group.kind));
  }
  summary.appendChild(line1);

  const msg = String(group.message ?? '');
  summary.appendChild(
    text(
      'div',
      'text-sm text-[var(--night-text)] break-words',
      msg.length > SUMMARY_MESSAGE_CHARS ? `${msg.slice(0, SUMMARY_MESSAGE_CHARS)}…` : msg,
    ),
  );

  const meta = el('div', 'text-[11px] text-[var(--night-text-3)] flex flex-wrap gap-x-3 gap-y-1 mt-1');
  if (group.versions) meta.appendChild(text('span', '', `v${group.versions}`));
  meta.appendChild(text('span', '', `first ${timeAgo(toIsoUtc(group.first_seen))}`));
  meta.appendChild(text('span', '', `last ${timeAgo(toIsoUtc(group.last_seen))}`));
  summary.appendChild(meta);
  wrap.appendChild(summary);

  const body = el('div', 'mt-3 space-y-2');
  if (msg.length > SUMMARY_MESSAGE_CHARS) {
    body.appendChild(text('div', 'text-sm text-[var(--night-text)] break-words', msg));
  }
  body.appendChild(text('pre', 'admin-pre', group.stack || 'no stack'));
  wrap.appendChild(body);

  return wrap;
}

function render(data: ErrorsSummary): void {
  $('err-total').textContent = formatNumber(data.total_errors ?? 0);
  $('err-installs').textContent = formatNumber(data.affected_installations ?? 0);
  $('err-groups').textContent = formatNumber(data.unique_fingerprints ?? 0);

  // Labels are interpolated into HTML by the distribution renderer, so the
  // server-supplied source, version and OS strings are escaped here.
  renderDistribution(
    $('err-by-source'),
    toRecord(data.by_source, (r) => r.source, (r) => r.count),
    (key) => ({ label: escapeHtml(key), sub: '' }),
  );
  renderDistribution(
    $('err-by-version'),
    toRecord(data.by_version, (r) => r.version, (r) => r.count),
    (key) => ({ label: `v${escapeHtml(key)}`, sub: '' }),
  );
  renderDistribution(
    $('err-by-os'),
    toRecord(data.by_os, (r) => r.os, (r) => r.count),
    (key) => ({ label: `${osIcon(key)} ${escapeHtml(osLabel(key))}`, sub: '' }),
  );

  renderLineArea(
    $('err-by-day') as unknown as SVGElement,
    (data.by_day ?? []).map((d) => ({ date: d.date, value: d.count })),
    '#FF453A',
  );

  const top = $('err-top');
  clear(top);
  const groups = data.top_groups ?? [];
  if (groups.length === 0) {
    top.appendChild(text('div', 'py-6 text-center text-sm text-[var(--night-text-3)]', 'No errors in this window.'));
    return;
  }
  for (const group of groups) top.appendChild(buildGroup(group));
}

function currentDays(): string {
  return ($('err-days') as HTMLSelectElement).value || '7';
}

async function load(): Promise<void> {
  const status = $('err-status');
  status.textContent = 'loading…';
  try {
    const data = await getJson<ErrorsSummary>(
      `/api/errors-summary?days=${currentDays()}&limit=${GROUP_LIMIT}`,
      ctx.onUnauthorized,
    );
    render(data);
    const at = new Date().toLocaleTimeString();
    status.textContent = `ok · ${at}`;
    ctx.setRefreshed(at);
  } catch (err) {
    // A failed poll keeps the last good render; the pill carries the reason.
    const msg = err instanceof Error ? err.message : String(err);
    status.textContent = `error: ${msg}`;
  }
}

// -- Panel contract ----------------------------------------------------------

export function mount(root: HTMLElement, panelCtx: PanelCtx): void {
  ctx = panelCtx;
  root.innerHTML = MARKUP;
  $('err-days').addEventListener('change', () => {
    refresh();
  });
  poller = createPoller(load, POLL_MS);
}

export function activate(): void {
  poller?.start();
}

export function deactivate(): void {
  poller?.stop();
}

export function refresh(): void {
  poller?.now();
}

/**
 * Keeps the Errors tab badge current regardless of which tab is showing.
 * Returns the poller so the page can stop it when the session expires.
 */
export function pollBadge(ctx2: PanelCtx): Poller {
  const tick = async (): Promise<void> => {
    try {
      const d = await getJson<{ unique_fingerprints: number }>(
        '/api/errors-summary?days=1&limit=1',
        ctx2.onUnauthorized,
      );
      ctx2.setBadge('errors', d.unique_fingerprints ?? 0);
    } catch {
      // Badge is best-effort; the Errors tab itself reports load errors.
    }
  };
  const badgePoller = createPoller(tick, 300_000);
  badgePoller.start();
  return badgePoller;
}
