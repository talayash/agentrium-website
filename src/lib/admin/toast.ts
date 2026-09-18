// Transient confirmations for the dashboard's write actions.
//
// The toast is the safety net for Inbox delete: the row is soft-deleted
// immediately and Undo restores it, which is why the action button matters
// more than the message text.

import { el, text } from './dom';

const CONTAINER_ID = 'admin-toasts';
const DEFAULT_MS = 8000;

function container(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;
  const node = el('div', 'admin-toasts');
  node.id = CONTAINER_ID;
  // Announced politely so an undo offer reaches a screen reader without
  // interrupting whatever it is currently reading.
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  document.body.appendChild(node);
  return node;
}

export interface ToastAction {
  label: string;
  /** Runs on click. The toast closes first, so a slow handler cannot leave it stuck. */
  onAction: () => void;
}

/**
 * Shows a toast. Returns a dismiss function so a caller can close it early,
 * for example when the panel it belongs to is deactivated.
 */
export function showToast(message: string, action?: ToastAction, ms = DEFAULT_MS): () => void {
  const host = container();
  const toast = el('div', 'admin-toast');
  toast.appendChild(text('span', 'admin-toast-msg', message));

  let timer: number | null = null;
  const dismiss = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    toast.remove();
  };

  if (action) {
    const btn = text('button', 'admin-toast-action', action.label);
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', () => {
      dismiss();
      action.onAction();
    });
    toast.appendChild(btn);
  }

  const close = text('button', 'admin-toast-close', '×');
  close.setAttribute('type', 'button');
  close.setAttribute('aria-label', 'Dismiss');
  close.addEventListener('click', dismiss);
  toast.appendChild(close);

  host.appendChild(toast);
  timer = window.setTimeout(dismiss, ms);
  return dismiss;
}
