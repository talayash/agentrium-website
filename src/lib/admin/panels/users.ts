// Users panel: the signed-in account list from the auth broker, with a
// keyset-paged table and a per-user detail aside.
//
// Names, emails and profile/agent/workspace names are user-controlled, so
// every cell is built with el/text and never with innerHTML.

import { $, clear, el, text } from '../dom';
import { formatNumber, initials, osLabel, timeAgo } from '../format';
import { getJson } from '../session';
import type { PanelCtx } from './types';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export interface UserItem {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string | null;
  created_at: string;
  last_seen_at: string | null;
  devices: number;
  app_version: string | null;
  os: string | null;
  profiles: number;
  custom_agents: number;
  workspaces: number;
}

interface UsersPage {
  total?: number;
  items?: UserItem[];
  next_cursor?: string | null;
}

interface AccountLink {
  provider: string;
  provider_account_id_tail: string | null;
}

interface DeviceRow {
  id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  client_info: { app_version?: string | null; os?: string | null; installation_id?: string | null } | null;
}

interface SyncRow {
  id: string;
  name: string;
  agent?: string | null;
  binary?: string | null;
  terminals?: number | null;
  updated_at: string;
  deleted_at: string | null;
}

interface UserDetail {
  user: UserItem;
  accounts?: AccountLink[];
  devices?: DeviceRow[];
  sync?: {
    profiles?: SyncRow[];
    custom_agents?: SyncRow[];
    workspaces?: SyncRow[];
  };
}

const MARKUP = `
<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
  <h2 class="admin-h2">Users <span id="users-total" class="text-sm font-normal text-[var(--night-text-3)]"></span></h2>
  <div class="flex items-center gap-2">
    <input id="users-q" type="search" placeholder="Search email or name" class="admin-input w-64" />
    <span id="users-status" class="admin-pill">loading…</span>
  </div>
</div>
<div class="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
  <div class="admin-card overflow-x-auto">
    <table class="admin-table">
      <thead><tr>
        <th>User</th><th>Provider</th><th>Signed up</th><th>Last seen</th><th class="num">Devices</th>
        <th>App</th><th>OS</th><th class="num">Profiles</th><th class="num">Workspaces</th>
      </tr></thead>
      <tbody id="users-rows"></tbody>
    </table>
    <div class="p-3 text-center"><button id="users-more" type="button" class="admin-btn" hidden>Load more</button></div>
    <div id="users-empty" class="p-8 text-center text-[var(--night-text-2)]" hidden>No users match.</div>
  </div>
  <aside id="user-detail" class="admin-card p-5 self-start" hidden></aside>
</div>
`;

let ctx: PanelCtx;
let query = '';
let cursor: string | null = null;
let loadedOnce = false;
let searchTimer: number | null = null;

// -- Shared bits -------------------------------------------------------------

function setStatus(detail: string, isError = false): void {
  const pill = $('users-status');
  pill.style.color = isError ? '#FF453A' : 'var(--night-text-2)';
  pill.textContent = detail;
}

export function providerLabel(provider: string | null | undefined): string {
  switch (String(provider ?? '').toLowerCase()) {
    case 'google':
      return 'Google';
    case 'github':
      return 'GitHub';
    case 'email':
      return 'Email';
    default:
      return provider ? String(provider) : '-';
  }
}

function absolute(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString();
}

function avatar(item: UserItem, size = 'w-7 h-7 text-[11px]'): HTMLElement {
  return text(
    'span',
    `inline-flex items-center justify-center ${size} rounded-full bg-[var(--night-3)] text-[var(--night-text)] font-semibold shrink-0`,
    initials(item.name || item.email),
  );
}

function pill(label: string): HTMLElement {
  return text(
    'span',
    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--night-2)] text-[var(--night-text-2)]',
    label,
  );
}

function timeCell(iso: string | null | undefined, fallback: string): HTMLElement {
  const td = el('td', '');
  const span = text('span', '', iso ? timeAgo(iso) : fallback);
  const abs = absolute(iso);
  if (abs) span.title = abs;
  td.appendChild(span);
  return td;
}

/**
 * One table row for a user. Overview reuses this for its "recent accounts"
 * table, which has no OS column, hence `columns.os`.
 */
