// Sort state for the Users table header.
//
// Kept separate from the panel so the click behaviour can be tested without a
// DOM. The keys mirror SORT_KEYS in agentrium-api's src/lib/admin-sort.ts and
// the allowlist in api/admin-users.js; all three have to agree.

export type SortKey =
  | 'created'
  | 'last_seen'
  | 'email'
  | 'name'
  | 'provider'
  | 'devices'
  | 'app_version'
  | 'os'
  | 'profiles'
  | 'workspaces';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  sort: SortKey;
  dir: SortDir;
}

export interface UserColumn {
  label: string;
  sort: SortKey;
  /** Right-aligned tabular column. */
  numeric?: boolean;
}

/**
 * The header row, in render order. The "User" cell shows email and name
 * together but sorts by email, which is the field people actually scan.
 */
export const USER_COLUMNS: UserColumn[] = [
  { label: 'User', sort: 'email' },
  { label: 'Provider', sort: 'provider' },
  { label: 'Signed up', sort: 'created' },
  { label: 'Last seen', sort: 'last_seen' },
  { label: 'Devices', sort: 'devices', numeric: true },
  { label: 'App', sort: 'app_version' },
  { label: 'OS', sort: 'os' },
  { label: 'Profiles', sort: 'profiles', numeric: true },
  { label: 'Workspaces', sort: 'workspaces', numeric: true },
];

/**
 * Where a column starts when it is first clicked. Dates and counts open
 * descending because the interesting row (most recent, most devices) belongs
 * at the top; text opens ascending because A-Z is what a name column implies.
 */
export const DEFAULT_DIR_FOR: Record<SortKey, SortDir> = {
  created: 'desc',
  last_seen: 'desc',
  devices: 'desc',
  profiles: 'desc',
  workspaces: 'desc',
  email: 'asc',
  name: 'asc',
  provider: 'asc',
  app_version: 'asc',
  os: 'asc',
};

export const DEFAULT_SORT_STATE: SortState = { sort: 'created', dir: 'desc' };

/** Clicking the active column flips it; clicking another opens it at its default. */
export function nextSortState(current: SortState, clicked: SortKey): SortState {
  if (current.sort === clicked) {
    return { sort: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { sort: clicked, dir: DEFAULT_DIR_FOR[clicked] };
}

export function ariaSort(state: SortState, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (state.sort !== key) return 'none';
  return state.dir === 'asc' ? 'ascending' : 'descending';
}

/** A small caret on the active column, empty elsewhere. */
export function sortIndicator(state: SortState, key: SortKey): string {
  if (state.sort !== key) return '';
  return state.dir === 'asc' ? '▴' : '▾';
}
