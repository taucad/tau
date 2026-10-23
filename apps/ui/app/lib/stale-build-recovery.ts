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
 * - A different build, and reloading cannot lose work: the page loaded within the last
 *   `autoReloadWindow` milliseconds and nobody has pointed, typed, scrolled, pasted or
 *   dropped anything on it since. Then it reloads once (`reloading`). The app has no
 *   cheap global signal for pending work (agent turns and edits flush on close, not
 *   on demand), so the window and the absence of input stand in for it.
 *   The guard is the `from>to` build pair in `sessionStorage`, cleared once the page
 *   runs the target build, so a deploy that cannot serve its own chunks never loops.
 * - A different build otherwise: the sidebar update control (`BrowserUpdate`) or banner
 *   offers the reload (`superseded`). Writes go on: in a lone tab no other bundle shares
 *   storage, and another tab's bundle stops them through `build-skew`'s channel.
 *
 * Neither deploy outcome is a bug to report. One failure is decided once, however
 * many channels (boundary, global handler, Sentry) report it, and the recovery owns that
 * decision: when the server turns out to run this build after all (`build-skew` confirms it,
 * or the stall check hears it), every failure a deploy explained is decided genuine and
 * reported once (Sentry through `onGenuineFailure`, analytics through
 * {@link subscribeGenuineFailures}); `classify` then lets Sentry's own events through. A genuine
 * failure a boundary caught is reported the same way, since no global handler hears it. The
 * route error page only displays the outcome.
 */

import { Topic } from '@taucad/events';
import { buildId, offerReload, recordLiveBuild, subscribeLiveBuildConfirmed } from '#filesystem/build-skew.js';
import { askLiveBuild } from '#lib/build-identity.js';
import { reportUiError } from '#lib/error-reporting.js';

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

/** Milliseconds after load within which an untouched page may reload on its own. */
export const autoReloadWindow = 15_000;

/**
 * Milliseconds a reload may take before the page calls it stalled and offers it instead. Generous,
 * because the old document stays until the new one commits and a slow reload looks the same as a
 * refused one: a short wait would flash the offer during an ordinary navigation.
 */
export const reloadTimeout = 15_000;

/** Where this page's own automatic reload stands: none started, waiting to leave, or stalled. */
export type ReloadState = 'idle' | 'pending' | 'stalled';

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
  /** The live server's build id, or `undefined` when it names none or cannot be reached. Never rejects. */
  readonly fetchServerBuildId: () => Promise<number | undefined>;
  /** Per-tab storage for the reload guard; `undefined` where none is available. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** Hard-reload the document. */
  readonly reload: () => void;
  /** Hand the reload over to the update control, with the build id the server reported. */
  readonly onSuperseded: (serverBuildId: number) => void;
  /** Record the build the server reported as soon as it answers, before anything is decided. */
  readonly onLiveBuild: (serverBuildId: number) => void;
  /**
   * Subscribe to each time the server turns out to run this build after all (`build-skew` back to
   * `idle`: an offer withdrawn, a rollback ended, a peer's claim refuted). Every failure a deploy
   * explained is then decided again as genuine.
   */
  readonly subscribeLiveBuildConfirmed?: (listener: () => void) => () => void;
  /**
   * Report a failure decided genuine (`current`) that nothing else reports: one a boundary caught,
   * or one a deploy first explained and the server then took back. Called once per failure.
   */
  readonly onGenuineFailure?: (failure: unknown) => void;
  /** Whether a reload cannot lose user work: nothing has been done on the page since it loaded. */
  readonly canReloadSafely: () => boolean;
  /** Milliseconds a reload may take before it is called stalled; defaults to {@link reloadTimeout}. */
  readonly reloadTimeout?: number;
};

/**
 * Where a failure was caught: by a React boundary (the route error page, `onCaughtError`), whose
 * errors reach no global handler, or by a global listener, which error reporting also hears.
 */
export type FailureSource = 'boundary' | 'global';

