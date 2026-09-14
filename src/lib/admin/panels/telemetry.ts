// Telemetry panel: the body of the old /stat page, moved into the dashboard.
//
// The markup below is stat.astro's <main> from the live-now banner down to
// the raw-payload <details>; the page header and footer line are dropped
// because the dashboard shell provides them. The renderers now live in
// ../charts and the formatters in ../format, so Overview reuses them.

import { $ } from '../dom';
import {
  countryFlag,
  countryName,
  distinctCount,
  formatNumber,
  osIcon,
  osLabel,
} from '../format';
import {
  errorState,
  renderDistribution,
  renderLineArea,
  renderStackedArea,
  type LineAreaPoint,
  type StackedAreaPoint,
} from '../charts';
import { getJson } from '../session';
import { createPoller, type Poller } from '../poll';
import type { PanelCtx } from './types';

const HISTORY_DAYS = 30;
const LIVE_POLL_MS = 15_000;
const HISTORY_POLL_MS = 5 * 60_000;

interface TodayStats {
  date?: string;
  daily_active_users?: number;
  total_heartbeats_today?: number;
  total_update_checks_today?: number;
  total_installations?: number;
  version_distribution?: Record<string, number>;
  os_distribution?: Record<string, number>;
  country_distribution?: Record<string, number>;
}

interface LiveStats {
  active_now?: number;
  window_seconds?: number;
  by_version?: Record<string, number>;
  by_os?: Record<string, number>;
  by_country?: Record<string, number>;
}

interface Series<T> {
  series?: T[];
}

const MARKUP = `
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <h2 class="admin-h2">Telemetry</h2>
    <span id="tel-status" class="admin-pill">loading…</span>
  </div>

  <!-- Live now banner -->
  <div class="surface rounded-xl p-5 mb-6 border border-[var(--coral)]/20">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-baseline gap-4">
        <div>
          <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-1">Active Now</div>
          <div class="flex items-baseline gap-2">
            <span id="kpi-active-now" class="text-4xl font-bold text-[var(--coral)] tabular-nums">-</span>
            <span class="text-xs text-[var(--muted-label)]">in last <span id="kpi-active-window">15</span> min</span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--muted-body)]">
        <span>versions: <span id="kpi-active-versions" class="text-[var(--muted-body)]">-</span></span>
        <span>os: <span id="kpi-active-os" class="text-[var(--muted-body)]">-</span></span>
        <span>countries: <span id="kpi-active-countries" class="text-[var(--muted-body)]">-</span></span>
      </div>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Date</div>
      <div id="kpi-date" class="text-2xl font-bold text-[var(--ink)] tabular-nums">-</div>
    </div>
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Daily Active Users</div>
      <div id="kpi-dau" class="text-3xl font-bold text-[var(--coral)] tabular-nums">-</div>
    </div>
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Heartbeats Today</div>
      <div id="kpi-hb" class="text-3xl font-bold text-[var(--ink)] tabular-nums">-</div>
    </div>
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Update Checks Today</div>
      <div id="kpi-uc" class="text-3xl font-bold text-[var(--ink)] tabular-nums">-</div>
    </div>
  </div>

  <!-- Total installs banner -->
  <div class="surface rounded-xl p-5 mb-8 flex items-center justify-between flex-wrap gap-4">
    <div>
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-1">Total Installations</div>
      <div id="kpi-installs" class="text-4xl font-bold text-[var(--ink)] tabular-nums">-</div>
    </div>
    <div class="text-right">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-1">Last Refreshed</div>
      <div id="tel-last-updated" class="text-sm text-[var(--muted-body)]">-</div>
    </div>
  </div>

  <!-- Time-series charts -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
    <section class="surface rounded-xl p-5">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">DAU · last 30 days</h3>
        <span id="chart-dau-peak" class="text-xs text-[var(--muted-label)]">peak -</span>
      </div>
      <p class="text-xs text-[var(--muted-label)] mb-3">Unique installations sending a heartbeat per UTC day.</p>
      <svg id="chart-dau" viewBox="0 0 1000 200" preserveAspectRatio="none" class="w-full h-32 block"></svg>
      <div class="flex items-center justify-between text-[10px] text-[var(--muted-label)] mt-2">
        <span id="chart-dau-from">-</span>
        <span id="chart-dau-to">-</span>
      </div>
    </section>

    <section class="surface rounded-xl p-5">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">Heartbeats · last 30 days</h3>
        <span id="chart-hb-peak" class="text-xs text-[var(--muted-label)]">peak -</span>
      </div>
      <p class="text-xs text-[var(--muted-label)] mb-3">Total heartbeat pings ingested per UTC day.</p>
      <svg id="chart-hb" viewBox="0 0 1000 200" preserveAspectRatio="none" class="w-full h-32 block"></svg>
      <div class="flex items-center justify-between text-[10px] text-[var(--muted-label)] mt-2">
        <span id="chart-hb-from">-</span>
        <span id="chart-hb-to">-</span>
      </div>
    </section>
  </div>

  <!-- Version adoption stacked area -->
  <section class="surface rounded-xl p-5 mb-8">
    <div class="flex items-center justify-between mb-1">
      <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">Version adoption · last 30 days</h3>
      <span id="chart-version-buckets" class="text-xs text-[var(--muted-label)]">0 versions</span>
    </div>
    <p class="text-xs text-[var(--muted-label)] mb-3">Stacked share of heartbeats by app version per day. Newer versions appear at the bottom of the stack.</p>
    <svg id="chart-versions" viewBox="0 0 1000 220" preserveAspectRatio="none" class="w-full h-40 block"></svg>
    <div id="chart-versions-legend" class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs mt-3"></div>
    <div class="flex items-center justify-between text-[10px] text-[var(--muted-label)] mt-2">
      <span id="chart-versions-from">-</span>
      <span id="chart-versions-to">-</span>
    </div>
  </section>

  <!-- Today's distributions -->
  <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)] mb-4">Today's distributions</h3>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <section class="surface rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">Versions</h3>
        <span id="count-versions" class="text-xs text-[var(--muted-label)]">0</span>
      </div>
      <div id="dist-versions" class="space-y-2.5"></div>
    </section>

    <section class="surface rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">Operating Systems</h3>
        <span id="count-os" class="text-xs text-[var(--muted-label)]">0</span>
      </div>
      <div id="dist-os" class="space-y-2.5"></div>
    </section>

    <section class="surface rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm uppercase tracking-wider text-[var(--muted-body)]">Countries</h3>
        <span id="count-countries" class="text-xs text-[var(--muted-label)]">0</span>
      </div>
      <div id="dist-countries" class="space-y-2.5"></div>
    </section>
  </div>

  <!-- Raw payload (debug) -->
  <details class="mt-8 surface rounded-xl p-4">
    <summary class="text-xs uppercase tracking-wider text-[var(--muted-label)] cursor-pointer select-none hover:text-[var(--muted-body)]">Raw payload</summary>
    <pre id="raw-payload" class="mt-3 text-xs text-[var(--muted-body)] overflow-x-auto whitespace-pre-wrap break-words">-</pre>
  </details>
`;

