import type { Config } from '@react-router/dev/config';

/**
 * Desktop (Electron) build of `apps/ui` — see
 * `docs/research/desktop-build-seam-blueprint.md`.
 *
 * Pure SPA: `ssr: false` with **no** `prerender`. Prerendering would re-enter
 * the SSR pipeline per path, which the desktop shell has no use for and which
 * would re-admit the server-export validator's strict branch. The single
 * `index.html` React Router emits is what the shell serves over `app://tau`.
 *
 * `appDirectory` and `buildDirectory` keep their defaults (`./app`, `./build`)
 * relative to this directory: the React Router CLI derives its root from the
 * `--config` file's directory (belt-and-braces `REACT_ROUTER_ROOT` in
 * `apps/ui/project.json`), and `routes.ts`/`root.tsx` are hardcoded lookups
 * inside `appDirectory` — which is exactly why the desktop manifest needs its
 * own app directory rather than an env-var branch of the web config.
 */
export default {
  ssr: false,
} satisfies Config;
