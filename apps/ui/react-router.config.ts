import type { Config } from '@react-router/dev/config';

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
  prerender: {
    async paths() {
      const { listStaticPrerenderPaths } = await import('./app/lib/static-paths');
      return listStaticPrerenderPaths();
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router config field is `unstable_concurrency` (snake_case in upstream API).
    unstable_concurrency: prerenderConcurrency,
  },
} satisfies Config;
