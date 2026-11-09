import type { Config } from '@react-router/dev/config';
import { resolveTauCloudBuildEnabled } from './build-environment.ts';

const tauCloudEnabled = resolveTauCloudBuildEnabled(process.env['TAU_CLOUD_ENABLED']);

/**
 * Concurrency for parallel prerender requests. React Router defaults to 1
 * (serial); raising it speeds up the build because each prerendered URL runs
 * through the full SSR pipeline (~50–200 ms wall time per page) but the work
 * is mostly I/O and string assembly, not CPU.
 *
 * 4 matches the React Router docs example
 * (https://reactrouter.com/how-to/pre-rendering#concurrency) and is a safe
 * ceiling on a 22 MB SSR Function bundle: enough parallelism to shorten the
 * prerender pass, low enough to not blow memory in CI runners. Bump cautiously
 * — N > 8 has produced OOMs in similar setups.
 */
const prerenderConcurrency = 4;

/**
 * `getStaticPaths()` is not used: most routes here (`/projects`,
 * `/files`, `/usage`, `/settings_`, `/health/*`, `/action/set-theme`,
 * `/api/*`, `/_index`) are auth-gated, runtime-only, or proxy endpoints that
 * would fail prerender. Each safelisted path below is one that genuinely has
 * no per-request work.
 *
 * Static paths delegate to `./app/lib/static-paths` via `import()` so the Nx
 * config loader (`loadConfigFile`) does not eagerly resolve `#` aliases or an
 * extensionless TS specifier as a filesystem path missing the `.ts` suffix.
 */
export default {
  ssr: true,
  /**
   * Every route is known on boot, so no navigation waits on `/__manifest`.
   *
   * Lazy discovery only learns a route from a `<Link>` already in the DOM. On a phone the
   * sidebar is a sheet whose links mount on open, and its discovery request is debounced
   * until the sheet stops mutating, so a tap on a project row often went out first and the
   * navigation fetched `/__manifest` for itself before it could start: 11 of 20 taps from
   * the editor on main, 0 of 20 with this mode (Brain `phone-nav-discovery`, 2026-11-09).
   * The whole manifest ships as one hashed, immutable `manifest-<version>.js`
   * (~15 KB compressed) instead of a per-page slice inlined in each document, so documents
   * get ~4 KB smaller and a cold first visit transfers ~6 KB more.
   *
   * React Router's `/__manifest` version check goes with it; it only ever covered routes not
   * yet discovered. Skew is handled by `build-skew` (`stale-build-navigation`,
   * `stale-build-recovery`) and the patched route-module loader.
   */
  routeDiscovery: { mode: 'initial' },
  /**
   * `buildEnd` is the only hook that runs after prerendering, so it is where
   * the offline shell worker is generated from the emitted `/usage` document
   * and the Vite build manifest (B5 R3). The desktop and daemon configs are
   * separate files and never run this: both already boot from a packaged SPA
   * index fallback.
   */
  async buildEnd({ reactRouterConfig }) {
    if (!tauCloudEnabled) {
      return;
    }
    const { generateOfflineShell } = await import('./scripts/generate-offline-shell');
    const { listOfflineShellPaths } = await import('./app/lib/static-paths');
    await generateOfflineShell({
      clientDirectory: `${reactRouterConfig.buildDirectory}/client`,
      workerSourcePath: `${reactRouterConfig.appDirectory}/offline/offline-shell-worker.ts`,
      documentPaths: listOfflineShellPaths(),
    });
  },
  prerender: {
    async paths() {
      const { listStaticPrerenderPaths } = await import('./app/lib/static-paths');
      return listStaticPrerenderPaths().filter((path) => tauCloudEnabled || path !== '/usage');
    },
    concurrency: prerenderConcurrency,
  },
} satisfies Config;
