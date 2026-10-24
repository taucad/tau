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
 * and every outcome here derives from that one state, once: a later verdict (a rollback ending)
 * never turns a failure a deploy explained into a bug report. The one provisional outcome is
 * `reloading`: it settles when the page actually leaves; a reload that stalls decides what it
 * covered again (offered, or genuine once the server names this build). One failure is decided once, however
 * many channels report it. The error tracker hears every chunk failure, explained or not (its own
 * handlers, or `reportToErrorTracker` for channels it does not capture), and `beforeSend` tags it
 * `stale_build` = `superseded` | `current` | `unknown` instead of dropping it, since Sentry discards
 * a second capture of an error it has seen. Analytics hears a failure decided `current` once, at
 * decision time ({@link subscribeGenuineFailures}). The route error page only displays the outcome.
 */

import { Topic } from '@taucad/events';
import {
  buildId,
  lookupBudget,
  offerReload,
  queryLiveBuild,
  readServerVerdict,
  readSupersedingBuildId,
} from '#filesystem/build-skew.js';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import {
  isErrorTrackerListening,
  isSdkLoadFailure,
  reportUiError,
  sendWaitingErrors,
  setErrorDescriber,
} from '#lib/error-reporting.js';
import { isPageHidden, notePageHide, notePageShow } from '#lib/page-visibility.js';
import { readSessionStorage } from '#lib/session-storage.js';
import { isWeakKey } from '#lib/weak-key.js';

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
   * Hand a failure to the error tracker, once, when no channel it arrived through is one the tracker
   * captures itself (see {@link FailureSource}). Every chunk failure goes, whatever its outcome:
   * the tracker's `beforeSend` tags it ({@link StaleBuildTag}) rather than the page dropping it.
   */
  readonly reportToErrorTracker?: (failure: unknown) => void;
  /** Tell analytics, once, of a failure decided genuine (`current`) when it was decided. */
  readonly onGenuineFailure?: (failure: unknown) => void;
  /**
   * Whether the error tracker's own global handlers are installed now: a `global` failure before
   * that (at boot) reaches no handler, so the recovery reports it itself. Defaults to listening.
   */
  readonly isErrorTrackerListening?: () => boolean;
  /**
   * Whether a value is the error tracker's own failed load ({@link FailureSource} `sdk`): a boolean
   * when that is known now, else a promise that settles once the load does. Asked of a failure
   * Vite's preloader reports first, so the SDK's own import failing is never reported whichever
   * arrives first, the loader's hand-over or a fast verdict. Defaults to never.
   */
  readonly isSdkLoadFailure?: (failure: unknown) => boolean | Promise<boolean>;
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
};

/**
 * What the error tracker is told about a chunk failure, as a tag (`stale_build`): a deploy explains
 * it (`superseded`), the live build still has the failure (`current`), the server did not say
 * (`unknown`), or the page was hidden while its decision was still being made, so the event went
 * before there was one (`undecided`). Operators filter on it; the page never drops the event.
 */
export type StaleBuildTag = 'superseded' | 'current' | 'unknown' | 'undecided';

/**
 * The channel a failure arrived through. Whether Sentry captures that channel itself decides
 * whether the recovery hands the failure to Sentry (`reportToErrorTracker`), whatever its outcome;
 * `beforeSend` then tags every chunk failure with its {@link StaleBuildTag} and drops none:
 *
 * | Channel                                   | Source     | Sentry captures it?                            |
 * | ----------------------------------------- | ---------- | ---------------------------------------------- |
 * | `window` `error`                          | `global`   | Yes (`GlobalHandlers` `onerror`)               |
 * | `window` `unhandledrejection`             | `global`   | Yes (`GlobalHandlers` `onunhandledrejection`)  |
 * | `window` `vite:preloadError`              | `preload`  | No: a Vite event Sentry never listens to       |
 * | React boundary (route page, `onCaughtError`) | `boundary` | No: a caught error reaches no global handler |
 * | The error tracker's own SDK failing to load | `sdk`      | Never reported: there is nothing to report it with |
 *
 * An `sdk` sighting decides for the failure whatever else saw it: Vite's preload helper wraps the
 * SDK's import too, so it dispatches the same value (`preload`) before rethrowing it into the loader.
 * Which is the SDK's is not left to the order they arrive in: a `preload` sighting asks the loader
 * (`isSdkLoadFailure`), and nothing is reported for it, to the tracker or to analytics, until the
 * answer is in (at most {@link preloadFollowUpDelay}: the loader hears its import fail in the task
 * Vite dispatches it, so a load still pending that long did not fail with this value).
 *
 * Vite rethrows a preload failure into the import that asked for it, so a `preload` sighting is
 * usually followed by a `boundary` or `unhandledrejection` one; the recovery waits
 * {@link preloadFollowUpDelay} for it before deciding Sentry has not seen the failure. Analytics
 * hears each failure decided `current` once, at decision time, wherever it was caught, except an
 * `sdk` one: the SDK's chunk failing on a build the server still runs (a content blocker) ends with
 * one console warning, never as a genuine failure.
 */
