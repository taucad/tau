/**
 * Version-skew recovery for a page whose build a deploy replaced (TAU-UI-6).
 *
 * Every deploy publishes a new set of content-hashed chunks. The deploy keeps
 * the previous builds' chunks for a while (`scripts/retain-previous-assets.mts`),
 * but a page can outlive that window, and a missing `/assets/*` URL answers
 * `404 text/html`. The page's next lazy import then fails, worded per engine
 * and without a stack: WebKit "Importing a module script failed.", Chromium
 * "Failed to fetch dynamically imported module", Firefox "error loading
 * dynamically imported module", Vite's preloader "Unable to preload CSS".
 *
 * React Router already reloads on a failed route-module import and on a
 * `/__manifest` version mismatch; this covers every other lazy import. On such
 * a failure the page asks the server which build it runs (`/health/build`):
 *
 * - The same build, or no answer: the failure is genuine (`current`) and is reported.
 * - A different build, and reloading is provably safe (the user has not touched the
 *   page since it loaded, so there is no work to lose): reload once (`reloading`).
 *   The guard is the `from>to` build pair in `sessionStorage`, cleared once the page
 *   runs the target build, so a deploy that cannot serve its own chunks never loops.
 * - A different build otherwise: the build is marked superseded and the sidebar
 *   update control (`BrowserUpdate`) or banner offers the reload (`superseded`).
 *
 * Neither deploy outcome is a bug to report. One failure is decided once, however
 * many channels (boundary, global handler, Sentry) report it.
 */

import { buildId, markBuildSuperseded } from '#filesystem/build-skew.js';

/**
 * What a module load failure turned out to be.
 *
 * - `reloading`: a deploy replaced this build and the page is reloading into it.
 * - `superseded`: a deploy replaced this build; the update control offers the reload.
 * - `current`: the server still runs this build (or could not say), so the failure is genuine.
 */
export type StaleBuildOutcome = 'reloading' | 'superseded' | 'current';

/** `sessionStorage` key holding the `from>to` build pair this tab last reloaded across. */
export const staleBuildReloadKey = 'tau-stale-build-reload';

/** Same-origin route that names the build the server renders pages for. */
export const buildIdentityPath = '/health/build';

/** Milliseconds a reload may take before the page assumes it was refused and offers it instead. */
export const reloadTimeout = 5000;

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
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** Hard-reload the document. */
  readonly reload: () => void;
  /** Hand the reload over to the update control, with the build id the server reported. */
  readonly onSuperseded: (serverBuildId: number) => void;
  /** Whether a reload cannot lose user work: nothing has been done on the page since it loaded. */
  readonly canReloadSafely: () => boolean;
  /** Milliseconds a reload may take before it is assumed refused; defaults to {@link reloadTimeout}. */
  readonly reloadTimeout?: number;
};

/** The recovery of one page. */
export type StaleBuildRecovery = {
  /** Decide, and act on, one module load failure. The same failure always gets the same answer. */
  readonly recover: (failure: unknown) => Promise<StaleBuildOutcome>;
  /** Clear the reload guard once the page runs the build it reloaded into. */
  readonly confirmArrival: () => void;
};

const guardFor = (from: number, to: number): string => `${String(from)}>${String(to)}`;

/**
 * Create the recovery for one page.
 *
 * @param options - Build identity and collaborators.
 * @returns The page's recovery.
 */
