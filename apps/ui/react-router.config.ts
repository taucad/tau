import type { Config } from '@react-router/dev/config';
import {
  resolveServiceWorkerKillSwitch,
  resolveTauDeploymentCeiling,
  resolveUiBuildDirectory,
  uiBuildDirectoryVariable,
  serviceWorkerKillSwitchVariable,
} from './build-environment.ts';

/* `/usage` is prerendered and precached by the `cloud` ceiling only (adaptive app deployment mode D8). */
const tauCloudEnabled = resolveTauDeploymentCeiling(process.env['TAU_CLOUD_ENABLED']) === 'cloud';
/** `TAU_SERVICE_WORKER_KILL_SWITCH=true`: `buildEnd` writes the retiring worker instead of the web app's (PL7). */
const serviceWorkerKillSwitch = resolveServiceWorkerKillSwitch(process.env[serviceWorkerKillSwitchVariable]);

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
 * `/files`, `/usage`, `/settings_`, `/health/*`, `/action/migrate-theme`,
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
  /* `build` unless CI keeps a second build beside it (`ui:build-adaptive`, gate G1). */
  buildDirectory: resolveUiBuildDirectory(process.env[uiBuildDirectoryVariable]),
  /**
   * Hands the dev dependency optimizer its crawl entries: the client entry and every route
   * module. Without it React Router sets `optimizeDeps.entries` to `[]`, Vite's startup scan
   * crawls nothing, and every dependency is found on first request instead, each batch an
   * "optimized dependencies changed. reloading" full page reload: a cold dev server reloaded
   * open pages eight times during e2e-nightly's development tier (2026-11-12).
   * Worker entries, which no route reaches statically, are added in `vite.config.ts`.
   *
   * React Router 8 (blueprint RR8) makes the behaviour the `v8_*` flags turned on under 7 the default, and rejects
   * the flags:
   * - loaders and actions get the request as sent (B4), so a client navigation's `request.url` is
   *   `<path>.data?_routes=…`. Anything that means the page's own URL reads the `url` argument;
   * - data requests are trailing-slash aware (B5): Home's is `/_.data`, no longer `/_root.data`. The marketing edge
   *   function and the skew protection pin accept both names, so a tab of an earlier build still gets its data;
   * - one Vite config builds the client and server environments (B6), so server-only options live under
   *   `environments.ssr` in `vite.config.ts`, and the Netlify adapter (4.x) writes a function that imports
   *   `build/server/index.js` and the adapter's `serverless` handler;
   * - middleware is always on;
   * - route modules split (B8, `splitRouteModules` defaults to `true`): a route's `clientLoader`, `clientAction`,
   *   `clientMiddleware` and `HydrateFallback` load as their own chunks. No route has one that splits today, and
   *   `scripts/check-critical-budget.mts` fails when a split module first appears in the manifest, because split
   *   chunks load outside the patched `loadRouteModule` stale-build fallback. The root's `clientMiddleware` (RR9) is
   *   not split: React Router never splits the root route module, which hydration has already loaded.
   */
  future: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's flag name.
    unstable_optimizeDeps: true,
  },
  /**
   * Every route is known on boot, so no navigation waits on `/__manifest`.
   *
   * Lazy discovery only learns a route from a `<Link>` already in the DOM. On a phone the
   * sidebar is a sheet whose links mount on open, and its discovery request is debounced
   * until the sheet stops mutating, so a tap on a sidebar row can race it: the navigation then
   * fetches `/__manifest` for itself, or overlaps the sheet's request, before it can start.
   * Measured from the editor on two hosts, main made a `/__manifest` request after the tap in
   * 19 of 20 (cloud) and 16 of 20 (M2 Pro) samples, and this mode made none (Brain `phone-nav-discovery`, 2026-11-09).
   * The whole manifest ships as one hashed, immutable `manifest-<version>.js`
   * (~15 KB compressed) instead of a per-page slice inlined in each document, so documents
   * get ~4 KB smaller and a cold first visit transfers ~6 KB more.
   *
   * React Router's `/__manifest` version check goes with it; it only ever covered routes not
   * yet discovered. Skew is handled by `build-skew` (`stale-build-navigation`, whose root client
   * middleware runs after route matching and never asks `/__manifest` either, and
   * `stale-build-recovery`) and the patched route-module loader.
   */
  routeDiscovery: { mode: 'initial' },
  /**
   * `buildEnd` is the only hook that runs after prerendering, so it is where
   * the Home shell is moved off `/`'s static path to the file the marketing edge
   * function rewrites to (progressive loading PL4, `scripts/place-static-shells.ts`),
   * where the warm manifest is written from the Vite build manifest and the
   * module-id manifest (progressive loading PL8, `scripts/write-warm-manifest.ts`),
   * and where the web app's one service worker is built, its precache list generated
   * from the route-class registry and the emitted shell documents (progressive
   * loading PL7, `scripts/build-service-worker.ts`). The desktop and daemon configs
   * are separate files and never run this: both already boot from a packaged SPA
   * index fallback.
   */
  async buildEnd({ reactRouterConfig }) {
    const { placeEdgeShells } = await import('./scripts/place-static-shells');
    for (const placed of placeEdgeShells(`${reactRouterConfig.buildDirectory}/client`)) {
      console.log(
        `Static shell: ${placed.from} -> ${placed.to}${placed.removed.map((file) => `, removed ${file}`).join('')}`,
      );
    }
    const { writeWarmManifest } = await import('./scripts/write-warm-manifest');
    const warm = writeWarmManifest({
      clientDirectory: `${reactRouterConfig.buildDirectory}/client`,
      moduleIdsPath: `${reactRouterConfig.buildDirectory}/client-module-ids.json`,
    });
    console.log(
      `Warm manifest: ${Object.entries(warm.classes)
        .map(([id, files]) => `${id} ${String(files.length)} files`)
        .join(', ')}`,
    );
    const { buildServiceWorker } = await import('./scripts/build-service-worker');
    const { workerRouteClasses } = await import('./app/lib/route-classes');
    const worker = await buildServiceWorker({
      buildDirectory: reactRouterConfig.buildDirectory,
      workerSourcePath: `${reactRouterConfig.appDirectory}/offline/${serviceWorkerKillSwitch ? 'service-worker-kill-switch.ts' : 'service-worker.ts'}`,
      // `/usage` is a cloud route: a self-host build neither prerenders nor precaches it.
      classes: workerRouteClasses().filter(
        (workerClass) => tauCloudEnabled || workerClass.routeClass.id !== 'offline-shell',
      ),
      // Also written at /offline-shell-worker.js, retiring the /usage worker that ui@0.3.0 and earlier registered.
      retiringWorkerSourcePath: `${reactRouterConfig.appDirectory}/offline/service-worker-kill-switch.ts`,
      killSwitch: serviceWorkerKillSwitch,
    });
    console.log(
      serviceWorkerKillSwitch
        ? `Service worker: kill switch (${serviceWorkerKillSwitchVariable}=true), retires installed workers, precaches nothing`
        : `Service worker: ${String(worker.entries.length)} precache entries, ${String(Math.round(worker.bytes / 1024))} KiB`,
    );
  },
  prerender: {
    async paths() {
      const { listStaticPrerenderPaths } = await import('./app/lib/static-paths');
      return listStaticPrerenderPaths().filter((path) => tauCloudEnabled || path !== '/usage');
    },
    concurrency: prerenderConcurrency,
  },
} satisfies Config;
