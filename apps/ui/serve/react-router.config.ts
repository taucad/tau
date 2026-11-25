import { rm } from 'node:fs/promises';
import type { Config } from '@react-router/dev/config';

/**
 * Serve build of `apps/ui` — the SPA `tau serve --ui` hands to a daemon.
 *
 * Pure SPA, exactly as the desktop build is: `ssr: false` with **no**
 * `prerender`. Prerendering would re-enter the SSR pipeline per path, and the
 * daemon has no server behind it to run one — it serves a directory of static
 * files with a single-`index.html` fallback (`packages/host/src/static-ui.ts`).
 *
 * `appDirectory` and `buildDirectory` keep their defaults (`./app`, `./build`)
 * relative to this directory; the React Router CLI derives its root from the
 * `--config` file's directory, with `REACT_ROUTER_ROOT` in
 * `apps/ui/project.json` as belt and braces.
 */
export default {
  ssr: false,
  /**
   * React Router 8 leaves `build/server` after an `ssr: false` build (7 deleted it). Nothing serves it, so it is removed
   * here, before `@taucad/cli` packages `build/client`.
   */
  async buildEnd({ reactRouterConfig }) {
    await rm(`${reactRouterConfig.buildDirectory}/server`, { recursive: true, force: true });
  },
} satisfies Config;