export function buildUserRow(
  item: UserItem,
  onSelect?: (item: UserItem, row: HTMLTableRowElement) => void,
  columns: { os?: boolean } = {},
): HTMLTableRowElement {
  const showOs = columns.os !== false;
  const tr = el('tr', onSelect ? 'is-clickable' : '') as HTMLTableRowElement;
  tr.dataset.userId = item.id;

  const who = el('td', '');
  const wrap = el('div', 'flex items-center gap-2.5');
  wrap.appendChild(avatar(item));
  const stack = el('div', 'min-w-0');
  const email = text('div', 'text-[var(--night-text)] truncate', item.email);
  email.title = item.id;
  stack.appendChild(email);
  if (item.name) stack.appendChild(text('div', 'text-xs text-[var(--night-text-3)] truncate', item.name));
  wrap.appendChild(stack);
  who.appendChild(wrap);
  tr.appendChild(who);

  const prov = el('td', '');
  prov.appendChild(pill(providerLabel(item.provider)));
  tr.appendChild(prov);

  tr.appendChild(timeCell(item.created_at, '-'));
  tr.appendChild(timeCell(item.last_seen_at, 'never'));
  tr.appendChild(text('td', 'num', formatNumber(item.devices)));
  tr.appendChild(text('td', '', item.app_version ?? '-'));
  if (showOs) tr.appendChild(text('td', '', item.os ? osLabel(item.os) : '-'));
  tr.appendChild(text('td', 'num', formatNumber(item.profiles)));
  tr.appendChild(text('td', 'num', formatNumber(item.workspaces)));

  if (onSelect) {
    tr.addEventListener('click', () => onSelect(item, tr));
  }
  return tr;
}

// -- Detail aside ------------------------------------------------------------

