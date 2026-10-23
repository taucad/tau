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
 *   runs the target build, so a deploy that cannot serve its own chunks never loops; and
 *   a tab makes at most `autoReloadBudget` automatic reloads per `autoReloadBudgetWindow`,
 *   never cleared on arrival, so a rolling deploy whose edges disagree cannot either.
 * - A different build otherwise: the sidebar update control (`BrowserUpdate`) or banner
 *   offers the reload (`superseded`). Writes go on: in a lone tab no other bundle shares
 *   storage, and another tab's bundle stops them through `build-skew`'s channel.
 *
 * The recovery asks no server itself: `build-skew` owns every `/health/build` answer and the
 * verdict it supports (`live`, `replaced`, `unknown`, with the same confirmation rule both ways),
 * and every outcome here derives from that one state. Neither deploy outcome is a bug to report.
 * One failure is decided once, however many channels (boundary, global handler, Sentry) report it;
 * when the verdict turns `live`, every failure a deploy explained becomes genuine at once and is
 * reported once (Sentry through `onGenuineFailure`, analytics through
 * {@link subscribeGenuineFailures}); `classify` then lets Sentry's own events through. A genuine
 * failure a boundary caught is reported the same way, since no global handler hears it. The
 * route error page only displays the outcome.
 */

import { Topic } from '@taucad/events';
import {
  buildId,
  offerReload,
  queryLiveBuild,
  readServerVerdict,
  readSupersedingBuildId,
  subscribeServerVerdict,
} from '#filesystem/build-skew.js';
import type { ServerVerdict } from '#filesystem/build-skew.js';
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
  /** The page's single owner of server answers (`build-skew`); every verdict here derives from it. */
  readonly liveBuild: LiveBuildSource;
  /** Per-tab storage for the reload guard; `undefined` where none is available. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** Hard-reload the document. */
  readonly reload: () => void;
  /** Hand the reload over to the update control, with the build id the server reported. */
  readonly onSuperseded: (serverBuildId: number) => void;
  /**
   * Report a failure decided genuine (`current`), to each destination at most once. Analytics hears
   * every genuine failure, wherever it was caught. Sentry hears it here only when nothing else
   * reports it: a boundary caught it, or a deploy first explained it (so `classify` dropped
   * Sentry's own event) and the server then took that back. A global listener's genuine failure
   * reaches Sentry through Sentry's own handler.
   */
  readonly onGenuineFailure?: (failure: unknown, destinations: GenuineReportDestinations) => void;
  /** Whether a reload cannot lose user work: nothing has been done on the page since it loaded. */
  readonly canReloadSafely: () => boolean;
  /** Milliseconds a reload may take before it is called stalled; defaults to {@link reloadTimeout}. */
  readonly reloadTimeout?: number;
  /** The wall clock, for the reload budget across page loads; defaults to `Date.now`. */
  readonly now?: () => number;
};

/**
 * What the recovery reads from the page's one owner of server answers (`build-skew`): it asks no
 * server itself, so its verdicts and the skew guard's can never disagree.
 */
export type LiveBuildSource = {
  /** Ask the server (once, shared with every concurrent caller) and apply the answer. Never rejects. */
  readonly query: () => Promise<void>;
  /** What the server last said about this build, after the confirmation rule. */
  readonly readVerdict: () => ServerVerdict;
  /** The build the server named instead, while the verdict is `replaced`. */
  readonly readReplacingBuild: () => number;
  /** Subscribe to each change of the verdict. */
  readonly subscribe: (listener: () => void) => () => void;
};

/** Where one genuine failure's report goes this time: each destination hears a failure once. */
export type GenuineReportDestinations = { readonly sentry: boolean; readonly analytics: boolean };

/**
 * The channel a failure arrived through. Whether Sentry captures that channel itself decides
 * whether the recovery must report a genuine failure to Sentry:
 *
 * | Channel                                   | Source     | Sentry captures it?                            |
 * | ----------------------------------------- | ---------- | ---------------------------------------------- |
 * | `window` `error`                          | `global`   | Yes (`GlobalHandlers` `onerror`)               |
 * | `window` `unhandledrejection`             | `global`   | Yes (`GlobalHandlers` `onunhandledrejection`)  |
 * | `window` `vite:preloadError`              | `preload`  | No: a Vite event Sentry never listens to       |
 * | React boundary (route page, `onCaughtError`) | `boundary` | No: a caught error reaches no global handler |
 *
 * Vite rethrows a preload failure into the import that asked for it, so a `preload` sighting is
 * usually followed by a `boundary` or `unhandledrejection` one; the recovery waits
 * {@link preloadFollowUpDelay} for it before deciding Sentry has not seen the failure.
 */
