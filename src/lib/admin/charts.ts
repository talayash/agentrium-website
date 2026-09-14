// SVG chart renderers and distribution-bar builder for the admin dashboard.
//
// Moved from src/pages/stat.astro and re-signatured to take elements
// directly (instead of looking them up by id) and to return the numbers the
// caller needs to set its own labels.

import { formatNumber, escapeHtml, compareVersionDesc } from './format';

// Chart series colors (Midnight palette). First is the primary accent and
// the newest/biggest series; subsequent slots are neutral tones covering up
// to ~6 versions before wrapping. Order matters for renderStackedArea -
// newest version sorts first (rendered first, painted underneath).
export const SERIES_COLORS = ['#0A84FF', '#7A5BFF', '#38B6FF', '#AEAEB2', '#5E5CE6', '#64D2FF'];

export interface LineAreaPoint {
  date: string;
  value: number;
}

export interface StackedAreaPoint {
  date: string;
  bucket: string;
  value: number;
}

export function renderLineArea(
  svg: SVGElement,
  series: LineAreaPoint[],
  color: string,
): { max: number; from: string; to: string } {
  if (!Array.isArray(series) || series.length === 0) {
    svg.innerHTML = '<text x="500" y="100" text-anchor="middle" fill="#8A8A92" font-size="14">No data yet</text>';
    return { max: 0, from: '', to: '' };
  }
  const W = 1000, H = 200;
  const max = Math.max(...series.map((p) => p.value || 0), 1);
  const n = series.length;
  const pts = series.map((p, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    const y = H - ((p.value || 0) / max) * (H - 8) - 4; // 4px top/bottom padding
    return { x, y, value: p.value || 0, date: p.date };
  });
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const dots = pts
    .map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.5" fill="${color}" opacity="0.9"><title>${escapeHtml(p.date)}: ${formatNumber(p.value)}</title></circle>`)
    .join('');
  svg.innerHTML = `
    <path d="${areaPath}" fill="rgba(10,132,255,0.14)" />
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
  `;
  return { max, from: series[0]?.date ?? '', to: series[n - 1]?.date ?? '' };
}

