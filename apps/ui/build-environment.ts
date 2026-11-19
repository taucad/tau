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
