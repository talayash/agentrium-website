// Inbox panel: the body of the old /inbox page, moved into the dashboard.
//
// The card builders are unchanged - every user-controlled field still goes
// through textContent, so a message containing markup renders as literal
// text. The page's own refresh button is gone because the shell has one, and
// the ids are prefixed so they cannot collide with the telemetry panel's.

import { clear, el, text, $ } from '../dom';
import { timeAgo } from '../format';
import { getJson } from '../session';
import { createPoller, type Poller } from '../poll';
import type { PanelCtx } from './types';

const ENDPOINTS = {
  list: '/api/feedback-list',
  markRead: '/api/feedback-mark-read',
};
const POLL_MS = 60_000;

interface FeedbackItem {
  id: number | string;
  name: string;
  message: string;
  ts: string;
  app_version: string;
  os: string;
  country: string;
  read_at: string | null;
}

interface FeedbackList {
  total?: number;
  unread?: number;
  items?: FeedbackItem[];
}

const MARKUP = `
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <h2 class="admin-h2">Inbox</h2>
    <div class="flex items-center gap-3">
      <label class="text-xs text-[var(--muted-body)] flex items-center gap-1.5 select-none">
        <input id="inbox-filter-unread" type="checkbox" class="accent-[var(--coral)]" />
        unread only
      </label>
      <span id="inbox-status" class="admin-pill">loading…</span>
    </div>
  </div>

  <div class="grid grid-cols-3 gap-4 mb-6">
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Total</div>
      <div id="inbox-total" class="text-3xl font-bold text-[var(--ink)] tabular-nums">-</div>
    </div>
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Unread</div>
      <div id="inbox-unread" class="text-3xl font-bold text-[var(--coral)] tabular-nums">-</div>
    </div>
    <div class="surface rounded-xl p-5">
      <div class="text-xs uppercase tracking-wider text-[var(--muted-label)] mb-2">Last Refreshed</div>
      <div id="inbox-last-updated" class="text-sm text-[var(--muted-body)]">-</div>
    </div>
  </div>

  <ul id="inbox-messages" class="space-y-3"></ul>

  <div id="inbox-empty" class="hidden surface rounded-xl p-8 text-center text-[var(--muted-body)]">
    No messages yet. Send one from Agentrium's Contact button to see it here.
  </div>
`;

let ctx: PanelCtx;
let poller: Poller | null = null;

async function markRead(ids: Array<number | string>): Promise<void> {
  await fetch(ENDPOINTS.markRead, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
    credentials: 'include',
  });
}

function buildCard(item: FeedbackItem): HTMLElement {
  const unread = item.read_at === null;
  const li = el('li', `surface rounded-xl p-5 ${unread ? 'border-l-4 border-[var(--coral)]' : ''}`);

  const header = el('div', 'flex items-start justify-between gap-4 mb-2');
  const headerLeft = el('div', '');

  const nameRow = el('div', 'flex items-center gap-2 mb-1');
  nameRow.appendChild(text('span', 'font-semibold text-[var(--ink)]', item.name));
  if (unread) {
    nameRow.appendChild(
      text(
        'span',
        'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--coral)]/20 text-[var(--coral)]',
        'new',
      ),
    );
  }
  headerLeft.appendChild(nameRow);

  const meta = el('div', 'text-xs text-[var(--muted-label)] flex flex-wrap gap-x-3 gap-y-1');
  meta.appendChild(text('span', '', timeAgo(item.ts)));
  meta.appendChild(text('span', '', `v${item.app_version}`));
  meta.appendChild(text('span', '', item.os));
  meta.appendChild(text('span', '', item.country));
  headerLeft.appendChild(meta);

  header.appendChild(headerLeft);

  if (unread) {
    const btn = text(
      'button',
      'text-xs px-2 py-1 rounded bg-[var(--coral)]/10 hover:bg-[var(--coral)]/20 text-[var(--coral)] border border-[var(--coral)]/30',
      'mark read',
    );
    btn.addEventListener('click', () => {
      void (async () => {
        await markRead([item.id]);
        await load();
      })();
    });
    header.appendChild(btn);
  }
  li.appendChild(header);

  li.appendChild(
    text('p', 'text-[var(--ink)] text-sm whitespace-pre-wrap leading-relaxed', item.message),
  );
  return li;
}

function render(items: FeedbackItem[]): void {
  // Empty then re-append; simpler than diffing for the volume we expect.
  const messagesEl = $('inbox-messages');
  const emptyEl = $('inbox-empty');
  clear(messagesEl);
  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  for (const item of items) messagesEl.appendChild(buildCard(item));
}

async function load(): Promise<void> {
  const statusPill = $('inbox-status');
  statusPill.textContent = 'loading…';
  const unreadOnly = $('inbox-filter-unread') as HTMLInputElement;
  const url = new URL(ENDPOINTS.list, window.location.origin);
  if (unreadOnly.checked) url.searchParams.set('unread_only', '1');
  url.searchParams.set('limit', '200');
  try {
    const data = await getJson<FeedbackList>(url.toString(), ctx.onUnauthorized);
    $('inbox-total').textContent = String(data.total ?? '-');
    $('inbox-unread').textContent = String(data.unread ?? '-');
    const at = new Date().toLocaleTimeString();
    $('inbox-last-updated').textContent = at;
    render(data.items ?? []);
    statusPill.textContent = `${data.items?.length ?? 0} shown`;
    ctx.setBadge('inbox', data.unread ?? 0);
    ctx.setRefreshed(at);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    statusPill.textContent = `error: ${msg}`;
  }
}

// -- Panel contract ----------------------------------------------------------

export function mount(root: HTMLElement, panelCtx: PanelCtx): void {
  ctx = panelCtx;
  root.innerHTML = MARKUP;
  $('inbox-filter-unread').addEventListener('change', () => {
    void load();
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
 * Keeps the Inbox tab badge current regardless of which tab is showing.
 * Returns the poller so the page can stop it when the session expires.
 */
export function pollBadge(ctx2: PanelCtx): Poller {
  const tick = async (): Promise<void> => {
    try {
      const d = await getJson<{ unread: number }>(
        '/api/feedback-list?limit=1&unread_only=1',
        ctx2.onUnauthorized,
      );
      ctx2.setBadge('inbox', d.unread ?? 0);
    } catch {
      // Badge is best-effort; the Inbox tab itself reports load errors.
    }
  };
  const badgePoller = createPoller(tick, 60_000);
  badgePoller.start();
  return badgePoller;
}
