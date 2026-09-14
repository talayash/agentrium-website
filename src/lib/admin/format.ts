// ISO 3166-1 alpha-2 -> display name (partial; falls back to the code itself).
export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', IL: 'Israel', GB: 'United Kingdom', DE: 'Germany',
  FR: 'France', CA: 'Canada', AU: 'Australia', JP: 'Japan', CN: 'China',
  IN: 'India', BR: 'Brazil', RU: 'Russia', NL: 'Netherlands', ES: 'Spain',
  IT: 'Italy', SE: 'Sweden', NO: 'Norway', FI: 'Finland', DK: 'Denmark',
  PL: 'Poland', UA: 'Ukraine', MX: 'Mexico', AR: 'Argentina', ZA: 'South Africa',
  KR: 'South Korea', TR: 'Turkey', SG: 'Singapore', CH: 'Switzerland',
  AT: 'Austria', BE: 'Belgium', IE: 'Ireland', PT: 'Portugal', GR: 'Greece',
  CZ: 'Czechia', RO: 'Romania', HU: 'Hungary', NZ: 'New Zealand',
  HK: 'Hong Kong', TW: 'Taiwan', TH: 'Thailand', VN: 'Vietnam', ID: 'Indonesia',
  PH: 'Philippines', MY: 'Malaysia', AE: 'UAE', SA: 'Saudi Arabia',
  EG: 'Egypt', NG: 'Nigeria', KE: 'Kenya', CL: 'Chile', CO: 'Colombia',
};

export function countryFlag(code: string): string {
  if (typeof code !== 'string' || code.length !== 2) return '🏳️';
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const base = 127397;
  return String.fromCodePoint(base + cc.charCodeAt(0), base + cc.charCodeAt(1));
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[String(code).toUpperCase()] ?? code;
}

export function osIcon(os: string): string {
  const key = String(os || '').toLowerCase();
  if (key.includes('win')) return '🪟';
  if (key.includes('mac') || key.includes('darwin') || key.includes('osx')) return '🍎';
  if (key.includes('linux')) return '🐧';
  if (key.includes('bsd')) return '😈';
  return '💻';
}

export function osLabel(os: string): string {
  const key = String(os || '').toLowerCase();
  // Check darwin/mac before win: the substring "win" occurs inside "darwin".
  if (key.includes('darwin') || key.includes('mac')) return 'macOS';
  if (key.includes('win')) return 'Windows';
  if (key.includes('linux')) return 'Linux';
  return String(os || 'Unknown');
}

export function formatNumber(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US');
}

export function escapeHtml(s: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

export function distinctCount(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).filter((v) => typeof v === 'number' && v > 0).length;
}

// Sort versions semver-style descending so the newest appears first.
export function compareVersionDesc(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '-';
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function initials(nameOrEmail: string): string {
  const s = String(nameOrEmail ?? '').trim();
  if (!s) return '?';
  if (s.includes('@')) return s[0].toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}
