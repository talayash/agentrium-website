// Visibility-gated polling loop shared by the admin panels.
//
// `fn` runs immediately on start, then every `intervalMs` while the tab is
// visible. Overlapping runs are skipped, and returning to a hidden tab
// triggers an immediate catch-up run.

export interface Poller {
  start(): void;
  stop(): void;
  now(): void;
}

export function createPoller(fn: () => Promise<void>, intervalMs: number): Poller {
  let timer: number | null = null;
  let inFlight = false;

  const run = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      await fn();
    } finally {
      inFlight = false;
    }
  };

  const onVis = (): void => {
    if (document.visibilityState === 'visible') void run();
  };

  return {
    start() {
      if (timer !== null) return;
      void run();
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void run();
      }, intervalMs);
      document.addEventListener('visibilitychange', onVis);
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVis);
    },
    now() {
      void run();
    },
  };
}
