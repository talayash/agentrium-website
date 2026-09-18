import { describe, it, expect } from 'vitest';
import {
  USER_COLUMNS,
  DEFAULT_DIR_FOR,
  nextSortState,
  ariaSort,
  sortIndicator,
  type SortState,
} from './sort';

describe('USER_COLUMNS', () => {
  it('covers every column the users table renders', () => {
    expect(USER_COLUMNS.map((c) => c.label)).toEqual([
      'User', 'Provider', 'Signed up', 'Last seen', 'Devices', 'App', 'OS', 'Profiles', 'Workspaces',
    ]);
  });

  it('marks the count columns as numeric so they right-align', () => {
    const numeric = USER_COLUMNS.filter((c) => c.numeric).map((c) => c.sort);
    expect(numeric).toEqual(['devices', 'profiles', 'workspaces']);
  });

  it('declares a default direction for every sortable column', () => {
    for (const col of USER_COLUMNS) {
      expect(DEFAULT_DIR_FOR[col.sort], `${col.sort} needs a default direction`).toBeDefined();
    }
  });
});

describe('DEFAULT_DIR_FOR', () => {
  it('starts dates and counts at descending', () => {
    // Clicking "Last seen" should show the most recent user first, and
    // "Devices" the heaviest user first. Ascending would bury the answer.
    expect(DEFAULT_DIR_FOR.created).toBe('desc');
    expect(DEFAULT_DIR_FOR.last_seen).toBe('desc');
    expect(DEFAULT_DIR_FOR.devices).toBe('desc');
    expect(DEFAULT_DIR_FOR.profiles).toBe('desc');
    expect(DEFAULT_DIR_FOR.workspaces).toBe('desc');
  });

  it('starts text at ascending', () => {
    // A-Z is what a name or email column is expected to do first.
    expect(DEFAULT_DIR_FOR.email).toBe('asc');
    expect(DEFAULT_DIR_FOR.name).toBe('asc');
    expect(DEFAULT_DIR_FOR.provider).toBe('asc');
    expect(DEFAULT_DIR_FOR.app_version).toBe('asc');
    expect(DEFAULT_DIR_FOR.os).toBe('asc');
  });
});

describe('nextSortState', () => {
  const created: SortState = { sort: 'created', dir: 'desc' };

  it('flips direction when the active column is clicked again', () => {
    expect(nextSortState(created, 'created')).toEqual({ sort: 'created', dir: 'asc' });
    expect(nextSortState({ sort: 'created', dir: 'asc' }, 'created')).toEqual(created);
  });

  it('uses the column default when a different column is clicked', () => {
    // Not the previous direction: switching from "Signed up desc" to "Email"
    // should give A-Z, not Z-A.
    expect(nextSortState(created, 'email')).toEqual({ sort: 'email', dir: 'asc' });
    expect(nextSortState({ sort: 'email', dir: 'desc' }, 'devices')).toEqual({ sort: 'devices', dir: 'desc' });
  });
});

describe('ariaSort', () => {
  it('reports the active column only', () => {
    const state: SortState = { sort: 'email', dir: 'asc' };
    expect(ariaSort(state, 'email')).toBe('ascending');
    expect(ariaSort({ sort: 'email', dir: 'desc' }, 'email')).toBe('descending');
    expect(ariaSort(state, 'devices')).toBe('none');
  });
});

describe('sortIndicator', () => {
  it('shows a caret only on the active column', () => {
    const state: SortState = { sort: 'devices', dir: 'desc' };
    expect(sortIndicator(state, 'devices')).toBe('▾');
    expect(sortIndicator({ sort: 'devices', dir: 'asc' }, 'devices')).toBe('▴');
    expect(sortIndicator(state, 'email')).toBe('');
  });
});
