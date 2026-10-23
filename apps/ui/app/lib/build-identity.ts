/**
 * This build's ordered identity (blueprint DF20): a build timestamp, or `0`
 * where the context has none.
 *
 * Desktop, `tau serve`, dev servers, tests and the web server graph compile it
 * in as the `tauBuildId` define. A production web build keeps the literal out
 * of its client chunks so their hashes survive a rebuild without a source
 * change; the page reads the value the server published as
 * `window.ENV.TAU_BUILD_ID` (`environment.config.ts` allowlists it).
 *
 * The read goes straight to the published `window.ENV` rather than through the
 * `ENV` facade, so the workers that need an identity do not load the
 * environment schema for a value they never have.
 *
 * @returns The build timestamp, or `0`.
 */
export const readBuildId = (): number => {
  if (typeof tauBuildId === 'number') {
    return tauBuildId;
  }
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent in a worker.
  const published = globalThis.window ? Number(globalThis.window.ENV?.TAU_BUILD_ID) : Number.NaN;
  return Number.isFinite(published) ? published : 0;
};

/**
 * This bundle's build identity as a string, for equality checks and records.
 *
 * Workers of a production web build see neither the define nor a document,
 * so they fall back to their own script path. Its content hash changes exactly
 * when the worker's code does, which is the compatibility a build comparison
 * between two workers is asking about.
 *
 * @returns The build timestamp as a string, the worker script path, or `'0'`.
 */
export const readBuildIdentity = (): string => {
  const buildId = readBuildId();
  if (buildId !== 0) {
    return String(buildId);
  }
  const isDocument = typeof document !== 'undefined';
  const scriptPath = isDocument ? undefined : (globalThis as { location?: Location }).location?.pathname;
  return scriptPath ?? '0';
};

/** Same-origin route that names the build the server renders pages for (`routes/health.build.ts`). */
export const buildIdentityPath = '/health/build';

/** Milliseconds {@link askLiveBuild} waits for the server before calling it unreachable. */
export const liveBuildIdTimeout = 4000;

/**
 * What the server said about its live build: the build id; `none` when the host has no
 * build endpoint or names no build (a 404, or an OK non-JSON document: the desktop and
 * `tau serve` hosts answer this path with their SPA `index.html`); `unreachable` when no
 * answer came in time or the answer was any other failure (5xx, 408, 429, …), which may pass.
 */
export type LiveBuildAnswer = number | 'none' | 'unreachable';

let liveBuildRequest: Promise<LiveBuildAnswer> | undefined;

const requestLiveBuild = async (): Promise<LiveBuildAnswer> => {
  let response: Response;
  try {
    response = await fetch(buildIdentityPath, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(liveBuildIdTimeout),
    });
  } catch {
    return 'unreachable';
  }
  // Only a missing route or an SPA document means "no endpoint"; any other failure may pass.
  if (response.status === 404) {
    return 'none';
  }
  if (!response.ok) {
    return 'unreachable';
  }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    return 'none';
  }
  try {
    const { buildId: published } = (await response.json()) as { readonly buildId?: unknown };
    const liveBuildId = Number(published);
    return Number.isFinite(liveBuildId) && liveBuildId > 0 ? liveBuildId : 'none';
  } catch {
    return 'none';
  }
};

/**
 * Ask the server which build it renders pages for, so a page can tell a deploy
 * from a genuine failure (`#lib/stale-build-recovery`) and a live tab from a
 * stale one (`#filesystem/build-skew`). Never answered from a cache and never
 * throws; callers that ask while a request is in flight share it, and a later
 * caller asks afresh.
 *
 * @returns The live build id, `none` or `unreachable` ({@link LiveBuildAnswer}).
 */
export const askLiveBuild = async (): Promise<LiveBuildAnswer> => {
  const settle = async (): Promise<LiveBuildAnswer> => {
    try {
      return await requestLiveBuild();
    } finally {
      liveBuildRequest = undefined;
    }
  };
  liveBuildRequest ??= settle();
  return liveBuildRequest;
};