/** The recovery of one page. */
export type StaleBuildRecovery = {
  /**
   * Decide, and act on, one module load failure. The same failure always gets the same answer, until
   * the server names this build again and every failure a deploy explained is decided genuine.
   */
  readonly recover: (failure: unknown, source?: FailureSource) => Promise<StaleBuildOutcome>;
  /**
   * What a failure was, without acting on it: the decision already made for it, or else
   * whether a deploy explains it (`superseded`) or not (`current`). Never reloads.
   */
  readonly classify: (failure: unknown) => Promise<StaleBuildOutcome>;
  /** The settled decision for a failure, or `undefined` while none is. */
  readonly readOutcome: (failure: unknown) => StaleBuildOutcome | undefined;
  /** Subscribe to each settled or changed decision ({@link StaleBuildRecovery.readOutcome}). */
  readonly subscribeOutcomes: (listener: () => void) => () => void;
  /** Clear the reload guard once the page runs the build it reloaded into. */
  readonly confirmArrival: () => void;
  /** Where this page's own automatic reload stands. */
  readonly readReloadState: () => ReloadState;
  /** Subscribe to each change of {@link StaleBuildRecovery.readReloadState}. */
  readonly subscribeReloadState: (listener: () => void) => () => void;
};

const guardFor = (from: number, to: number): string => `${String(from)}>${String(to)}`;

const isKey = (failure: unknown): failure is WeakKey => typeof failure === 'object' && failure !== null;

/**
 * Create the recovery for one page.
 *
 * @param options - Build identity and collaborators.
 * @returns The page's recovery.
 */
