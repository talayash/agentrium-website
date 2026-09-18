// Overview panel: the at-a-glance tab. Merges the anonymous telemetry
// (installations, DAU) with the auth broker's account numbers and the error
// totals, and lists the ten newest accounts.

import { $, clear } from '../dom';
import { distinctCount, formatNumber } from '../format';
import { renderBars, renderLineArea, type LineAreaPoint } from '../charts';
import { getJson } from '../session';
import { createPoller, type Poller } from '../poll';
import { buildUserRow, type UserItem } from './users';
import type { PanelCtx } from './types';

const LIVE_POLL_MS = 15_000;
const SUMMARY_POLL_MS = 5 * 60_000;

interface TodayStats {
  daily_active_users?: number;
  total_installations?: number;
}

interface LiveStats {
  active_now?: number;
  by_version?: Record<string, number>;
  by_os?: Record<string, number>;
  by_country?: Record<string, number>;
}

interface AdminSummary {
  users?: { total?: number; last_7d?: number; last_30d?: number; by_provider?: Record<string, number> };
  signups_by_day?: Array<{ date: string; count: number }>;
  signed_in?: { active_today: number; active_now: number } | null;
}

interface ErrorsTotals {
  total_errors?: number;
  affected_installations?: number;
}

const MARKUP = `
<div class="admin-card p-5 mb-6 admin-hero">
  <div class="flex flex-wrap items-end justify-between gap-6">
    <div>
      <div class="admin-label">Active now</div>
      <div class="flex items-baseline gap-2">
        <span id="ov-active" class="admin-big text-4xl text-[var(--accent)]">-</span>
        <span class="text-xs text-[var(--night-text-3)]">in last 15 min · <span id="ov-active-signed">-</span> signed in</span>
      </div>
      <div id="ov-active-dims" class="text-xs text-[var(--night-text-2)] mt-1">-</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-6 text-right">
      <div><div class="admin-label">Active today</div><div id="ov-dau" class="admin-big">-</div><div id="ov-dau-signed" class="text-xs text-[var(--night-text-3)]">-</div></div>
      <div><div class="admin-label">Installations</div><div id="ov-installs" class="admin-big">-</div></div>
      <div><div class="admin-label">Accounts</div><div id="ov-accounts" class="admin-big">-</div><div id="ov-accounts-7d" class="text-xs text-[var(--night-text-3)]">-</div></div>
      <div><div class="admin-label">Errors · 7d</div><div id="ov-errors" class="admin-big text-[#FF453A]">-</div><div id="ov-errors-sub" class="text-xs text-[var(--night-text-3)]">-</div></div>
    </div>
  </div>
</div>
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
  <section class="admin-card p-5">
    <div class="flex items-center justify-between mb-1"><h3 class="admin-h3">DAU · last 30 days</h3><span id="ov-dau-peak" class="text-xs text-[var(--night-text-3)]">peak -</span></div>
    <svg id="ov-chart-dau" viewBox="0 0 1000 200" preserveAspectRatio="none" class="w-full h-32 block"></svg>
    <div class="flex justify-between text-[10px] text-[var(--night-text-3)] mt-2"><span id="ov-dau-from">-</span><span id="ov-dau-to">-</span></div>
  </section>
  <section class="admin-card p-5">
    <div class="flex items-center justify-between mb-1"><h3 class="admin-h3">Signups · last 90 days</h3><span id="ov-signups-providers" class="text-xs text-[var(--night-text-3)]">-</span></div>
    <svg id="ov-chart-signups" viewBox="0 0 1000 200" preserveAspectRatio="none" class="w-full h-32 block"></svg>
    <div class="flex justify-between text-[10px] text-[var(--night-text-3)] mt-2"><span id="ov-signups-from">-</span><span id="ov-signups-to">-</span></div>
  </section>
</div>
<section class="admin-card">
  <div class="flex items-center justify-between p-5 pb-3"><h3 class="admin-h3 mb-0">Recent accounts</h3><a href="#users" class="text-xs text-[var(--accent)]">See all</a></div>
  <div class="admin-scroll"><table class="admin-table admin-table-sticky"><thead><tr><th>User</th><th>Provider</th><th>Signed up</th><th>Last seen</th><th class="num">Devices</th><th>App</th><th class="num">Profiles</th><th class="num">Workspaces</th></tr></thead><tbody id="ov-recent"></tbody></table></div>
</section>
<span id="ov-status" class="admin-pill mt-4 inline-block">loading…</span>
`;

let ctx: PanelCtx;
let livePoller: Poller | null = null;
let summaryPoller: Poller | null = null;

// Each source renders on its own, so one endpoint failing degrades only the
// tiles it feeds (spec section 9). Both pollers write the one status pill, so
// their failures are kept apart and rendered as a union rather than
// overwriting each other.
const lastFailures: Record<'live' | 'summary', string[]> = { live: [], summary: [] };

function describe(source: string, reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return `${source} ${msg}`;
}

function reportStatus(group: 'live' | 'summary', failures: string[], anySuccess: boolean): void {
  lastFailures[group] = failures;
  const all = [...lastFailures.live, ...lastFailures.summary];
  const pill = $('ov-status');
  const at = new Date().toLocaleTimeString();
  if (anySuccess) ctx.setRefreshed(at);
  pill.style.color = all.length > 0 ? '#FF453A' : 'var(--night-text-2)';
  pill.textContent = all.length > 0 ? `error: ${all.join(' · ')}` : `ok · ${at}`;
}

