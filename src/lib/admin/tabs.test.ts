import { describe, it, expect } from 'vitest';
import { parseTab, tabHash, TABS } from './tabs';

describe('tabs', () => {
  it('parses known hashes and falls back to overview', () => {
    for (const t of TABS) expect(parseTab(`#${t}`)).toBe(t);
    expect(parseTab('')).toBe('overview');
    expect(parseTab('#')).toBe('overview');
    expect(parseTab('#nope')).toBe('overview');
    expect(parseTab('#INBOX')).toBe('inbox');
  });
  it('round-trips', () => {
    for (const t of TABS) expect(parseTab(tabHash(t))).toBe(t);
  });
});
