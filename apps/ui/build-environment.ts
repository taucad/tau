/**
 * The desktop renderer's runtime telemetry build signal (`TAU_TELEMETRY_HOST=cloud`, set literally by the release
 * workflow), independent of the billing gate above. A desktop build without it composes a reporter only once signed in;
 * web builds no longer read it, because their API's policy probe already gates them.
 */
export const resolveTauTelemetryHostCloud = (value: string | undefined): boolean => value === 'cloud';

/**
 * The web build's release label: the short commit (12 hex) from Netlify's `COMMIT_REF`, else the GitHub Actions
 * `GITHUB_SHA` the deploy workflow builds at; `undefined` for a local build. The API admits it only from the
 * `/tau-release.json` the same build publishes, never from what a client posts.
 */
export const resolveTauBuildRelease = (
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const commit = (environment['COMMIT_REF'] ?? environment['GITHUB_SHA'])?.trim().toLowerCase();
  return commit !== undefined && /^[\da-f]{12,40}$/u.test(commit) ? commit.slice(0, 12) : undefined;
};

/** Resolve the deployment mode before Vite constructs any client, worker or SSR graph. */
export const resolveTauCloudBuildEnabled = (value: string | undefined): boolean => {
  if (value === undefined || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error('TAU_CLOUD_ENABLED must be exactly true or false.');
};

/** The build variable that ships the service worker kill switch ({@link resolveServiceWorkerKillSwitch}). */
export const serviceWorkerKillSwitchVariable = 'TAU_SERVICE_WORKER_KILL_SWITCH';

/**
 * The service worker kill switch (progressive loading PL7): `TAU_SERVICE_WORKER_KILL_SWITCH=true` at build time ships,
 * at `/service-worker.js`, a worker that takes every open page, deletes the web app's worker's caches and unregisters
 * (`app/offline/service-worker-retire.ts`) instead of the web app's worker, and pages that register nothing. One deploy
 * with it set retires a bad worker from every browser that loads a page; one deploy without it restores the worker.
 * Unset or `false` builds the web app's worker. Read by `react-router.config.ts` (which worker `buildEnd` writes),
 * `vite.config.ts` (whether pages register) and `scripts/check-critical-budget.mts` (an empty precache list).
 *
 * @param value - The variable's value.
 * @returns Whether the kill switch is on.
 */
export const resolveServiceWorkerKillSwitch = (value: string | undefined): boolean => {
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error(`${serviceWorkerKillSwitchVariable} must be exactly true or false.`);
};