export const createStaleBuildRecovery = (options: StaleBuildRecoveryOptions): StaleBuildRecovery => {
  const decisions = new WeakMap<WeakKey, Promise<StaleBuildOutcome>>();
  let probe: Promise<number | undefined> | undefined;
  let reloadPending = false;

  const askServer = async (): Promise<number | undefined> => {
    try {
      return await options.fetchServerBuildId();
    } catch {
      return undefined;
    }
  };

  const readServerBuildId = async (): Promise<number | undefined> => {
    // Failures that arrive together share one request; a later one asks again, since a deploy may land meanwhile.
    probe ??= askServer();
    try {
      return await probe;
    } finally {
      probe = undefined;
    }
  };

  const supersede = (serverBuildId: number): StaleBuildOutcome => {
    options.onSuperseded(serverBuildId);
    return 'superseded';
  };

  const decide = async (): Promise<StaleBuildOutcome> => {
    if (options.buildId === 0) {
      return 'current';
    }
    const serverBuildId = await readServerBuildId();
    if (serverBuildId === undefined || serverBuildId === options.buildId) {
      return 'current';
    }
    if (reloadPending) {
      return 'reloading';
    }
    if (!options.canReloadSafely() || options.storage === undefined) {
      return supersede(serverBuildId);
    }
    const guard = guardFor(options.buildId, serverBuildId);
    try {
      if (options.storage.getItem(staleBuildReloadKey) === guard) {
        return supersede(serverBuildId);
      }
      options.storage.setItem(staleBuildReloadKey, guard);
    } catch {
      // Without a written guard nothing would stop a reload loop.
      return supersede(serverBuildId);
    }
    reloadPending = true;
    options.reload();
    // A page still here after the timeout had its reload refused (an unload prompt, a blocked navigation).
    setTimeout(() => {
      reloadPending = false;
      options.onSuperseded(serverBuildId);
    }, options.reloadTimeout ?? reloadTimeout);
    return 'reloading';
  };

  return {
    async recover(failure) {
      if (typeof failure !== 'object' || failure === null) {
        return decide();
      }
      let decision = decisions.get(failure);
      if (decision === undefined) {
        decision = decide();
        decisions.set(failure, decision);
      }
      return decision;
    },
    confirmArrival() {
      try {
        const target = options.storage?.getItem(staleBuildReloadKey)?.split('>')[1];
        if (target === String(options.buildId)) {
          options.storage?.removeItem(staleBuildReloadKey);
        }
      } catch {
        // No storage, no guard to clear.
      }
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

let hasUserInteracted = false;
let pageRecovery: StaleBuildRecovery | undefined;

const getPageRecovery = (): StaleBuildRecovery => {
  pageRecovery ??= createStaleBuildRecovery({
    buildId,
    fetchServerBuildId,
    storage: readSessionStorage(),
    reload: () => {
      globalThis.location.reload();
    },
    onSuperseded: markBuildSuperseded,
    canReloadSafely: () => !hasUserInteracted,
  });
  return pageRecovery;
};

/**
 * Decide what one module load failure was, and recover from it, as described above.
 *
 * @param failure - The caught value; the same value always gets the same answer.
 * @returns What the failure turned out to be; only `current` is worth reporting.
 */
export const recoverFromStaleBuild = async (failure: unknown): Promise<StaleBuildOutcome> =>
  getPageRecovery().recover(failure);

/**
 * Own recovery for the whole page, independently of error reporting: clear the
 * guard of a completed reload, note the first user input (after which a reload
 * is offered, never forced), and recover from module load failures that reach
 * Vite's preloader (`vite:preloadError`) or no handler at all. Failures a
 * boundary catches are handed over by the boundary itself.
 *
 * @returns Removes the listeners.
 */
export const installStaleBuildRecovery = (): (() => void) => {
  getPageRecovery().confirmArrival();
  const onInput = (event: Event): void => {
    if (event.isTrusted) {
      hasUserInteracted = true;
    }
  };
  const recoverFrom = (failure: unknown): void => {
    if (isStaleModuleError(failure)) {
      // async-iife: bootstrap -- an event listener cannot await; the decision acts on its own.
      void recoverFromStaleBuild(failure);
    }
  };
  const onPreloadError = (event: Event): void => {
    recoverFrom((event as Event & { payload?: unknown }).payload);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    recoverFrom(event.reason);
  };
  const onError = (event: ErrorEvent): void => {
    recoverFrom(event.error);
  };
  const listeners = [
    ['pointerdown', onInput],
    ['keydown', onInput],
    ['vite:preloadError', onPreloadError],
    ['unhandledrejection', onRejection],
    ['error', onError],
  ] as const;
  for (const [type, listener] of listeners) {
    globalThis.addEventListener(type, listener as EventListener, { capture: true });
  }
  return () => {
    for (const [type, listener] of listeners) {
      globalThis.removeEventListener(type, listener as EventListener, { capture: true });
    }
  };
};
