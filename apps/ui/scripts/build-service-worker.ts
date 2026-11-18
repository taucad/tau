/**
 * Builds the web app's one service worker (progressive loading PL7, `app/offline/service-worker.ts`) from real build
 * output.
 *
 * Called from `react-router.config.ts`'s `buildEnd`, the only hook that runs after prerendering, so every shell
 * document exists. The precache list is generated, never hand-maintained: for each class of the route-class registry
 * the worker answers (`workerRouteClasses`), its document, every same-origin file the document references, the class's
 * interactive roots, all expanded through the Vite build manifest's static import graph (the interactive tier, T1) and
 * the stylesheets' `url()` references (fonts). Dynamic imports are never followed, so no deferred-tier, kernel, wasm or
 * worker asset enters it; `check-critical-budget.mts` holds that on the output (shell invariant 8).
 *
 * The worker source is bundled with Workbox's runtime modules (esbuild), and Google Workbox's `injectManifest`
 * (`workbox-build`) writes the list into it: documents and other unhashed files with a content revision, hashed
 * `/assets/*` files with none, so a later deploy step that rewrites a compiled chunk (Sentry debug ids) cannot make an
 * entry stale; no entry carries an `integrity`. The list is also written beside the client output
 * (`build/service-worker-precache.json`, never served) for the build checks and `verify-shipped-assets.mts`.
 *
 * With the kill switch on (`TAU_SERVICE_WORKER_KILL_SWITCH=true`, `build-environment.ts`) it writes the retiring worker
 * (`app/offline/service-worker-kill-switch.ts`) at the same URL instead, and an empty precache list.
 *
 * PL11 (`@vite-pwa/react-router`'s `buildSW`) would replace only this file: the worker source and its tests stay.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as bundle } from 'esbuild';
import { injectManifest } from 'workbox-build';
/* oxlint-disable no-restricted-imports -- Called from react-router.config.ts before app aliases exist. */
import { collectPrecacheFiles, precacheEntries, precacheListFile } from './precache-list.ts';
import type { ClientBuildView, PrecacheEntry, ViteManifest } from './precache-list.ts';
import type { WorkerRouteClass } from '../app/lib/route-classes.ts';
/* oxlint-enable no-restricted-imports */

/** The expression `app/offline/service-worker.ts` reads its precache list from, replaced by the list. */
export const serviceWorkerInjectionPoint = 'globalThis.__WB_MANIFEST';

/** Where the worker is served from, relative to the client output. */
export const serviceWorkerFile = 'service-worker.js';

/**
 * Where the retired `/usage` worker was served from (B5, up to ui@0.3.0, scope `/`). Every build writes the retiring
 * worker (`app/offline/service-worker-kill-switch.ts`) here, so a browser still holding that worker retires it and its
 * caches on its next update check, including under the kill switch, whose pages only `update()` a registration.
 */
export const retiredServiceWorkerFile = 'offline-shell-worker.js';

/**
 * Bundle a worker source into one classic script with the modules it imports (Workbox's runtime modules for the web
 * app's worker).
 *
 * @param source - The worker source.
 * @param outfile - Where the script is written.
 */
export const bundleServiceWorker = async (source: string, outfile: string): Promise<void> => {
  await bundle({
    entryPoints: [source],
    bundle: true,
    // A classic worker script: module service workers are still not universal.
    format: 'iife',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    // Workbox's development logging and assertions are compiled out.
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile,
    logLevel: 'warning',
  });
};

/**
 * Build the service worker into the client output.
 *
 * @param options - The build directory (`build`, holding `client/`), the worker source, the retiring worker's source
 *   and the classes it answers.
 * @returns The precache list and its size, for build logging.
 */
export const buildServiceWorker = async (options: {
  readonly buildDirectory: string;
  readonly workerSourcePath: string;
  /** The retiring worker (`app/offline/service-worker-kill-switch.ts`), written at {@link retiredServiceWorkerFile}. */
  readonly retiringWorkerSourcePath: string;
  readonly classes: readonly WorkerRouteClass[];
  /**
   * The kill switch (`TAU_SERVICE_WORKER_KILL_SWITCH`, `build-environment.ts`): `workerSourcePath` is the retiring
   * worker (`app/offline/service-worker-kill-switch.ts`), bundled as it is, and the precache list is empty.
   */
  readonly killSwitch?: boolean;
}): Promise<{ readonly entries: readonly PrecacheEntry[]; readonly bytes: number }> => {
  const clientDirectory = join(options.buildDirectory, 'client');
  const resolvePath = (relativePath: string): string => join(clientDirectory, relativePath);
  await bundleServiceWorker(options.retiringWorkerSourcePath, resolvePath(retiredServiceWorkerFile));
  if (options.killSwitch === true) {
    await bundleServiceWorker(options.workerSourcePath, resolvePath(serviceWorkerFile));
    writeFileSync(join(options.buildDirectory, precacheListFile), '[]\n');
    return { entries: [], bytes: 0 };
  }
  const manifestPath = resolvePath('.vite/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `The service worker needs the Vite build manifest at ${manifestPath} (build.manifest in vite.config)`,
    );
  }
  const build: ClientBuildView = {
    readText: (relativePath) =>
      existsSync(resolvePath(relativePath)) ? readFileSync(resolvePath(relativePath), 'utf8') : undefined,
    exists: (relativePath) => existsSync(resolvePath(relativePath)),
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as ViteManifest,
  };
  const files = collectPrecacheFiles(
    options.classes.map((workerClass) => ({
      document: workerClass.document,
      roots: workerClass.routeClass.interactive ?? [],
    })),
    build,
  );
  const entries = precacheEntries(files, (relativePath) => Uint8Array.from(readFileSync(resolvePath(relativePath))));

  const staging = mkdtempSync(join(tmpdir(), 'tau-service-worker-'));
  try {
    const bundled = join(staging, serviceWorkerFile);
    await bundleServiceWorker(options.workerSourcePath, bundled);
    const { count, warnings } = await injectManifest({
      swSrc: bundled,
      swDest: resolvePath(serviceWorkerFile),
      globDirectory: clientDirectory,
      globPatterns: [],
      injectionPoint: serviceWorkerInjectionPoint,
      additionalManifestEntries: entries.map((entry) => ({ ...entry })),
    });
    // `workbox-build` warns about an entry with no revision, which is the point for a hashed file.
    const unexpected = warnings.filter((warning) => !/revision/iu.test(warning));
    if (unexpected.length > 0 || count !== entries.length) {
      throw new Error(`Service worker manifest injection: ${unexpected.join('; ') || `${String(count)} entries`}`);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  writeFileSync(join(options.buildDirectory, precacheListFile), `${JSON.stringify(entries, undefined, 2)}\n`);
  const bytes = files.reduce((total, url) => total + statSync(resolvePath(url.slice(1))).size, 0);
  return { entries, bytes };
};
