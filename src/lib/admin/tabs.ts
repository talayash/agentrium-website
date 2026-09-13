export const TABS = ['overview', 'users', 'telemetry', 'errors', 'inbox'] as const;
export type Tab = (typeof TABS)[number];

export function parseTab(hash: string): Tab {
  const key = (hash ?? '').replace(/^#/, '').toLowerCase();
  return (TABS as readonly string[]).includes(key) ? (key as Tab) : 'overview';
}

export function tabHash(tab: Tab): string {
  return `#${tab}`;
}
