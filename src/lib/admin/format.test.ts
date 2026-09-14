import { describe, it, expect } from 'vitest';
import { formatNumber, timeAgo, countryFlag, countryName, osLabel, compareVersionDesc, escapeHtml, initials, distinctCount } from './format';

describe('format', () => {
  it('formatNumber', () => {
    expect(formatNumber(1204)).toBe('1,204');
    expect(formatNumber('x')).toBe('-');
    expect(formatNumber(NaN)).toBe('-');
  });
  it('timeAgo buckets', () => {
    const now = Date.parse('2026-09-13T12:00:00Z');
    expect(timeAgo('2026-09-13T11:59:30Z', now)).toBe('30s ago');
    expect(timeAgo('2026-09-13T11:15:00Z', now)).toBe('45m ago');
    expect(timeAgo('2026-09-13T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-09-10T12:00:00Z', now)).toBe('3d ago');
    expect(timeAgo('garbage', now)).toBe('-');
  });
  it('country helpers', () => {
    expect(countryFlag('IL')).toBe('🇮🇱');
    expect(countryFlag('??')).toBe('🏳️');
    expect(countryName('IL')).toBe('Israel');
    expect(countryName('ZZ')).toBe('ZZ');
  });
  it('osLabel', () => {
    expect(osLabel('windows')).toBe('Windows');
    expect(osLabel('darwin')).toBe('macOS');
    expect(osLabel('macos')).toBe('macOS');
    expect(osLabel('linux')).toBe('Linux');
  });
  it('compareVersionDesc sorts newest first', () => {
    expect(['1.33.6', '1.33.10', '1.32.9'].sort(compareVersionDesc)).toEqual(['1.33.10', '1.33.6', '1.32.9']);
  });
  it('escapeHtml', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
  it('initials', () => {
    expect(initials('Dana Levi')).toBe('DL');
    expect(initials('dana@example.com')).toBe('D');
    expect(initials('')).toBe('?');
  });
  it('distinctCount ignores zeros', () => {
    expect(distinctCount({ a: 1, b: 0, c: 3 })).toBe(2);
    expect(distinctCount(null)).toBe(0);
  });
});
