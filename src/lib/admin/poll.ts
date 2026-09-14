// Visibility-gated polling loop shared by the admin panels.
//
// `fn` runs immediately on start, then every `intervalMs` while the tab is
// visible. Overlapping runs are skipped, and returning to a hidden tab
// triggers an immediate catch-up run. An explicit `now()` that lands during a
// run is queued rather than dropped, so a Refresh click or a changed filter
// always reaches the network.

export interface Poller {
  start(): void;
  stop(): void;
  now(): void;
}

export function createPoller(fn: () => Promise<void>, intervalMs: number): Poller {
  let timer: number | null = null;
  let inFlight = false;
  let pending = false;

  // `queueIfBusy` separates an explicit request from a scheduled tick. A tick
  // that lands mid-run is dropped, but an explicit request is queued so the
  // newest parameters are always fetched instead of silently ignored.
  const run = async (queueIfBusy: boolean): Promise<void> => {
    if (inFlight) {
      if (queueIfBusy) pending = true;
      return;
    }
    inFlight = true;
    try {
      await fn();
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        void run(false);
      }
    }
  };

  const onVis = (): void => {
    if (document.visibilityState === 'visible') void run(false);
  };

  return {
    start() {
      if (timer !== null) return;
      void run(false);
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void run(false);
      }, intervalMs);
      document.addEventListener('visibilitychange', onVis);
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      pending = false;
      document.removeEventListener('visibilitychange', onVis);
    },
    now() {
      void run(true);
    },
  };
}
