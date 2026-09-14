// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  // /stat and /inbox were folded into the admin dashboard's Telemetry and
  // Inbox tabs, both of which require an admin session. A bookmarked link to
  // either old page redirects here instead of rendering a dead page.
  redirects: {
    '/stat': '/admin#telemetry',
    '/inbox': '/admin#inbox',
  }
});