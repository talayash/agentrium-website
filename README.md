# Agentrium Website

Official website for [Agentrium](https://github.com/talayash/agentrium) - a native desktop app that runs Claude Code, Codex, Cursor, and Gemini side by side.

**Live:** [https://claude-terminal.dev](https://claude-terminal.dev)

> The app was renamed **ClaudeTerminal -> Agentrium** (repo `talayash/agentrium`, default branch `master`)
> when it went multi-agent, and release assets are now named `Agentrium_<version>_*`. This repo, the
> `claude-terminal.dev` domain, and the `ct-analytics.claude-terminal.workers.dev` analytics host keep the
> old name on purpose.

## Tech Stack

- [Astro](https://astro.build/) - static site generator
- [Tailwind CSS v4](https://tailwindcss.com/) - styling
- [Inter Variable](https://rsms.me/inter/) via rsms.me CDN - single sans typeface
- [Vitest](https://vitest.dev/) - content-lint + build-smoke test harness
- [Vercel](https://vercel.com/) - hosting & deployment

## Development

```bash
npm install
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to ./dist/
npm run preview   # Preview production build locally
npm run test:run  # Run the content-lint + build-smoke suite
```

## How It Stays Updated

- **Version number** is fetched from the [GitHub Releases API](https://api.github.com/repos/talayash/agentrium/releases/latest) at build time
- **Download links** are dynamically constructed from the latest version
- **Changelog** is sourced from `src/data/changelog.json`, synced from the main repo via the `sync-release.yml` workflow
- A **repository dispatch** from the main repo's release workflow triggers a rebuild on each new release

## Admin dashboard (`/admin`)

Private, password-gated page that merges the telemetry dashboard, the error summary, the feedback inbox and account data. Served by `src/pages/admin.astro`; data comes only through same-origin edge functions in `api/`, which hold every secret.

Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | The one password for `/admin`. |
| `ADMIN_SESSION_SECRET` | 32+ random bytes (base64), signs the HttpOnly session cookie. |
| `ADMIN_API_TOKEN` | Shared with the `agentrium-api` project; sent as `x-admin-token` to its read-only `/api/admin/*` routes. |
| `CT_STATS_TOKEN` | Existing token for the ct-analytics Worker. |

Login is rate limited to 10 attempts per IP per 15 minutes through the Worker's KV and fails closed if the Worker is unreachable. `/stat` and `/inbox` are kept for a transition period and then redirect to `/admin#telemetry` and `/admin#inbox`.

## Project Structure

```
src/
  layouts/Layout.astro        # Base HTML layout with SEO meta + Inter Variable
  components/
    Navbar.astro              # Slim status-bar navigation
    Hero.astro                # Centered pure-type hero with italic coral accent
    Features.astro            # Manifesto pattern (numbered rows)
    Screenshots.astro         # Editorial spread (1 large + 2 small)
    Download.astro            # Two-OS quiet blocks
    Footer.astro              # Three-zone slim footer
  pages/
    index.astro               # Landing page
    changelog.astro           # Release history (manifesto pattern)
    stat.astro                # Hidden telemetry dashboard
    admin.astro               # Password-gated admin dashboard (tabs: overview, users, telemetry, errors, inbox)
  data/
    changelog.json            # Release notes data
    features.json             # Feature descriptions
  lib/admin/                # Dashboard modules (tabs, charts, panels)
  styles/global.css           # Palette tokens, type scale, coral signature
tests/
  content-lint.test.js        # Enforces design conventions (palette, IA, coral discipline)
  build-smoke.test.js         # Verifies astro build completes
api/                      # Vercel edge proxies (session-gated)
public/
  screenshots/                # App screenshots
  icons/                      # App icon
vitest.config.js              # Vitest configuration
vercel.json                   # Vercel deployment config
.github/workflows/
  deploy.yml                  # Build verification
  sync-release.yml            # Changelog sync from main repo
```

## Design

The site follows the "Quiet Product" spec at [`docs/superpowers/specs/2026-07-23-claude-like-ui-makeover-design.md`](docs/superpowers/specs/2026-07-23-claude-like-ui-makeover-design.md). Palette is paper (`#faf9f5`) + ink (`#252525`) + coral (`#c86a4a`). Single sans (Inter Variable). Coral appears in exactly 4 named places sitewide (nav status dot, section labels, feature indices, focus rings). No em-dash characters permitted in `src/**` or `README.md` (enforced by tests).

## License

MIT
