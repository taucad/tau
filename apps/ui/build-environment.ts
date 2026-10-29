/**
 * Runtime telemetry's own build signal (`TAU_TELEMETRY_HOST=cloud`), independent of the billing gate above: a billing
 * rollback never silences telemetry, and a build without it composes a reporter only once signed in to its own API.
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