export type FailureSource = 'boundary' | 'global' | 'preload';

/** Whether Sentry's own handlers capture failures from each channel (see {@link FailureSource}). */
const capturedBySentry: Readonly<Record<FailureSource, boolean>> = { global: true, preload: false, boundary: false };

/** Milliseconds a failure only `vite:preloadError` reported waits for the channel Vite rethrows it into. */
export const preloadFollowUpDelay = 1000;

/** Automatic reloads one tab may make within {@link autoReloadBudgetWindow}, however its builds move. */
export const autoReloadBudget = 2;

/** Milliseconds over which {@link autoReloadBudget} counts automatic reloads. */
export const autoReloadBudgetWindow = 10 * 60_000;

/** `sessionStorage` key holding this tab's recent automatic reload times; never cleared on arrival. */
export const autoReloadTimesKey = 'tau-stale-build-auto-reloads';

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
  const { liveBuild } = options;
  /** Everything known about one failure. */
  type FailureRecord = {
    /** The decision, made (and acted on) once. */
    decision?: Promise<StaleBuildOutcome>;
    /** The settled outcome; `current` never changes again. */
    outcome?: StaleBuildOutcome;
    /** Channels it arrived through ({@link FailureSource}). */
    readonly sources: Set<FailureSource>;
    /** `classify` called it a deploy's, so Sentry dropped its event. */
    droppedBySentry: boolean;
    reportedToSentry: boolean;
    reportedToAnalytics: boolean;
    /** Waiting for the channel Vite rethrows a preload failure into. */
    preloadWait?: ReturnType<typeof setTimeout>;
    /** The wait is over: no channel Sentry captures followed the preload failure. */
    preloadSettled: boolean;
  };
  const records = new WeakMap<WeakKey, FailureRecord>();
  const recordOf = (failure: WeakKey): FailureRecord => {
    let record = records.get(failure);
    if (record === undefined) {
      record = {
        sources: new Set(),
        droppedBySentry: false,
        reportedToSentry: false,
        reportedToAnalytics: false,
        preloadSettled: false,
      };
      records.set(failure, record);
    }
    return record;
  };
  /**
   * Failures a deploy explains (decided, or only classified), re-derived together when the verdict
   * turns `live`. Iterated, because a failure no page displays (`onCaughtError`, a global listener,
   * a Sentry-only one) must still be reported then; held weakly, so it pins no error.
   */
  const explained = new Set<WeakRef<WeakKey>>();
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const outcomeTopic = new Topic<void>({ name: 'stale-build-outcomes' });
  let reloadState: ReloadState = 'idle';
  const reloadStateTopic = new Topic<void>({ name: 'stale-build-reload' });
  // Read through a call, so a check after an `await` sees a reload another failure started meanwhile.
  const readReloadState = (): ReloadState => reloadState;
  const setReloadState = (next: ReloadState): void => {
    if (next !== reloadState) {
      reloadState = next;
      reloadStateTopic.emit();
    }
  };

  /** Whether Sentry still needs the recovery's report of a genuine failure (see {@link FailureSource}). */
  const sentryNeedsReport = (record: FailureRecord): boolean =>
    record.droppedBySentry || ![...record.sources].some((source) => capturedBySentry[source]);

  /** Report a genuine failure to analytics, and to Sentry if it has not seen it, each at most once. */
  const reportGenuine = (failure: WeakKey): void => {
    const record = recordOf(failure);
    if (record.outcome !== 'current') {
      return;
    }
    const onlyPreload = record.sources.size > 0 && [...record.sources].every((source) => source === 'preload');
    // Vite rethrows a preload failure into the import that asked; give that channel the chance first.
    const isAwaitingFollowUp = onlyPreload && !record.preloadSettled && !record.droppedBySentry;
    if (isAwaitingFollowUp) {
      record.preloadWait ??= setTimeout(() => {
        record.preloadWait = undefined;
        record.preloadSettled = true;
        reportGenuine(failure);
      }, preloadFollowUpDelay);
    }
    const sentry = !isAwaitingFollowUp && sentryNeedsReport(record) && !record.reportedToSentry;
    const analytics = !record.reportedToAnalytics;
    if (!sentry && !analytics) {
      return;
    }
    record.reportedToSentry ||= sentry;
    record.reportedToAnalytics = true;
    options.onGenuineFailure?.(failure, { sentry, analytics });
  };

  /** Record a settled decision against the live verdict now; a genuine one is reported. */
  const settle = (failure: WeakKey, decided: StaleBuildOutcome): void => {
    const record = recordOf(failure);
    const outcome = decided !== 'current' && liveBuild.readVerdict() === 'live' ? 'current' : decided;
    if (outcome !== decided) {
      record.decision = Promise.resolve('current');
      // Sentry heard (if at all) a deploy's failure and dropped it: this report is the one that stands.
      record.droppedBySentry = true;
    }
    record.outcome = outcome;
    if (outcome === 'current') {
      reportGenuine(failure);
    } else {
      explained.add(new WeakRef(failure));
    }
    outcomeTopic.emit();
  };

  /* The server names this build: no deploy explains anything. Every explained failure becomes genuine
   * at once, and this page's own reload stops waiting to be called stalled. */
  liveBuild.subscribe(() => {
    if (liveBuild.readVerdict() !== 'live') {
      return;
    }
    clearTimeout(stallTimer);
    stallTimer = undefined;
    setReloadState('idle');
    if (explained.size === 0) {
      return;
    }
    for (const reference of explained) {
      const failure = reference.deref();
      if (failure !== undefined) {
        const record = recordOf(failure);
        record.decision = Promise.resolve('current');
        record.outcome = 'current';
        // Sentry dropped it as a deploy's, or never heard it: this report is the one that stands.
        record.droppedBySentry = true;
        reportGenuine(failure);
      }
    }
    explained.clear();
    outcomeTopic.emit();
  });

  const now = options.now ?? Date.now;

  /**
   * Spend one automatic reload from this tab's budget, or refuse. The `from>to` guard stops one
   * pair looping; the budget stops a rolling deploy whose edges disagree (B, C, B, …) from reloading
   * an untouched page back and forth, since each arrival clears the guard but never the budget.
   */
  const spendAutoReload = (storage: NonNullable<StaleBuildRecoveryOptions['storage']>): boolean => {
    const at = now();
    const recent = (JSON.parse(storage.getItem(autoReloadTimesKey) ?? '[]') as unknown[]).filter(
      (time): time is number => typeof time === 'number' && at - time < autoReloadBudgetWindow,
    );
    if (recent.length >= autoReloadBudget) {
      return false;
    }
    storage.setItem(autoReloadTimesKey, JSON.stringify([...recent, at]));
    return true;
  };

  const supersede = (serverBuildId: number): StaleBuildOutcome => {
    options.onSuperseded(serverBuildId);
    return 'superseded';
  };

  /** Whether a deploy replaced this build, by the live verdict after one shared question. */
  const isReplaced = async (): Promise<boolean> => {
    if (options.buildId === 0) {
      return false;
    }
    await liveBuild.query();
    return liveBuild.readVerdict() === 'replaced';
  };

  const decide = async (): Promise<StaleBuildOutcome> => {
    // A failure while this page's own reload is under way shares its explanation, whatever the server says now.
    if (readReloadState() === 'pending') {
      return 'reloading';
    }
    const replaced = await isReplaced();
    if (readReloadState() === 'pending') {
      return 'reloading';
    }
    if (!replaced) {
      return 'current';
    }
    const serverBuildId = liveBuild.readReplacingBuild();
    if (!options.canReloadSafely() || options.storage === undefined) {
      return supersede(serverBuildId);
    }
    const { storage } = options;
    const guard = guardFor(options.buildId, serverBuildId);
    try {
      if (storage.getItem(staleBuildReloadKey) === guard || !spendAutoReload(storage)) {
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
     * never another automatic one. Before offering, the server is asked again; if it names this build,
     * the verdict subscription has already decided everything genuine and ended the wait. */
    stallTimer = setTimeout(() => {
      stallTimer = undefined;
      const offerIfStillReplaced = async (): Promise<void> => {
        await liveBuild.query();
        if (readReloadState() !== 'pending') {
          return;
        }
        // No answer keeps the explanation the deploy gave: only the server naming this build takes it back.
        setReloadState('stalled');
        options.onSuperseded(liveBuild.readReplacingBuild());
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
      const record = recordOf(failure);
      const isNewChannel = !record.sources.has(source);
      record.sources.add(source);
      if (isNewChannel && record.outcome === 'current') {
        // A later channel may be the one Sentry never captures: reporting follows every channel seen.
        reportGenuine(failure);
      }
      if (record.decision === undefined) {
        const decided = decide();
        record.decision = decided;
        // async-iife: bootstrap -- the settled outcome is published once the decision lands.
        void (async () => {
          const outcome = await decided;
          // A later decision (the server took a deploy's reason back) has replaced this one meanwhile.
          if (record.decision === decided) {
            settle(failure, outcome);
          }
        })();
      }
      return record.decision;
    },
    async classify(failure) {
      if (!isKey(failure)) {
        return (await isReplaced()) ? 'superseded' : 'current';
      }
      const known = records.get(failure)?.decision;
      const outcome = known === undefined ? ((await isReplaced()) ? 'superseded' : 'current') : await known;
      if (outcome !== 'current') {
        recordOf(failure).droppedBySentry = true;
        if (known === undefined) {
          // Only Sentry saw it: re-derived with the decided ones when the server names this build.
          explained.add(new WeakRef(failure));
        }
      }
      return outcome;
    },
    readOutcome: (failure) => (isKey(failure) ? records.get(failure)?.outcome : undefined),
    subscribeOutcomes: (listener) => outcomeTopic.subscribe(listener),
    readReloadState,
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
    // `build-skew` asks the server for everyone; failures that arrive together share one request.
    liveBuild: {
      query: queryLiveBuild,
      readVerdict: readServerVerdict,
      readReplacingBuild: readSupersedingBuildId,
      subscribe: subscribeServerVerdict,
    },
    storage: readSessionStorage(),
    reload: () => {
      globalThis.location.reload();
    },
    // A lone tab keeps writing until the user reloads; other bundles stop it through `build-skew`'s own channel.
    onSuperseded: offerReload,
    onGenuineFailure: (failure, { sentry, analytics }) => {
      if (sentry) {
        void reportUiError(failure);
      }
      if (analytics) {
        genuineForAnalytics.push(failure);
        genuineFailureTopic.emit();
      }
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
  const recoverFrom = (failure: unknown, source: FailureSource): void => {
    if (isStaleModuleError(failure)) {
      // async-iife: bootstrap -- an event listener cannot await; the decision acts on its own.
      void recoverFromStaleBuild(failure, source);
    }
  };
  const onPreloadError = (event: Event): void => {
    recoverFrom((event as Event & { payload?: unknown }).payload, 'preload');
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    recoverFrom(event.reason, 'global');
  };
  const onError = (event: ErrorEvent): void => {
    recoverFrom(event.error, 'global');
  };
  const failureListeners = [
    ['vite:preloadError', onPreloadError],
    ['unhandledrejection', onRejection],
    ['error', onError],
  ] as const;
  const inputTypes = ['pointerdown', 'keydown', 'input', 'paste', 'drop', 'dragenter', 'wheel', 'touchstart'] as const;
  let inputWindow: ReturnType<typeof setTimeout> | undefined;
  /* Any of these may be the start of work a reload would lose; count them all, whoever dispatched
   * them. Only the first matters, and none after the auto-reload window, so the listeners go then. */
  const stopWatchingInput = (): void => {
    clearTimeout(inputWindow);
    inputWindow = undefined;
    for (const type of inputTypes) {
      globalThis.removeEventListener(type, onInput, { capture: true });
    }
  };
  function onInput(): void {
    hasUserInteracted = true;
    stopWatchingInput();
  }
  for (const type of inputTypes) {
    globalThis.addEventListener(type, onInput, { capture: true });
  }
  inputWindow = setTimeout(stopWatchingInput, Math.max(0, autoReloadWindow - performance.now()));
  for (const [type, listener] of failureListeners) {
    globalThis.addEventListener(type, listener as EventListener, { capture: true });
  }
  return () => {
    stopWatchingInput();
    for (const [type, listener] of failureListeners) {
      globalThis.removeEventListener(type, listener as EventListener, { capture: true });
    }
  };
};