export function renderStackedArea(
  svg: SVGElement,
  legend: HTMLElement | null,
  series: StackedAreaPoint[],
): { buckets: string[]; from: string; to: string } {
  if (!Array.isArray(series) || series.length === 0) {
    svg.innerHTML = '<text x="500" y="110" text-anchor="middle" fill="#8A8A92" font-size="14">No data yet</text>';
    if (legend) legend.innerHTML = '';
    return { buckets: [], from: '', to: '' };
  }

  // Group: dates ascending, buckets sorted newest version first (so newest renders at bottom of stack).
  const dates = [...new Set(series.map((p) => p.date))].sort();
  const totalsByBucket: Record<string, number> = {};
  for (const p of series) totalsByBucket[p.bucket] = (totalsByBucket[p.bucket] || 0) + (p.value || 0);
  const buckets = Object.keys(totalsByBucket).sort(compareVersionDesc);

  const byDate: Record<string, Record<string, number>> = Object.fromEntries(dates.map((d) => [d, {}]));
  for (const p of series) byDate[p.date][p.bucket] = p.value || 0;

  const totalPerDate = dates.map((d) => buckets.reduce((sum, b) => sum + (byDate[d][b] || 0), 0));
  const maxTotal = Math.max(...totalPerDate, 1);

  const W = 1000, H = 220;
  const cumulative = dates.map(() => 0);
  let svgContent = '';

  buckets.forEach((bucket, bi) => {
    const color = SERIES_COLORS[bi % SERIES_COLORS.length];
    const points = dates.map((d, i) => {
      const val = byDate[d][bucket] || 0;
      const yBottom = H - (cumulative[i] / maxTotal) * (H - 4) - 2;
      cumulative[i] += val;
      const yTop = H - (cumulative[i] / maxTotal) * (H - 4) - 2;
      const x = dates.length === 1 ? W / 2 : (i / (dates.length - 1)) * W;
      return { x, yBottom, yTop };
    });
    const top = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.yTop.toFixed(2)}`).join('');
    const bottom = points
      .slice()
      .reverse()
      .map((p) => `L${p.x.toFixed(2)},${p.yBottom.toFixed(2)}`)
      .join('');
    svgContent += `<path d="${top}${bottom}Z" fill="${color}" fill-opacity="0.78"><title>v${escapeHtml(bucket)}: ${formatNumber(totalsByBucket[bucket])} heartbeats over ${dates.length} day(s)</title></path>`;
  });

  svg.innerHTML = svgContent;

  if (legend) {
    legend.innerHTML = buckets
      .map((b, i) => {
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        return `<span class="inline-flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${color}"></span><span style="color:var(--muted-body)">v${escapeHtml(b)}</span><span style="color:var(--muted-label)">${formatNumber(totalsByBucket[b])}</span></span>`;
      })
      .join('');
  }
  return { buckets, from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
}

export function renderBars(
  svg: SVGElement,
  series: Array<{ date: string; value: number }>,
  color: string,
): { max: number } {
  if (!series.length) {
    svg.innerHTML = '<text x="500" y="100" text-anchor="middle" fill="#8A8A92" font-size="14">No data yet</text>';
    return { max: 0 };
  }
  const W = 1000, H = 200, gap = 2;
  const max = Math.max(...series.map((p) => p.value || 0), 1);
  const bw = Math.max(1, W / series.length - gap);
  svg.innerHTML = series
    .map((p, i) => {
      const h = ((p.value || 0) / max) * (H - 8);
      const x = (i * W) / series.length;
      const y = H - h - 2;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(h, p.value ? 2 : 0).toFixed(2)}" fill="${color}" opacity="0.9"><title>${escapeHtml(p.date)}: ${formatNumber(p.value)}</title></rect>`;
    })
    .join('');
  return { max };
}

// ── Distribution bars (today's snapshot) ────────────────────────────────────

export function emptyState(message: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'text-sm italic py-4 text-center';
  node.style.color = '#8A8A92';
  node.textContent = message;
  return node;
}

export function errorState(message: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'text-sm py-4 text-center';
  node.style.color = 'var(--coral)';
  node.textContent = message;
  return node;
}

function renderBar(label: string, subLabel: string, value: number, max: number, total: number): HTMLElement {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const widthPct = max > 0 ? (value / max) * 100 : 0;

  const row = document.createElement('div');
  row.className = 'group';
  row.innerHTML = `
    <div class="flex items-baseline justify-between gap-2 mb-1">
      <span class="text-sm truncate" style="color:var(--muted-body)">${label}${subLabel ? `<span class="ml-1.5 text-xs" style="color:var(--muted-label)">${subLabel}</span>` : ''}</span>
      <span class="text-xs tabular-nums flex-shrink-0" style="color:var(--muted-body)">${formatNumber(value)} <span style="color:var(--muted-label)">(${pct.toFixed(1)}%)</span></span>
    </div>
    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(10,132,255,0.14)">
      <div class="h-full rounded-full transition-all duration-500" style="width: ${widthPct}%; background:var(--accent)"></div>
    </div>
  `;
  return row;
}

/** Renders a distribution's bars into `container`. Returns the entry count. */
export function renderDistribution(
  container: HTMLElement,
  dist: Record<string, number> | undefined,
  formatter: (key: string) => { label: string; sub: string },
): number {
  container.innerHTML = '';

  const entries = dist && typeof dist === 'object'
    ? Object.entries(dist).filter(([, v]) => typeof v === 'number' && v > 0)
    : [];

  if (entries.length === 0) {
    container.appendChild(emptyState('No data yet'));
    return 0;
  }

  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const max = entries[0][1];

  for (const [key, value] of entries) {
    const { label, sub } = formatter(key);
    container.appendChild(renderBar(label, sub, value, max, total));
  }
  return entries.length;
}