export type FailureSource = 'boundary' | 'global' | 'preload' | 'sdk';

/** Whether Sentry's own handlers capture failures from each channel (see {@link FailureSource}). */
const capturedBySentry: Readonly<Record<FailureSource, boolean>> = {
  global: true,
  preload: false,
  boundary: false,
  sdk: false,
};

/**
 * Whether a failure is the error tracker's own load failing ({@link FailureSource} `sdk`): never
 * reported, to the tracker or to analytics, whichever other channel also saw it.
 */
const isSdkLoad = (sources: ReadonlySet<FailureSource>): boolean => sources.has('sdk');

/**
 * Milliseconds the error tracker's `beforeSend` waits for a failure's decision before tagging it with
 * what is known, from the whole chain a decision can take: its own lookup, a reload's wait to stall
 * ({@link reloadTimeout}, during which a `reloading` outcome is provisional), the stall check's
 * lookup, and a margin for the decision's own work. The page leaving settles every wait at once.
 */
export const staleBuildTagWait = lookupBudget + reloadTimeout + lookupBudget + 2000;

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
   * Decide, and act on, one module load failure. The same failure always gets the same answer: a
   * later verdict (a rollback ending) never turns a failure a deploy explained into a bug report.
   * The exception is `reloading`, which is provisional: it settles when the page leaves, and a
   * reload that stalls decides what it covered again (`superseded`, or `current` once the server
   * names this build).
   */
  readonly recover: (failure: unknown, source?: FailureSource) => Promise<StaleBuildOutcome>;
  /**
   * What the error tracker should be told about a failure ({@link StaleBuildTag}), without acting
   * on it: from the decision already made for it, or else from the live verdict. Never reloads.
   */
  readonly classify: (failure: unknown) => StaleBuildTag;
  /**
   * The tag once the failure's decision settles, waiting at most `bound` milliseconds; then what is
   * known. Passive: it starts no question, it only waits for the decision under way.
   */
  readonly classifySettled: (failure: unknown, bound?: number) => Promise<StaleBuildTag>;
  /**
   * The tag to send now, without waiting: `undecided` while the failure's decision is still being
   * made (a provisional `reloading` included), else {@link StaleBuildRecovery.classify}.
   */
  readonly tagNow: (failure: unknown) => StaleBuildTag;
  /**
   * The page has just been hidden (the document turning hidden, and every `pagehide`, kept in the
   * back/forward cache or not): a hidden page may be frozen or discarded and never run again, so
   * every wait for a decision ends now (tagged {@link StaleBuildRecovery.tagNow}), and failures only
   * Vite's preloader reported go to the tracker now, or, one that may still be the tracker's own
   * load, as soon as the loader answers. While the page is hidden (`isPageHidden`, the page's one
   * answer, which error reporting reads too) no wait starts; once it is visible, waits work as usual.
   */
  readonly flush: () => void;
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
  /**
   * The page is really going (a `pagehide` not kept in the back/forward cache): a pending reload
   * happened, so what it covered settles as `reloading`, and nothing is decided again.
   */
  readonly leave: () => void;
};

