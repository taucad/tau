/**
 * Version-skew recovery for a page whose build a deploy replaced (TAU-UI-6).
 *
 * Every deploy publishes a new set of content-hashed chunks and the previous
 * set stops being served: a missing `/assets/*` URL answers `404 text/html`.
 * A page that loaded just before the deploy still holds the old chunk URLs,
 * so its next lazy import fails. Browsers word that failure differently and
 * give it no stack: WebKit says "Importing a module script failed.", Chromium
 * "Failed to fetch dynamically imported module", Firefox "error loading
 * dynamically imported module", and Vite's preloader "Unable to preload CSS".
 *
 * React Router already reloads on a failed route-module import and on a
 * `/__manifest` version mismatch; this covers every other lazy import. On such
 * a failure the page asks the server which build it runs (`/health/build`). A
 * different build means a deploy explains the failure: the page reloads once
 * into the live build, guarded per build id in `sessionStorage` so a broken
 * deploy cannot loop. When the guard is spent the build is marked superseded,
 * so the sidebar update control (`BrowserUpdate`) offers the reload instead.
 * Neither outcome is a bug to report; only a failure the live build still has
 * (`current`) is.
 */

import { buildId, markBuildSuperseded } from '#filesystem/build-skew.js';

/**
 * What a module load failure turned out to be.
 *
 * - `reloading`: a deploy replaced this build and the page is reloading into it.
 * - `superseded`: a deploy replaced this build, but this build already reloaded once; the update control now offers it.
 * - `current`: the server still runs this build (or could not say), so the failure is genuine.
 */
export type StaleBuildOutcome = 'reloading' | 'superseded' | 'current';

/** `sessionStorage` key holding the build id that last reloaded to recover; one reload per build. */
export const staleBuildReloadKey = 'tau-stale-build-reload';

/** Same-origin route that names the build the server renders pages for. */
export const buildIdentityPath = '/health/build';

const staleModuleMessages = [
  /Importing a module script failed/u,
  /Failed to fetch dynamically imported module/u,
  /error loading dynamically imported module/iu,
  /Unable to preload CSS/u,
] as const;

/**
 * Whether a caught value is a browser's failure to load a module script.
 *
 * @param error - The caught value.
 * @returns `true` for a dynamic import or Vite preload failure in any engine.
 */
export const isStaleModuleError = (error: unknown): boolean =>
  error instanceof Error && staleModuleMessages.some((pattern) => pattern.test(error.message));

/** Collaborators of {@link createStaleBuildRecovery}, injected so the decision is testable. */
export type StaleBuildRecoveryOptions = {
  /** This bundle's build id; `0` means unknown, which never reloads. */
  readonly buildId: number;
  /** The live server's build id, or `undefined` when it publishes none. May reject when unreachable. */
  readonly fetchServerBuildId: () => Promise<number | undefined>;
  /** Per-tab storage for the reload guard; `undefined` where none is available. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** Hard-reload the document. */
  readonly reload: () => void;
  /** Hand the reload over to the update control, with the build id the server reported. */
  readonly onSuperseded: (serverBuildId: number) => void;
};

/**
 * Create the recovery for one page.
 *
 * Failures that arrive together share one server probe; after a `current`
 * outcome a later failure probes again, since a deploy may land meanwhile.
 *
 * @param options - Build identity and collaborators.
 * @returns `recover`, which decides and acts on one module load failure.
 */
export const createStaleBuildRecovery = (
  options: StaleBuildRecoveryOptions,
): { readonly recover: () => Promise<StaleBuildOutcome> } => {
  let pending: Promise<StaleBuildOutcome> | undefined;

  const decide = async (): Promise<StaleBuildOutcome> => {
    if (options.buildId === 0) {
      return 'current';
    }
    const serverBuildId = await options.fetchServerBuildId().catch(() => undefined);
    if (serverBuildId === undefined || serverBuildId === options.buildId) {
      return 'current';
    }
    const ownBuild = String(options.buildId);
    try {
      if (options.storage === undefined || options.storage.getItem(staleBuildReloadKey) === ownBuild) {
        options.onSuperseded(serverBuildId);
        return 'superseded';
      }
      options.storage.setItem(staleBuildReloadKey, ownBuild);
    } catch {
      // Without a written guard nothing would stop a reload loop.
      options.onSuperseded(serverBuildId);
      return 'superseded';
    }
    options.reload();
    return 'reloading';
  };

  const settle = async (): Promise<StaleBuildOutcome> => {
    const outcome = await decide();
    if (outcome === 'current') {
      pending = undefined;
    }
    return outcome;
  };

  return {
    async recover() {
      pending ??= settle();
      return pending;
    },
  };
};

const fetchServerBuildId = async (): Promise<number | undefined> => {
  const response = await fetch(buildIdentityPath, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) {
    return undefined;
  }
  const { buildId: published } = (await response.json()) as { readonly buildId?: unknown };
  const serverBuildId = Number(published);
  return Number.isFinite(serverBuildId) && serverBuildId > 0 ? serverBuildId : undefined;
};

const readSessionStorage = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

let pageRecovery: ReturnType<typeof createStaleBuildRecovery> | undefined;

/**
 * Recover this page from a module load failure, as described above.
 *
 * @returns What the failure turned out to be; only `current` is worth reporting.
 */
export const recoverFromStaleBuild = async (): Promise<StaleBuildOutcome> => {
  pageRecovery ??= createStaleBuildRecovery({
    buildId,
    fetchServerBuildId,
    storage: readSessionStorage(),
    reload: () => {
      globalThis.location.reload();
    },
    onSuperseded: markBuildSuperseded,
  });
  return pageRecovery.recover();
};

/**
 * Recover from failures Vite's preloader reports (`vite:preloadError`), which
 * fire for a lazy chunk's missing dependencies before any boundary sees them.
 * The error still propagates to its boundary, which consults the same
 * recovery and so never reports a deploy as a bug.
 *
 * @returns Removes the listener.
 */
export const installStaleBuildRecovery = (): (() => void) => {
  const onPreloadError = (): void => {
    void recoverFromStaleBuild();
  };
  globalThis.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    globalThis.removeEventListener('vite:preloadError', onPreloadError);
  };
};
