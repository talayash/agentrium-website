// The contract every /admin panel module implements.
//
// The page shell owns the chrome (live pill, refreshed pill, tab badges) and
// the login card, so panels reach those through this context object rather
// than by reaching into the shell's DOM.

export interface PanelCtx {
  /** The session cookie expired; swap back to the login card. */
  onUnauthorized(): void;
  /** Set the header's "N active now" pill. */
  setLive(n: string): void;
  /** Set the header's last-refreshed pill. */
  setRefreshed(s: string): void;
  /** Set a tab badge count. Zero or less hides the badge. */
  setBadge(name: 'errors' | 'inbox', n: number): void;
}