let ctx: PanelCtx;
let livePoller: Poller | null = null;
let historyPoller: Poller | null = null;

// -- Status pill -------------------------------------------------------------
//
// Live+today and history are fetched by separate pollers on separate
// schedules, so each keeps its own last-failure list and the pill renders
// the union (mirrors overview.ts, which was fixed for the same all-or-nothing
// defect).

function setStatus(detail: string): void {
  const pill = $('tel-status');
  pill.style.color = 'var(--night-text-3)';
  pill.textContent = detail;
}

const lastFailures: Record<'live' | 'history', string[]> = { live: [], history: [] };

function describe(source: string, reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return `${source} ${msg}`;
}

function reportStatus(group: 'live' | 'history', failures: string[], anySuccess: boolean): void {
  lastFailures[group] = failures;
  const all = [...lastFailures.live, ...lastFailures.history];
  const pill = $('tel-status');
  const at = new Date().toLocaleTimeString();
  if (anySuccess) ctx.setRefreshed(at);
  pill.style.color = all.length > 0 ? '#FF453A' : 'var(--night-text)';
  pill.textContent = all.length > 0 ? `error: ${all.join(' · ')}` : `ok · ${at}`;
}

// -- Live + today ------------------------------------------------------------

function renderToday(data: TodayStats): void {
  if (!data || typeof data !== 'object') return;

  $('kpi-date').textContent = data.date || '-';
  $('kpi-dau').textContent = formatNumber(data.daily_active_users);
  $('kpi-hb').textContent = formatNumber(data.total_heartbeats_today);
  $('kpi-uc').textContent = formatNumber(data.total_update_checks_today);
  $('kpi-installs').textContent = formatNumber(data.total_installations);
  $('tel-last-updated').textContent = new Date().toLocaleString();

  // renderBar (the sink renderDistribution delegates to) escapes label and
  // subLabel itself, so the server-supplied values pass through as raw text.
  $('count-versions').textContent = String(
    renderDistribution($('dist-versions'), data.version_distribution, (v) => ({
      label: `v${v}`,
      sub: '',
    })),
  );
  $('count-os').textContent = String(
    renderDistribution($('dist-os'), data.os_distribution, (os) => ({
      label: `${osIcon(os)} ${osLabel(os)}`,
      sub: '',
    })),
  );
  $('count-countries').textContent = String(
    renderDistribution($('dist-countries'), data.country_distribution, (code) => ({
      label: `${countryFlag(code)} ${countryName(code)}`,
      sub: code,
    })),
  );

  $('raw-payload').textContent = JSON.stringify(data, null, 2);
}