export const createStaleBuildRecovery = (options: StaleBuildRecoveryOptions): StaleBuildRecovery => {
  const decisions = new WeakMap<WeakKey, Promise<StaleBuildOutcome>>();
  const outcomes = new WeakMap<WeakKey, StaleBuildOutcome>();
  const sources = new WeakMap<WeakKey, FailureSource>();
  /** Failures a deploy explains (`reloading` or `superseded`), decided again if the server takes that back. */
  const explained = new Set<WeakKey>();
  /** Failures already handed to {@link StaleBuildRecoveryOptions.onGenuineFailure}. */
  const reported = new WeakSet();
  const classifications = new WeakMap<WeakKey, Promise<StaleBuildOutcome>>();
  const outcomeTopic = new Topic<void>({ name: 'stale-build-outcomes' });
  let reloadState: ReloadState = 'idle';
  const reloadStateTopic = new Topic<void>({ name: 'stale-build-reload' });
  const setReloadState = (next: ReloadState): void => {
    if (next !== reloadState) {
      reloadState = next;
      reloadStateTopic.emit();
    }
  };

  const reportGenuine = (failure: WeakKey): void => {
    if (!reported.has(failure)) {
      reported.add(failure);
      options.onGenuineFailure?.(failure);
    }
  };

  /** Record a settled decision; a genuine one a boundary caught is reported, since nothing else will. */
  const settle = (failure: WeakKey, outcome: StaleBuildOutcome): void => {
    outcomes.set(failure, outcome);
    if (outcome === 'current') {
      if (sources.get(failure) === 'boundary') {
        reportGenuine(failure);
      }
    } else {
      explained.add(failure);
    }
    outcomeTopic.emit();
  };

  /** The server runs this build after all: every failure a deploy explained is genuine, and reported once. */
  const decideAllGenuine = (): void => {
    if (explained.size === 0) {
      return;
    }
    for (const failure of explained) {
      const current: Promise<StaleBuildOutcome> = Promise.resolve('current');
      decisions.set(failure, current);
      classifications.set(failure, current);
      outcomes.set(failure, 'current');
      reportGenuine(failure);
    }
    explained.clear();
    outcomeTopic.emit();
  };
  options.subscribeLiveBuildConfirmed?.(decideAllGenuine);

  const supersede = (serverBuildId: number): StaleBuildOutcome => {
    options.onSuperseded(serverBuildId);
    return 'superseded';
  };

  /**
   * The build a deploy replaced this one with, or `undefined` when the failure is this build's own:
   * the server named no build, or named this one.
   */
  const replacingBuild = (serverBuildId: number | undefined): number | undefined =>
    serverBuildId === undefined || serverBuildId === options.buildId ? undefined : serverBuildId;

  /** Ask the server, and say which build (if any) replaced this one. A bundle without an id asks nothing. */
  const askServer = async (): Promise<{
    readonly answer: number | undefined;
    readonly replacing: number | undefined;
  }> => {
    if (options.buildId === 0) {
      return { answer: undefined, replacing: undefined };
    }
    const answer = await options.fetchServerBuildId();
    return { answer, replacing: replacingBuild(answer) };
  };

  /** Pass a server answer on, even one naming this build, which withdraws an offer a stale deploy left. */
  const passOn = (answer: number | undefined): void => {
    if (answer !== undefined) {
      options.onLiveBuild(answer);
    }
  };

  const decide = async (): Promise<StaleBuildOutcome> => {
    const { answer, replacing: serverBuildId } = await askServer();
    passOn(answer);
    if (serverBuildId === undefined) {
      return 'current';
    }
    if (reloadState === 'pending') {
      return 'reloading';
    }
    if (!options.canReloadSafely() || options.storage === undefined) {
      return supersede(serverBuildId);
    }
    const { storage } = options;
    const guard = guardFor(options.buildId, serverBuildId);
    try {
      if (storage.getItem(staleBuildReloadKey) === guard) {
        return supersede(serverBuildId);
      }
      storage.setItem(staleBuildReloadKey, guard);
    } catch {
      // Without a written guard nothing would stop a reload loop.
      return supersede(serverBuildId);
    }
    setReloadState('pending');
    options.reload();
    /* A page still here after the timeout is stalled: the reload was refused or is only slow, and no
     * signal tells the two apart (the old document lives until the new one commits; Tau registers no
     * unload prompt, `use-flush-on-close`). The guard stays, and later failures are offered the reload,
     * never another automatic one. Before offering, the server is asked again: if it names this build
     * by now, every failure the reload covered is decided genuine instead. */
    setTimeout(() => {
      const offerIfStillReplaced = async (): Promise<void> => {
        const { answer, replacing: stillReplacing } = await askServer();
        passOn(answer);
        if (stillReplacing === undefined) {
          setReloadState('idle');
          decideAllGenuine();
          return;
        }
        setReloadState('stalled');
        options.onSuperseded(stillReplacing);
      };
      // async-iife: bootstrap -- a timer cannot await; the check acts on its own.
      void offerIfStillReplaced();
    }, options.reloadTimeout ?? reloadTimeout);
    return 'reloading';
  };

  return {
    async recover(failure, source = 'boundary') {
      if (!isKey(failure)) {
        return decide();
      }
      if (!sources.has(failure)) {
        sources.set(failure, source);
      }
      let decision = decisions.get(failure);
      if (decision === undefined) {
        decision = decide();
        decisions.set(failure, decision);
        const decided = decision;
        // async-iife: bootstrap -- the settled outcome is published once the decision lands.
        void (async () => {
          const outcome = await decided;
          // A later decision (the server took a deploy's reason back) has replaced this one meanwhile.
          if (decisions.get(failure) === decided) {
            settle(failure, outcome);
          }
        })();
      }
      return decision;
    },
    async classify(failure) {
      const key = isKey(failure) ? failure : undefined;
      const known = key === undefined ? undefined : (decisions.get(key) ?? classifications.get(key));
      if (known !== undefined) {
        return known;
      }
      const classification = (async (): Promise<StaleBuildOutcome> => {
        const { replacing } = await askServer();
        return replacing === undefined ? 'current' : 'superseded';
      })();
      if (key !== undefined) {
        classifications.set(key, classification);
      }
      return classification;
    },
    readOutcome: (failure) => (isKey(failure) ? outcomes.get(failure) : undefined),
    subscribeOutcomes: (listener) => outcomeTopic.subscribe(listener),
    readReloadState: () => reloadState,
    subscribeReloadState: (listener) => reloadStateTopic.subscribe(listener),
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

const readSessionStorage = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

let hasUserInteracted = false;
let pageRecovery: StaleBuildRecovery | undefined;

/** Genuine failures analytics has not heard of yet; drained by {@link subscribeGenuineFailures}. */
const genuineForAnalytics: unknown[] = [];
const genuineFailureTopic = new Topic<void>({ name: 'stale-build-genuine' });

/**
 * Hear each module load failure the recovery decided genuine and reports (`onGenuineFailure`), for
 * analytics, which lives in React context. Failures decided before anyone listened are delivered
 * on subscribing; each is delivered once.
 *
 * @param listener - Called once per genuine failure.
 * @returns Unsubscribes.
 */
export const subscribeGenuineFailures = (listener: (failure: unknown) => void): (() => void) => {
  const drain = (): void => {
    for (const failure of genuineForAnalytics.splice(0)) {
      listener(failure);
    }
  };
  drain();
  return genuineFailureTopic.subscribe(drain);
};

const getPageRecovery = (): StaleBuildRecovery => {
  pageRecovery ??= createStaleBuildRecovery({
    buildId,
    // Failures that arrive together share one request (`askLiveBuild` coalesces callers); a later one asks again.
    fetchServerBuildId: async () => {
      const answer = await askLiveBuild();
      return typeof answer === 'number' ? answer : undefined;
    },
    storage: readSessionStorage(),
    reload: () => {
      globalThis.location.reload();
    },
    // A lone tab keeps writing until the user reloads; other bundles stop it through `build-skew`'s own channel.
    onSuperseded: offerReload,
    onLiveBuild: recordLiveBuild,
    subscribeLiveBuildConfirmed,
    onGenuineFailure: (failure) => {
      void reportUiError(failure);
      genuineForAnalytics.push(failure);
      genuineFailureTopic.emit();
    },
    canReloadSafely: () => !hasUserInteracted && performance.now() <= autoReloadWindow,
  });
  return pageRecovery;
};

/**
 * Decide what one module load failure was, and recover from it, as described above. The recovery
 * reports the failure itself once it is decided genuine; callers only display the outcome.
 *
 * @param failure - The caught value; the same value always gets the same answer until the server names this build.
 * @param source - A boundary caught it (the default), or a global listener, which error reporting also hears.
 * @returns What the failure turned out to be so far ({@link readStaleBuildOutcome} follows later changes).
 */
export const recoverFromStaleBuild = async (
  failure: unknown,
  source: FailureSource = 'boundary',
): Promise<StaleBuildOutcome> => getPageRecovery().recover(failure, source);

/**
 * The settled decision for a failure ({@link recoverFromStaleBuild}), for display.
 *
 * @param failure - The caught value.
 * @returns Its outcome, or `undefined` while it is being decided.
 */
export const readStaleBuildOutcome = (failure: unknown): StaleBuildOutcome | undefined =>
  getPageRecovery().readOutcome(failure);

/**
 * Subscribe to each settled or changed decision ({@link readStaleBuildOutcome}).
 *
 * @param listener - Called after each change.
 * @returns Unsubscribes.
 */
export const subscribeStaleBuildOutcomes = (listener: () => void): (() => void) =>
  getPageRecovery().subscribeOutcomes(listener);

/**
 * Where this page's own automatic reload stands ({@link ReloadState}).
 *
 * @returns `pending` while waiting to leave, `stalled` once it has not left in time.
 */
export const readReloadState = (): ReloadState => getPageRecovery().readReloadState();

/**
 * Subscribe to each change of {@link readReloadState}.
 *
 * @param listener - Called after each change.
 * @returns Unsubscribes.
 */
export const subscribeReloadState = (listener: () => void): (() => void) =>
  getPageRecovery().subscribeReloadState(listener);

/**
 * What one module load failure was, for an error reporter: the decision the page already
 * made, or a classification that never reloads or supersedes anything.
 *
 * @param failure - The caught value.
 * @returns `current` when the failure is worth reporting.
 */
export const classifyStaleBuildFailure = async (failure: unknown): Promise<StaleBuildOutcome> =>
  getPageRecovery().classify(failure);

/**
 * Hand a module load failure any React error boundary caught to the recovery (`hydrateRoot`'s
 * `onCaughtError`). Boundaries other than the route's (a panel, a dialog) would otherwise keep a
 * rejected lazy import on screen with nothing to replace it. The decision is made once per failure,
 * so the route error page asking again is free.
 *
 * @param error - The value a boundary caught.
 */
export const recoverFromCaughtError = (error: unknown): void => {
  if (isStaleModuleError(error)) {
    // async-iife: bootstrap -- React's error callback cannot await; the decision acts on its own.
    void recoverFromStaleBuild(error);
  }
};

/**
 * Own recovery for the whole page, independently of error reporting: clear the
 * guard of a completed reload, note the first user input of any kind (after which
 * a reload is offered, never forced), and recover from module load failures that reach
 * Vite's preloader (`vite:preloadError`) or no handler at all. Failures a
 * boundary catches are handed over by the boundary itself.
 *
 * @returns Removes the listeners.
 */
export const installStaleBuildRecovery = (): (() => void) => {
  getPageRecovery().confirmArrival();
  // Any of these may be the start of work a reload would lose; count them all, whoever dispatched them.
  const onInput = (): void => {
    hasUserInteracted = true;
  };
  const recoverFrom = (failure: unknown): void => {
    if (isStaleModuleError(failure)) {
      // async-iife: bootstrap -- an event listener cannot await; the decision acts on its own.
      void recoverFromStaleBuild(failure, 'global');
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
    ...(['pointerdown', 'keydown', 'input', 'paste', 'drop', 'dragenter', 'wheel', 'touchstart'] as const).map(
      (type) => [type, onInput] as const,
    ),
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
