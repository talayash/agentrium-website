// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Astro inlines any bundled <script> below this size as an inline
      // <script type="module">. vercel.json ships a Content-Security-Policy
      // whose script-src has no 'unsafe-inline', so every script must be a
      // hashed /_astro/*.js file. tests/build-smoke.test.js pins this.
      assetsInlineLimit: 0,
    },
  },
  // /stat and /inbox were folded into the admin dashboard's Telemetry and
  // Inbox tabs, both of which require an admin session. A bookmarked link to
  // either old page redirects here instead of rendering a dead page.
  redirects: {
    '/stat': '/admin#telemetry',
    '/inbox': '/admin#inbox',
  }
});