const guardFor = (from: number, to: number): string => `${String(from)}>${String(to)}`;

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
    /** The outcome, which never changes once settled. */
    outcome?: StaleBuildOutcome;
    /** `reloading` until the page leaves; a stalled reload decides it again. */
    provisional: boolean;
    /** The verdict the outcome rested on, for the error tracker's tag. */
    verdict?: ServerVerdict;
    /** Channels it arrived through ({@link FailureSource}). */
    readonly sources: Set<FailureSource>;
    /** A sighting came through a channel the error tracker was capturing at that moment. */
    seenByTracker: boolean;
    reportedToErrorTracker: boolean;
    reportedToAnalytics: boolean;
    /** Waiting for the channel Vite rethrows a preload failure into. */
    preloadWait?: ReturnType<typeof setTimeout>;
    /**
     * Whether the failure may still turn out to be the error tracker's own load: a `preload`
     * sighting while the loader's answer is not in. Nothing is reported for it meanwhile.
     */
    isSdkLoadPending: boolean;
    /** Settles once {@link FailureRecord.isSdkLoadPending} is over; `undefined` when it never was. */
    sdkLoadKnown?: Promise<void>;
  };
  const records = new WeakMap<WeakKey, FailureRecord>();
  const recordOf = (failure: WeakKey): FailureRecord => {
    let record = records.get(failure);
    if (record === undefined) {
      record = {
        sources: new Set(),
        provisional: false,
        seenByTracker: false,
        reportedToErrorTracker: false,
        reportedToAnalytics: false,
        isSdkLoadPending: false,
      };
      records.set(failure, record);
    }
    return record;
  };
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

  const isCapturedBySentry = (record: FailureRecord): boolean => record.seenByTracker;
  /** Whether the tracker is still owed a failure: nobody handed it over, Sentry did not see it, and it is no SDK load. */
  const isOwedToTracker = (record: FailureRecord): boolean =>
    !record.reportedToErrorTracker && !isCapturedBySentry(record) && !isSdkLoad(record.sources);
  /** Failures decided `reloading` while the reload is pending: settled by the page leaving, or decided again. */
  const coveredByReload = new Set<WeakKey>();
  /** Failures only Vite's preloader has reported, waiting for the channel it rethrows into. */
  const awaitingFollowUp = new Set<WeakKey>();
  let hasLeft = false;
  /** How many times the page was hidden ({@link StaleBuildRecovery.flush}); a wait across one ends. */
  let flushes = 0;
  let hasWarnedSdkBlocked = false;

  /**
   * Hand a failure only Vite's preloader reported to the tracker without waiting for its follow-up:
   * at once, or, while it may still be the tracker's own load, as soon as the loader answers.
   */
  const reportFollowUpNow = (failure: WeakKey, record: FailureRecord): void => {
    clearTimeout(record.preloadWait);
    record.preloadWait = undefined;
    const handOver = (): void => {
      awaitingFollowUp.delete(failure);
      if (isOwedToTracker(record)) {
        record.reportedToErrorTracker = true;
        options.reportToErrorTracker?.(failure);
      }
    };
    if (!record.isSdkLoadPending) {
      handOver();
      return;
    }
    // async-iife: bootstrap -- it goes once the loader has said whose failure it is (bounded).
    void (async () => {
      await record.sdkLoadKnown;
      handOver();
    })();
  };

  /** Hand a failure to the error tracker once, unless a channel the tracker captures itself saw it. */
  const reportToErrorTracker = (failure: WeakKey): void => {
    const record = recordOf(failure);
    if (!isOwedToTracker(record)) {
      // Owed no more (an `sdk` sighting after a `preload` one): a follow-up wait ends unreported.
      clearTimeout(record.preloadWait);
      record.preloadWait = undefined;
      awaitingFollowUp.delete(failure);
      return;
    }
    if (record.sources.size === 1 && record.sources.has('preload')) {
      awaitingFollowUp.add(failure);
      if (isPageHidden()) {
        // Nothing waits on a hidden page for the channel Vite rethrows into.
        reportFollowUpNow(failure, record);
        return;
      }
      // Only Vite's preloader saw it so far: give the channel it rethrows into the chance first.
      record.preloadWait ??= setTimeout(() => {
        reportFollowUpNow(failure, record);
      }, preloadFollowUpDelay);
      return;
    }
    clearTimeout(record.preloadWait);
    record.preloadWait = undefined;
    awaitingFollowUp.delete(failure);
    record.reportedToErrorTracker = true;
    options.reportToErrorTracker?.(failure);
  };

  /**
   * Tell analytics of a failure decided genuine, once, unless it is the error tracker's own load:
   * that one ends with one console warning (the SDK's chunk is blocked, not gone: a content blocker).
   */
  const tellGenuine = (failure: WeakKey, record: FailureRecord): void => {
    if (isSdkLoad(record.sources)) {
      if (!hasWarnedSdkBlocked) {
        hasWarnedSdkBlocked = true;
        console.warn('[stale-build-recovery] the error tracker could not be loaded on the live build');
      }
    } else if (!record.reportedToAnalytics) {
      record.reportedToAnalytics = true;
      options.onGenuineFailure?.(failure);
    }
  };

  /** Record a decision; analytics hears a genuine one when it settles, and never later. */
  const settle = (failure: WeakKey, decided: StaleBuildOutcome): void => {
    const record = recordOf(failure);
    let outcome = decided;
    if (decided === 'reloading' && !hasLeft && readReloadState() !== 'pending') {
      // The reload was already found stalled (`superseded`) or taken back by a live verdict (`current`).
      outcome = readReloadState() === 'stalled' ? 'superseded' : 'current';
    }
    record.provisional = outcome === 'reloading' && !hasLeft;
    if (record.provisional) {
      coveredByReload.add(failure);
    }
    record.outcome = outcome;
    record.verdict = liveBuild.readVerdict();
    if (outcome === 'current') {
      if (record.isSdkLoadPending) {
        // A fast verdict (no build id, a quick answer) must not beat the loader's answer to analytics.
        // async-iife: bootstrap -- analytics hears it once the loader has said whose failure it is.
        void (async () => {
          await record.sdkLoadKnown;
          tellGenuine(failure, record);
        })();
      } else {
        tellGenuine(failure, record);
      }
    }
    outcomeTopic.emit();
  };

  /**
   * Ask the loader whether a failure Vite's preloader reported first is the error tracker's own
   * load, so its identity never depends on which arrives first ({@link FailureSource}).
   */
  const identifySdkLoad = (record: FailureRecord, failure: WeakKey): void => {
    let known: boolean | Promise<boolean> = false;
    try {
      known = options.isSdkLoadFailure?.(failure) ?? false;
    } catch {
      // No answer: not the SDK's.
    }
    if (typeof known === 'boolean') {
      if (known) {
        record.sources.add('sdk');
      }
      return;
    }
    const answer = known;
    record.isSdkLoadPending = true;
    record.sdkLoadKnown = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The loader hears its import fail in the task Vite dispatches it; a load pending longer did not fail with it.
      const pendingTooLong = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(false);
        }, preloadFollowUpDelay);
      });
      try {
        if (await Promise.race([answer, pendingTooLong])) {
          record.sources.add('sdk');
        }
      } catch {
        // No answer: not the SDK's.
      } finally {
        clearTimeout(timer);
        record.isSdkLoadPending = false;
      }
    })();
  };

  const now = options.now ?? Date.now;

  /**
   * This tab's automatic reload budget. The `from>to` guard stops one
   * pair looping; the budget stops a rolling deploy whose edges disagree (B, C, B, …) from reloading
   * an untouched page back and forth, since each arrival clears the guard but never the budget.
   */
  const recentAutoReloads = (storage: NonNullable<StaleBuildRecoveryOptions['storage']>): number[] => {
    const at = now();
    return (JSON.parse(storage.getItem(autoReloadTimesKey) ?? '[]') as unknown[]).filter(
      (time): time is number => typeof time === 'number' && at - time < autoReloadBudgetWindow,
    );
  };
  const hasAutoReloadLeft = (storage: NonNullable<StaleBuildRecoveryOptions['storage']>): boolean =>
    recentAutoReloads(storage).length < autoReloadBudget;
  const chargeAutoReload = (storage: NonNullable<StaleBuildRecoveryOptions['storage']>): void => {
    storage.setItem(autoReloadTimesKey, JSON.stringify([...recentAutoReloads(storage), now()]));
  };

  const supersede = (serverBuildId: number): StaleBuildOutcome => {
    options.onSuperseded(serverBuildId);
    return 'superseded';
  };

  /** Ask `build-skew` (one shared question, its confirmations included) and read its verdict. */
  const askVerdict = async (): Promise<ServerVerdict> => {
    if (options.buildId === 0) {
      return 'unknown';
    }
    await liveBuild.query();
    return liveBuild.readVerdict();
  };

  const decide = async (): Promise<StaleBuildOutcome> => {
    // A failure while this page's own reload is under way shares its explanation, whatever the server says now.
    if (readReloadState() === 'pending') {
      return 'reloading';
    }
    const verdict = await askVerdict();
    if (readReloadState() === 'pending') {
      return 'reloading';
    }
    if (verdict !== 'replaced') {
      return 'current';
    }
    const serverBuildId = liveBuild.readReplacingBuild();
    if (!options.canReloadSafely() || options.storage === undefined) {
      return supersede(serverBuildId);
    }
    const { storage } = options;
    const guard = guardFor(options.buildId, serverBuildId);
    try {
      if (storage.getItem(staleBuildReloadKey) === guard || !hasAutoReloadLeft(storage)) {
        return supersede(serverBuildId);
      }
      // The guard first: without it nothing would stop a loop, and the budget is charged only once it holds.
      storage.setItem(staleBuildReloadKey, guard);
    } catch {
      return supersede(serverBuildId);
    }
    try {
      chargeAutoReload(storage);
    } catch {
      // A reload the budget could not record must not happen; take the guard back with it.
      try {
        storage.removeItem(staleBuildReloadKey);
      } catch {
        // Nothing more to undo.
      }
      return supersede(serverBuildId);
    }
    setReloadState('pending');
    options.reload();
    /* A page still here after the timeout is stalled: the reload was refused or is only slow, and no
     * signal tells the two apart (the old document lives until the new one commits; Tau registers no
     * unload prompt, `use-flush-on-close`). The guard stays, and later failures are offered the reload,
     * never another automatic one. Before offering, the server is asked again: if it names this build
     * by now, there is nothing to offer. */
    setTimeout(() => {
      const offerIfStillReplaced = async (): Promise<void> => {
        const stillVerdict = await askVerdict();
        if (hasLeft || readReloadState() !== 'pending') {
          return;
        }
        // What the reload covered was provisional; the page is still here, so it is decided normally.
        const covered = [...coveredByReload];
        coveredByReload.clear();
        if (stillVerdict === 'live') {
          setReloadState('idle');
          for (const failure of covered) {
            settle(failure, 'current');
          }
          return;
        }
        // No answer keeps the explanation the deploy gave: only the server naming this build takes it back.
        setReloadState('stalled');
        options.onSuperseded(liveBuild.readReplacingBuild());
        for (const failure of covered) {
          settle(failure, 'superseded');
        }
      };
      // async-iife: bootstrap -- a timer cannot await; the check acts on its own.
      void offerIfStillReplaced();
    }, options.reloadTimeout ?? reloadTimeout);
    return 'reloading';
  };

  const tagOf = (outcome: StaleBuildOutcome, verdict: ServerVerdict | undefined): StaleBuildTag => {
    if (outcome !== 'current') {
      return 'superseded';
    }
    return verdict === 'live' ? 'current' : 'unknown';
  };

  return {
    async recover(failure, source = 'boundary') {
      if (!isWeakKey(failure)) {
        return decide();
      }
      const record = recordOf(failure);
      record.sources.add(source);
      if (capturedBySentry[source] && (options.isErrorTrackerListening?.() ?? true)) {
        record.seenByTracker = true;
      }
      if (record.decision === undefined) {
        if (source === 'preload') {
          identifySdkLoad(record, failure);
        }
        const decided = decide();
        record.decision = decided;
        // async-iife: bootstrap -- the settled outcome is published once the decision lands.
        void (async () => {
          settle(failure, await decided);
        })();
      }
      // After the decision is under way, so the tracker's `beforeSend` can wait for it (`classifySettled`).
      reportToErrorTracker(failure);
      return record.decision;
    },
    classify(failure) {
      // Passive: what is known now, from the settled outcome or else the live verdict; never asks.
      const record = isWeakKey(failure) ? records.get(failure) : undefined;
      if (record?.outcome !== undefined) {
        return tagOf(record.outcome, record.verdict);
      }
      const verdict = liveBuild.readVerdict();
      return verdict === 'replaced' ? 'superseded' : tagOf('current', verdict);
    },
    async classifySettled(failure, bound = staleBuildTagWait) {
      const record = isWeakKey(failure) ? records.get(failure) : undefined;
      // Settled: no decision under way, or one made and not provisional, or the page is going.
      const isSettled = (): boolean =>
        hasLeft || record?.decision === undefined || (record.outcome !== undefined && !record.provisional);
      const flushesBefore = flushes;
      if (isPageHidden()) {
        return this.tagNow(failure);
      }
      if (!isSettled()) {
        await new Promise<void>((resolve) => {
          const done = (): void => {
            clearTimeout(timer);
            unsubscribe();
            resolve();
          };
          const timer = setTimeout(done, bound);
          const unsubscribe = outcomeTopic.subscribe(() => {
            if (isSettled() || flushes !== flushesBefore) {
              done();
            }
          });
        });
      }
      // Released by the page being hidden: what it knows now, `undecided` for a decision still under way.
      return hasLeft || flushes !== flushesBefore ? this.tagNow(failure) : this.classify(failure);
    },
    tagNow(failure) {
      const record = isWeakKey(failure) ? records.get(failure) : undefined;
      const isUndecided =
        record?.decision !== undefined && (record.outcome === undefined || (record.provisional && !hasLeft));
      return isUndecided ? 'undecided' : this.classify(failure);
    },
    flush() {
      flushes += 1;
      for (const failure of awaitingFollowUp) {
        const record = records.get(failure);
        if (record === undefined) {
          awaitingFollowUp.delete(failure);
        } else {
          reportFollowUpNow(failure, record);
        }
      }
      outcomeTopic.emit();
    },
    readOutcome: (failure) => (isWeakKey(failure) ? records.get(failure)?.outcome : undefined),
    subscribeOutcomes: (listener) => outcomeTopic.subscribe(listener),
    readReloadState,
    subscribeReloadState: (listener) => reloadStateTopic.subscribe(listener),
    leave() {
      if (hasLeft) {
        return;
      }
      hasLeft = true;
      for (const failure of coveredByReload) {
        const record = records.get(failure);
        if (record !== undefined) {
          record.provisional = false;
        }
      }
      coveredByReload.clear();
      outcomeTopic.emit();
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

let hasUserInteracted = false;
let pageRecovery: StaleBuildRecovery | undefined;

/** Genuine failures analytics has not heard of yet; drained by {@link subscribeGenuineFailures}. */
const genuineForAnalytics: unknown[] = [];
const genuineFailureTopic = new Topic<void>({ name: 'stale-build-genuine' });

/**
 * Hear each module load failure the recovery decided genuine (`onGenuineFailure`), for
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
    },
    storage: readSessionStorage(),
    reload: () => {
      globalThis.location.reload();
    },
    // A lone tab keeps writing until the user reloads; other bundles stop it through `build-skew`'s own channel.
    onSuperseded: offerReload,
    reportToErrorTracker: (failure) => {
      void reportUiError(failure);
    },
    isErrorTrackerListening,
    // The loader knows whether the SDK's own import failed, and with which value.
    isSdkLoadFailure,
    onGenuineFailure: (failure) => {
      genuineForAnalytics.push(failure);
      genuineFailureTopic.emit();
    },
    canReloadSafely: () => !hasUserInteracted && performance.now() <= autoReloadWindow,
  });
  const recovery = pageRecovery;
  // An error sent without the SDK is tagged as `beforeSend` would tag it.
  setErrorDescriber({
    now: (failure): Readonly<Record<string, string>> =>
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name, filtered on by operators.
      isStaleModuleError(failure) ? { stale_build: recovery.tagNow(failure) } : {},
    settled: async (failure): Promise<Readonly<Record<string, string>>> =>
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name, filtered on by operators.
      isStaleModuleError(failure) ? { stale_build: await recovery.classifySettled(failure) } : {},
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
 * What the error tracker should be told about one module load failure ({@link StaleBuildTag}):
 * its decision once settled (waiting at most {@link staleBuildTagWait}, since the tracker hears a
 * failure as soon as it happens), or else what is known. Never reloads, supersedes or asks anything.
 *
 * @param failure - The caught value.
 * @returns The `stale_build` tag for its event.
 */
export const classifyStaleBuildFailure = async (failure: unknown): Promise<StaleBuildTag> =>
  getPageRecovery().classifySettled(failure);

/**
 * What the error tracker would be told about one module load failure now ({@link StaleBuildTag}),
 * without waiting for its decision.
 *
 * @param failure - The caught value.
 * @returns The `stale_build` tag from what is known.
 */
export const readStaleBuildTag = (failure: unknown): StaleBuildTag => getPageRecovery().tagNow(failure);

/**
 * Hand a failed load of the error tracker's own SDK (`startErrorReporting`) to the recovery: its
 * chunk may be one a new deploy no longer serves, and the page then reloads or offers the reload.
 * It is never reported (there is nothing to report it with); on a build the server still runs (a
 * content blocker) it ends with one console warning. The failure may arrive wrapped, so its `cause`
 * is checked too.
 *
 * @param failure - Why the SDK could not be loaded.
 */
export const recoverFromSdkLoadFailure = (failure: unknown): void => {
  const cause: unknown = failure instanceof Error ? failure.cause : undefined;
  const stale = isStaleModuleError(failure) ? failure : isStaleModuleError(cause) ? cause : undefined;
  if (stale !== undefined) {
    // async-iife: bootstrap -- the recovery decides, and acts, on its own.
    void recoverFromStaleBuild(stale, 'sdk');
  }
};

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
    // Passive: noting an input never cancels it, so scrolling and touch stay on the fast path.
    globalThis.addEventListener(type, onInput, { capture: true, passive: true });
  }
  inputWindow = setTimeout(stopWatchingInput, Math.max(0, autoReloadWindow - performance.now()));
  for (const [type, listener] of failureListeners) {
    globalThis.addEventListener(type, listener as EventListener, { capture: true });
  }
  /* Whether the page is hidden is derived in one place (`isPageHidden`: the document's own state,
   * plus a `pagehide` not yet undone by a `pageshow`), and every point where a report could start
   * waiting reads it, so a page that is hidden never waits. These listeners only end the waits
   * already under way when it becomes hidden: the document turning hidden (`visibilitychange`, the
   * last event a mobile browser reliably fires before it freezes or discards a background tab
   * without a `pagehide`) and every `pagehide` (a page kept in the back/forward cache is frozen and
   * may be evicted without running again). Chrome freezes only a page already hidden one of these
   * ways, so `freeze` adds nothing. Hidden is not gone: what waited goes as far as the keepalive
   * budget allows and the rest keeps waiting. Only a page that is really going (`pagehide`, not
   * persisted) settles what a pending reload covered and gives up what is left (counted in one
   * summary event). A `pageshow` only undoes a `pagehide`: a document that boots hidden (opened in a
   * background tab) is hidden from the start and stays hidden through its first `pageshow`. */
  const hide = (phase: 'hidden' | 'exit'): void => {
    getPageRecovery().flush();
    sendWaitingErrors(phase);
  };
  const onPageHide = (event: PageTransitionEvent): void => {
    notePageHide(event.persisted);
    if (!event.persisted) {
      getPageRecovery().leave();
    }
    hide(event.persisted ? 'hidden' : 'exit');
  };
  const onPageShow = (): void => {
    notePageShow();
  };
  const onVisibilityChange = (): void => {
    if (isPageHidden()) {
      hide('hidden');
    }
  };
  if (isPageHidden()) {
    hide('hidden');
  }
  globalThis.addEventListener('pagehide', onPageHide);
  globalThis.addEventListener('pageshow', onPageShow);
  globalThis.document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    globalThis.removeEventListener('pagehide', onPageHide);
    globalThis.removeEventListener('pageshow', onPageShow);
    globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
    stopWatchingInput();
    for (const [type, listener] of failureListeners) {
      globalThis.removeEventListener(type, listener as EventListener, { capture: true });
    }
  };
};

/**
 * Whether a reload prompt (the banner, the sidebar update control) shows: while the reload is
 * offered, and never while the page's own automatic reload is pending (a second reload would race
 * it); it shows again once that reload stalls.
 *
 * @param offered - Whether `build-skew` offers the reload.
 * @param reloadState - This page's own automatic reload ({@link readReloadState}).
 * @returns `true` when the prompt shows.
 */
export const isReloadPromptShown = (offered: boolean, reloadState: ReloadState): boolean =>
  offered && reloadState !== 'pending';

/**
 * Whether the error page should show the reload prompt ("Tau has been updated") for a module load
 * failure, from its settled outcome and the live verdict: while a deploy explains it and the server
 * has not named this build since, or whenever the server has confirmed another build.
 *
 * @param outcome - The failure's settled outcome, `undefined` while it is decided.
 * @param verdict - The live verdict (`build-skew`).
 * @returns `true` for the prompt, `false` for the error itself.
 */
export const showsUpdatePrompt = (outcome: StaleBuildOutcome | undefined, verdict: ServerVerdict): boolean =>
  outcome !== undefined && verdict !== 'live' && (outcome !== 'current' || verdict === 'replaced');
