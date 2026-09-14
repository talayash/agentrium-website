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
  <div class="overflow-x-auto"><table class="admin-table"><thead><tr><th>User</th><th>Provider</th><th>Signed up</th><th>Last seen</th><th class="num">Devices</th><th>App</th><th class="num">Profiles</th><th class="num">Workspaces</th></tr></thead><tbody id="ov-recent"></tbody></table></div>
</section>
<span id="ov-status" class="admin-pill mt-4 inline-block">loading…</span>
`;

let ctx: PanelCtx;
let livePoller: Poller | null = null;
let summaryPoller: Poller | null = null;

function setStatus(detail: string, isError = false): void {
  const pill = $('ov-status');
  pill.style.color = isError ? '#FF453A' : 'var(--night-text-2)';
  pill.textContent = detail;
}

async function fetchLive(): Promise<void> {
  try {
    const [stats, live] = await Promise.all([
      getJson<TodayStats>('/api/stats', ctx.onUnauthorized),
      getJson<LiveStats>('/api/stats-live', ctx.onUnauthorized),
    ]);

    const activeNow = formatNumber(live.active_now ?? 0);
    $('ov-active').textContent = activeNow;
    ctx.setLive(activeNow);
    $('ov-active-dims').textContent =
      `${distinctCount(live.by_version)} versions · ${distinctCount(live.by_os)} OS · ` +
      `${distinctCount(live.by_country)} countries`;

    $('ov-dau').textContent = formatNumber(stats.daily_active_users ?? 0);
    $('ov-installs').textContent = formatNumber(stats.total_installations ?? 0);

    const at = new Date().toLocaleTimeString();
    setStatus(`ok · ${at}`);
    ctx.setRefreshed(at);
  } catch (err) {
    // A failed poll keeps the last good render.
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`error: ${msg}`, true);
  }
}

async function fetchSummary(): Promise<void> {
  try {
    const [summary, dau, errors, recent] = await Promise.all([
      getJson<AdminSummary>('/api/admin-summary', ctx.onUnauthorized),
      getJson<{ series?: LineAreaPoint[] }>('/api/stats-history?metric=dau&days=30', ctx.onUnauthorized),
      getJson<ErrorsTotals>('/api/errors-summary?days=7&limit=1', ctx.onUnauthorized),
      getJson<{ items?: UserItem[] }>('/api/admin-users?limit=10', ctx.onUnauthorized),
    ]);

    const users = summary.users ?? {};
    $('ov-accounts').textContent = formatNumber(users.total ?? 0);
    $('ov-accounts-7d').textContent = `+${formatNumber(users.last_7d ?? 0)} in 7 days`;

    const signedIn = summary.signed_in;
    $('ov-active-signed').textContent = signedIn ? formatNumber(signedIn.active_now) : 'n/a';
    $('ov-dau-signed').textContent = signedIn
      ? `${formatNumber(signedIn.active_today)} signed in`
      : 'signed in: n/a';

    $('ov-errors').textContent = formatNumber(errors.total_errors ?? 0);
    $('ov-errors-sub').textContent = `${formatNumber(errors.affected_installations ?? 0)} installations`;

    const dauMeta = renderLineArea($('ov-chart-dau') as unknown as SVGElement, dau.series ?? [], '#0A84FF');
    $('ov-dau-peak').textContent = `peak ${formatNumber(dauMeta.max)}`;
    $('ov-dau-from').textContent = dauMeta.from;
    $('ov-dau-to').textContent = dauMeta.to;

    const signups = (summary.signups_by_day ?? []).map((d) => ({ date: d.date, value: d.count }));
    renderBars($('ov-chart-signups') as unknown as SVGElement, signups, '#7A5BFF');
    $('ov-signups-from').textContent = signups[0]?.date ?? '';
    $('ov-signups-to').textContent = signups[signups.length - 1]?.date ?? '';
    const byProvider = users.by_provider ?? {};
    $('ov-signups-providers').textContent =
      `Google ${formatNumber(byProvider.google ?? 0)} · GitHub ${formatNumber(byProvider.github ?? 0)} · ` +
      `Email ${formatNumber(byProvider.email ?? 0)}`;

    const tbody = $('ov-recent');
    clear(tbody);
    for (const item of recent.items ?? []) {
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

    const at = new Date().toLocaleTimeString();
    setStatus(`ok · ${at}`);
    ctx.setRefreshed(at);
  } catch (err) {
    // A failed poll keeps the last good render.
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`error: ${msg}`, true);
  }
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