function syncList(title: string, rows: SyncRow[] | undefined, line: (row: SyncRow) => string): HTMLElement {
  const section = el('section', 'mt-5');
  section.appendChild(text('h4', 'admin-h3', title));
  const list = el('ul', 'space-y-1.5');
  const items = rows ?? [];
  if (items.length === 0) {
    list.appendChild(text('li', 'text-xs text-[var(--night-text-3)]', 'none'));
  }
  for (const row of items) {
    const li = el('li', `text-xs text-[var(--night-text-2)] ${row.deleted_at ? 'line-through opacity-60' : ''}`);
    li.appendChild(text('span', 'text-[var(--night-text)]', row.name || '(unnamed)'));
    li.appendChild(text('span', 'ml-2 text-[var(--night-text-3)]', line(row)));
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function renderDetail(detail: UserDetail): void {
  const aside = $('user-detail');
  clear(aside);
  aside.hidden = false;

  const user = detail.user;

  const head = el('div', 'flex items-center gap-3');
  head.appendChild(avatar(user, 'w-10 h-10 text-sm'));
  const idBlock = el('div', 'min-w-0');
  idBlock.appendChild(text('div', 'font-semibold text-[var(--night-text)] truncate', user.name || user.email));
  idBlock.appendChild(text('div', 'text-xs text-[var(--night-text-3)] truncate', user.email));
  head.appendChild(idBlock);
  aside.appendChild(head);

  const providers = el('div', 'flex flex-wrap gap-1.5 mt-3');
  const accounts = detail.accounts ?? [];
  if (accounts.length === 0) {
    providers.appendChild(pill(providerLabel(user.provider)));
  }
  for (const account of accounts) {
    const tail = account.provider_account_id_tail;
    providers.appendChild(pill(tail ? `${providerLabel(account.provider)} ${tail}` : providerLabel(account.provider)));
  }
  aside.appendChild(providers);

  const devices = el('section', 'mt-5');
  devices.appendChild(text('h4', 'admin-h3', 'Devices'));
  const deviceRows = detail.devices ?? [];
  if (deviceRows.length === 0) {
    devices.appendChild(text('div', 'text-xs text-[var(--night-text-3)]', 'none'));
  }
  for (const device of deviceRows) {
    const row = el('div', 'text-xs text-[var(--night-text-2)] py-1.5 border-b border-[var(--night-seam)]');
    const top = el('div', 'flex flex-wrap items-center gap-2');
    top.appendChild(text('span', 'text-[var(--night-text)]', timeAgo(device.created_at)));
    // Revocation is decided by revoked_at: a revoked token may carry no reason,
    // and such a device must not read as active.
    const revoked = device.revoked_at != null;
    top.appendChild(
      text(
        'span',
        revoked ? 'text-[#FF453A]' : 'text-[#30D158]',
        revoked ? (device.revoked_reason ?? 'revoked') : 'active',
      ),
    );
    row.appendChild(top);
    const meta = el('div', 'flex flex-wrap gap-x-3 text-[var(--night-text-3)] mt-0.5');
    const info = device.client_info ?? {};
    if (device.expires_at) {
      // timeAgo clamps to zero for future instants, so expiry shows as a date.
      const t = Date.parse(device.expires_at);
      if (!Number.isNaN(t)) {
        const expires = text('span', '', `expires ${new Date(t).toLocaleDateString()}`);
        expires.title = new Date(t).toLocaleString();
        meta.appendChild(expires);
      }
    }
    meta.appendChild(text('span', '', info.app_version ? `v${info.app_version}` : 'v-'));
    meta.appendChild(text('span', '', info.os ? osLabel(info.os) : '-'));
    meta.appendChild(text('span', '', info.installation_id ? info.installation_id.slice(0, 8) : '-'));
    row.appendChild(meta);
    devices.appendChild(row);
  }
  aside.appendChild(devices);

  const sync = detail.sync ?? {};
  aside.appendChild(
    syncList('Profiles', sync.profiles, (row) => `${row.agent ?? '-'} · ${timeAgo(row.updated_at)}`),
  );
  aside.appendChild(
    syncList('Custom agents', sync.custom_agents, (row) => `${row.binary ?? '-'} · ${timeAgo(row.updated_at)}`),
  );
  aside.appendChild(
    syncList(
      'Workspaces',
      sync.workspaces,
      (row) => `${formatNumber(row.terminals ?? 0)} terminals · ${timeAgo(row.updated_at)}`,
    ),
  );
}

async function selectUser(item: UserItem, row: HTMLTableRowElement): Promise<void> {
  for (const other of Array.from($('users-rows').querySelectorAll('tr'))) {
    other.classList.toggle('is-selected', other === row);
  }
  try {
    const detail = await getJson<UserDetail>(
      `/api/admin-user?id=${encodeURIComponent(item.id)}`,
      ctx.onUnauthorized,
    );
    renderDetail(detail);
  } catch (err) {
    // Never leave the previous user's detail showing next to a different
    // selected row: the aside reports the failure instead.
    const msg = err instanceof Error ? err.message : String(err);
    const aside = $('user-detail');
    clear(aside);
    aside.hidden = false;
    aside.appendChild(text('div', 'text-sm text-[#FF453A]', `error: ${msg}`));
    aside.appendChild(text('div', 'text-xs text-[var(--night-text-3)] mt-1', item.email));
    setStatus(`error: ${msg}`, true);
  }
}

// -- List --------------------------------------------------------------------

async function load(append: boolean): Promise<void> {
  setStatus('loading…');
  const url = new URL('/api/admin-users', window.location.origin);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (query) url.searchParams.set('q', query);
  if (append && cursor) url.searchParams.set('cursor', cursor);

  try {
    const data = await getJson<UsersPage>(url.toString(), ctx.onUnauthorized);
    const rows = $('users-rows');
    if (!append) {
      clear(rows);
      $('user-detail').hidden = true;
    }
    const items = data.items ?? [];
    for (const item of items) {
      rows.appendChild(
        buildUserRow(item, (selected, row) => {
          void selectUser(selected, row);
        }),
      );
    }
    cursor = data.next_cursor ?? null;
    ($('users-more') as HTMLButtonElement).hidden = cursor === null;
    const empty = $('users-empty');
    empty.textContent = 'No users match.';
    empty.hidden = rows.childElementCount > 0;
    $('users-total').textContent = typeof data.total === 'number' ? `· ${formatNumber(data.total)}` : '';
    const at = new Date().toLocaleTimeString();
    setStatus(`ok · ${at}`);
    ctx.setRefreshed(at);
    loadedOnce = true;
  } catch (err) {
    // The pill always lands on the failure, and an empty table says why rather
    // than sitting blank. Rows already on screen are kept.
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`error: ${msg}`, true);
    ($('users-more') as HTMLButtonElement).hidden = true;
    if ($('users-rows').childElementCount === 0) {
      const empty = $('users-empty');
      empty.textContent = `Could not load users: ${msg}`;
      empty.hidden = false;
    }
  }
}

// -- Panel contract ----------------------------------------------------------

export function mount(root: HTMLElement, panelCtx: PanelCtx): void {
  ctx = panelCtx;
  root.innerHTML = MARKUP;

  $('users-q').addEventListener('input', (event) => {
    query = (event.target as HTMLInputElement).value.trim();
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      cursor = null;
      void load(false);
    }, SEARCH_DEBOUNCE_MS);
  });

  $('users-more').addEventListener('click', () => {
    void load(true);
  });
}

export function activate(): void {
  if (!loadedOnce) void load(false);
}

export function deactivate(): void {
  // No poller: the list is only refreshed on demand. The search debounce
  // timer is the one thing still armed on a tab switch, so clear it here -
  // otherwise it fires after the user has left, fetching and repainting a
  // hidden panel and overwriting the shared refreshed pill.
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
    searchTimer = null;
  }
}

export function refresh(): void {
  cursor = null;
  void load(false);
}