function renderSignedIn(signedIn: { active_today: number; active_now: number } | null | undefined): void {
  $('ov-active-signed').textContent = signedIn ? formatNumber(signedIn.active_now) : 'n/a';
  $('ov-dau-signed').textContent = signedIn
    ? `${formatNumber(signedIn.active_today)} signed in`
    : 'signed in: n/a';
}

async function fetchLive(): Promise<void> {
  const [statsR, liveR] = await Promise.allSettled([
    getJson<TodayStats>('/api/stats', ctx.onUnauthorized),
    getJson<LiveStats>('/api/stats-live', ctx.onUnauthorized),
  ]);
  const failures: string[] = [];

  if (liveR.status === 'fulfilled') {
    const live = liveR.value;
    const activeNow = formatNumber(live.active_now ?? 0);
    $('ov-active').textContent = activeNow;
    ctx.setLive(activeNow);
    $('ov-active-dims').textContent =
      `${distinctCount(live.by_version)} versions · ${distinctCount(live.by_os)} OS · ` +
      `${distinctCount(live.by_country)} countries`;
  } else {
    failures.push(describe('stats-live', liveR.reason));
  }

  if (statsR.status === 'fulfilled') {
    $('ov-dau').textContent = formatNumber(statsR.value.daily_active_users ?? 0);
    $('ov-installs').textContent = formatNumber(statsR.value.total_installations ?? 0);
  } else {
    failures.push(describe('stats', statsR.reason));
  }

  reportStatus('live', failures, failures.length < 2);
}

async function fetchSummary(): Promise<void> {
  const [summaryR, dauR, errorsR, recentR] = await Promise.allSettled([
    getJson<AdminSummary>('/api/admin-summary', ctx.onUnauthorized),
    getJson<{ series?: LineAreaPoint[] }>('/api/stats-history?metric=dau&days=30', ctx.onUnauthorized),
    getJson<ErrorsTotals>('/api/errors-summary?days=7&limit=1', ctx.onUnauthorized),
    getJson<{ items?: UserItem[] }>('/api/admin-users?limit=10', ctx.onUnauthorized),
  ]);
  const failures: string[] = [];

  if (summaryR.status === 'fulfilled') {
    const summary = summaryR.value;
    const users = summary.users ?? {};
    $('ov-accounts').textContent = formatNumber(users.total ?? 0);
    $('ov-accounts-7d').textContent = `+${formatNumber(users.last_7d ?? 0)} in 7 days`;
    renderSignedIn(summary.signed_in);

    const signups = (summary.signups_by_day ?? []).map((d) => ({ date: d.date, value: d.count }));
    renderBars($('ov-chart-signups') as unknown as SVGElement, signups, '#7A5BFF');
    $('ov-signups-from').textContent = signups[0]?.date ?? '';
    $('ov-signups-to').textContent = signups[signups.length - 1]?.date ?? '';
    const byProvider = users.by_provider ?? {};
    $('ov-signups-providers').textContent =
      `Google ${formatNumber(byProvider.google ?? 0)} · GitHub ${formatNumber(byProvider.github ?? 0)} · ` +
      `Email ${formatNumber(byProvider.email ?? 0)}`;
  } else {
    // The broker is the only source of the signed-in split, so it reads n/a
    // rather than a stale or blank number.
    renderSignedIn(null);
    failures.push(describe('admin-summary', summaryR.reason));
  }

  if (dauR.status === 'fulfilled') {
    const dauMeta = renderLineArea(
      $('ov-chart-dau') as unknown as SVGElement,
      dauR.value.series ?? [],
      '#0A84FF',
    );
    $('ov-dau-peak').textContent = `peak ${formatNumber(dauMeta.max)}`;
    $('ov-dau-from').textContent = dauMeta.from;
    $('ov-dau-to').textContent = dauMeta.to;
  } else {
    failures.push(describe('stats-history', dauR.reason));
  }

  if (errorsR.status === 'fulfilled') {
    $('ov-errors').textContent = formatNumber(errorsR.value.total_errors ?? 0);
    $('ov-errors-sub').textContent = `${formatNumber(errorsR.value.affected_installations ?? 0)} installations`;
  } else {
    failures.push(describe('errors-summary', errorsR.reason));
  }

  if (recentR.status === 'fulfilled') {
    const tbody = $('ov-recent');
    clear(tbody);
    for (const item of recentR.value.items ?? []) {
      tbody.appendChild(
        buildUserRow(
          item,
          () => {
            location.hash = '#users';
          },
          { os: false },
        ),
      );
    }
  } else {
    failures.push(describe('admin-users', recentR.reason));
  }

  reportStatus('summary', failures, failures.length < 4);
}

// -- Panel contract ----------------------------------------------------------

export function mount(root: HTMLElement, panelCtx: PanelCtx): void {
  ctx = panelCtx;
  root.innerHTML = MARKUP;
  livePoller = createPoller(fetchLive, LIVE_POLL_MS);
  summaryPoller = createPoller(fetchSummary, SUMMARY_POLL_MS);
}

export function activate(): void {
  livePoller?.start();
  summaryPoller?.start();
}

export function deactivate(): void {
  livePoller?.stop();
  summaryPoller?.stop();
}

export function refresh(): void {
  livePoller?.now();
  summaryPoller?.now();
}
