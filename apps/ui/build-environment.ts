/**
 * The desktop renderer's runtime telemetry build signal (`TAU_TELEMETRY_HOST=cloud`, set literally by the release
 * workflow), independent of the billing gate above. A desktop build without it composes a reporter only once signed in;
 * web builds no longer read it, because their API's policy probe already gates them.
 */
export const resolveTauTelemetryHostCloud = (value: string | undefined): boolean => value === 'cloud';

/**
 * The web build's release label: the short commit (12 hex) from Netlify's `COMMIT_REF`, else the GitHub Actions
 * `GITHUB_SHA` the deploy workflow builds at; `undefined` for a local build. The API admits it only from the
 * `/tau-release.json` the deploy publishes beside the build, never from what a client posts.
 *
 * The build itself never reads it, so `ui:build`'s cache key holds sources and configuration only:
 * `scripts/stamp-build-release.mts` applies it to the finished build (ST-9).
 */
export const resolveTauBuildRelease = (
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const commit = (environment['COMMIT_REF'] ?? environment['GITHUB_SHA'])?.trim().toLowerCase();
  return commit !== undefined && /^[\da-f]{12,40}$/u.test(commit) ? commit.slice(0, 12) : undefined;
};

/**
 * What the server graph's `tauBuildRelease` holds until `scripts/stamp-build-release.mts` replaces it with the release.
 * Twelve characters, like the label, so stamping keeps every byte offset and the server source maps stay valid; not a
 * label, so an unstamped build reports none.
 */
export const unstampedBuildRelease = '@TAU_RELEASE';

/** Whether a value is a stamped release label (12 hex, as {@link resolveTauBuildRelease} gives). */
export const isStampedBuildRelease = (value: string): boolean => /^[\da-f]{12}$/u.test(value);

/** A build's deployment ceiling (adaptive app deployment mode charter D1): which display modes it can show. */
export type TauDeploymentCeiling = 'cloud' | 'self-host' | 'adaptive';

/**
 * Resolve `TAU_CLOUD_ENABLED` to the build's ceiling before Vite constructs any client, worker or SSR graph (D1):
 * `true` is `cloud` (pinned funded), `false` is `self-host` (pinned unfunded) and `adaptive` reads the API's
 * deployment answer at run time. Unset is `self-host` until the flip (W8). Any other value fails the build.
 *
 * @param value - The variable's value.
 * @returns The ceiling.
 */
export const resolveTauDeploymentCeiling = (value: string | undefined): TauDeploymentCeiling => {
  if (value === undefined || value === 'false') {
    return 'self-host';
  }
  if (value === 'true') {
    return 'cloud';
  }
  if (value === 'adaptive') {
    return 'adaptive';
  }
  throw new Error('TAU_CLOUD_ENABLED must be exactly true, false or adaptive.');
};

/** The variable naming the web build's output directory under `apps/ui` (`build` by default; W2's adaptive build). */
export const uiBuildDirectoryVariable = 'TAU_UI_BUILD_DIRECTORY';

/**
 * The web build's output directory, relative to `apps/ui`: `build`, or the name `TAU_UI_BUILD_DIRECTORY` gives, so CI
 * can keep a second build (`ui:build-adaptive`) beside the first (gate G1).
 *
 * @param value - The variable's value.
 * @returns A directory name.
 */
export const resolveUiBuildDirectory = (value: string | undefined): string => {
  if (value === undefined || value === '') {
    return 'build';
  }
  if (!/^[\w-]+$/u.test(value)) {
    throw new Error(`${uiBuildDirectoryVariable} must be one directory name under apps/ui.`);
  }
  return value;
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
