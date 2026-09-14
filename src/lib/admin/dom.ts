// DOM builder helpers (moved from inbox.astro).
//
// Everything user-controlled should go through textContent (via `text`) so a
// value containing HTML/script tags renders as literal text, not executable
// markup.

export const $ = (id: string): HTMLElement => {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n;
};

export const el = (tag: string, className = ''): HTMLElement => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
};

export const text = (tag: string, className: string, str: string): HTMLElement => {
  const n = el(tag, className);
  n.textContent = str;
  return n;
};

export const clear = (node: Element): void => {
  while (node.firstChild) node.removeChild(node.firstChild);
};
