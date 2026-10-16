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