function renderLive(data: LiveStats): void {
  if (!data || typeof data !== 'object') {
    $('kpi-active-now').textContent = '-';
    return;
  }
  const activeNow = formatNumber(data.active_now ?? 0);
  $('kpi-active-now').textContent = activeNow;
  ctx.setLive(activeNow);
  if (typeof data.window_seconds === 'number') {
    $('kpi-active-window').textContent = String(Math.round(data.window_seconds / 60));
  }
  $('kpi-active-versions').textContent = formatNumber(distinctCount(data.by_version));
  $('kpi-active-os').textContent = formatNumber(distinctCount(data.by_os));
  $('kpi-active-countries').textContent = formatNumber(distinctCount(data.by_country));
}

async function fetchLiveAndToday(): Promise<void> {
  setStatus('fetching…');
  const [statsR, liveR] = await Promise.allSettled([
    getJson<TodayStats>('/api/stats', ctx.onUnauthorized),
    getJson<LiveStats>('/api/stats-live', ctx.onUnauthorized),
  ]);
  const failures: string[] = [];

  if (statsR.status === 'fulfilled') {
    renderToday(statsR.value);
  } else {
    failures.push(describe('stats', statsR.reason));
  }

  if (liveR.status === 'fulfilled') {
    renderLive(liveR.value);
  } else {
    failures.push(describe('stats-live', liveR.reason));
  }

  // A failed poll keeps the last good render; only a cold panel (nothing
  // rendered yet) gets the error state painted into the distribution columns.
  if (failures.length > 0 && $('raw-payload').textContent === '-') {
    $('dist-versions').replaceChildren(errorState('Failed to load'));
    $('dist-os').replaceChildren(errorState('Failed to load'));
    $('dist-countries').replaceChildren(errorState('Failed to load'));
  }

  reportStatus('live', failures, failures.length < 2);
}

// -- History -----------------------------------------------------------------

async function fetchHistory(): Promise<void> {
  const base = '/api/stats-history';
  const [dauR, hbR, verR] = await Promise.allSettled([
    getJson<Series<LineAreaPoint>>(`${base}?metric=dau&days=${HISTORY_DAYS}`, ctx.onUnauthorized),
    getJson<Series<LineAreaPoint>>(`${base}?metric=heartbeats&days=${HISTORY_DAYS}`, ctx.onUnauthorized),
    getJson<Series<StackedAreaPoint>>(`${base}?metric=version&days=${HISTORY_DAYS}`, ctx.onUnauthorized),
  ]);
  const failures: string[] = [];
  let anySuccess = false;

  if (dauR.status === 'fulfilled') {
    const dauMeta = renderLineArea($('chart-dau') as unknown as SVGElement, dauR.value.series ?? [], '#0A84FF');
    $('chart-dau-peak').textContent = `peak ${formatNumber(dauMeta.max)}`;
    $('chart-dau-from').textContent = dauMeta.from;
    $('chart-dau-to').textContent = dauMeta.to;
    anySuccess = true;
  } else {
    failures.push(describe('stats-history dau', dauR.reason));
  }

  if (hbR.status === 'fulfilled') {
    const hbMeta = renderLineArea($('chart-hb') as unknown as SVGElement, hbR.value.series ?? [], '#7A5BFF');
    $('chart-hb-peak').textContent = `peak ${formatNumber(hbMeta.max)}`;
    $('chart-hb-from').textContent = hbMeta.from;
    $('chart-hb-to').textContent = hbMeta.to;
    anySuccess = true;
  } else {
    failures.push(describe('stats-history heartbeats', hbR.reason));
  }

  if (verR.status === 'fulfilled') {
    const verMeta = renderStackedArea(
      $('chart-versions') as unknown as SVGElement,
      $('chart-versions-legend'),
      verR.value.series ?? [],
    );
    const n = verMeta.buckets.length;
    $('chart-version-buckets').textContent = `${n} version${n === 1 ? '' : 's'}`;
    $('chart-versions-from').textContent = verMeta.from;
    $('chart-versions-to').textContent = verMeta.to;
    anySuccess = true;
  } else {
    failures.push(describe('stats-history version', verR.reason));
  }

  reportStatus('history', failures, anySuccess);
}

// -- Panel contract ----------------------------------------------------------

export function mount(root: HTMLElement, panelCtx: PanelCtx): void {
  ctx = panelCtx;
  root.innerHTML = MARKUP;
  livePoller = createPoller(fetchLiveAndToday, LIVE_POLL_MS);
  historyPoller = createPoller(fetchHistory, HISTORY_POLL_MS);
}

export function activate(): void {
  livePoller?.start();
  historyPoller?.start();
}

export function deactivate(): void {
  livePoller?.stop();
  historyPoller?.stop();
}

export function refresh(): void {
  livePoller?.now();
  historyPoller?.now();
}
