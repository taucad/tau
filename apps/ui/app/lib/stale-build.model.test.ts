// @vitest-environment node
/**
 * Model test of `build-skew` and `stale-build-recovery` together (TAU-UI-6, DF20): two tabs, A on
 * build X and B on build Y, run the real modules with fake time, a fake `/health/build` per tab
 * (so edges can disagree), a fake BroadcastChannel and a model error tracker. fast-check explores
 * bounded sequences of announcements, server answers, chunk failures, timer ticks, error-tracker
 * start-up, refreshes and automatic reloads (which a page may leave on, or stall), and the
 * invariants below are checked after every step. Each tab keeps its `sessionStorage` (the reload
 * guard and budget) across its pages. An error reported once the SDK failed to load is sent without
 * it, as an envelope the model ingest counts alongside the SDK's own captures. A page is hidden by
 * `pagehide` (into the back/forward cache) or by its document turning hidden (switching tabs or
 * apps), and may stay hidden for several steps; a refreshed page may boot hidden (a background
 * tab), its first `pageshow` coming while it is still hidden. Each tab has its own document, so one
 * tab being hidden never hides the other. While a page is hidden nothing it reported may wait (I8).
 * The SDK's own chunk can fail through the real loader as Vite's preload helper reports
 * it: `vite:preloadError` first, then the import rejecting into the loader, whose hand-over to the
 * recovery comes at once or only after the failure's verdict (a fast verdict: no build id, a quick
 * answer), so whose failure it is cannot depend on which arrives first (I9). A third tab may boot on
 * either build at any moment, its announcement heard at once, so a peer's claim can land while a
 * lookup is still confirming (I10); one whose edge confirmed its build may claim it live and close
 * at once, so an older tab that boots while a newer one is stopped is told by nothing but the
 * stopped tab itself (I1b). The browser takes only a few beacons at a time, so a hide may not fit
 * everything that waits; whatever does not fit goes no other way while the page is hidden (I8b).
 * At irreversible exit, refused events may be omitted only after an exit-summary attempt accounts
 * for their exact count. Live and restored pages still owe individual delivery (I2).
 */
import process from 'node:process';
import { array, assert, asyncProperty, constant, constantFrom, oneof, record, tuple } from 'fast-check';
import type { Arbitrary } from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BuildIdentity from '#lib/build-identity.js';
import type * as BuildSkew from '#filesystem/build-skew.js';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type * as ErrorReporting from '#lib/error-reporting.js';

const buildX = 1_792_726_000_000;
const buildY = buildX + 4_113_029;

type Answer = 'X' | 'Y' | 'unreachable' | 'none';
type Channel = 'boundary' | 'global' | 'preload';
type Step =
  | { readonly kind: 'deliver' }
  | { readonly kind: 'announce'; readonly build: 0 | 1 }
  | { readonly kind: 'claimLive'; readonly build: 0 | 1 }
  | { readonly kind: 'answer'; readonly tab: 0 | 1; readonly answer: Answer }
  | { readonly kind: 'failure'; readonly tab: 0 | 1; readonly channel: Channel }
  | { readonly kind: 'again'; readonly tab: 0 | 1; readonly channel: Channel }
  | { readonly kind: 'tick'; readonly ms: number }
  | { readonly kind: 'tracker'; readonly tab: 0 | 1 }
  | { readonly kind: 'trackerFails'; readonly tab: 0 | 1 }
  | { readonly kind: 'query'; readonly tab: 0 | 1 }
  | { readonly kind: 'reload'; readonly tab: 0 | 1 }
  | { readonly kind: 'leave'; readonly tab: 0 | 1 }
  | { readonly kind: 'sdkFails'; readonly tab: 0 | 1; readonly handOver: 'prompt' | 'late' }
  | { readonly kind: 'freeze'; readonly tab: 0 | 1; readonly via: 'pagehide' | 'hidden' }
  | { readonly kind: 'hide'; readonly tab: 0 | 1; readonly via: 'pagehide' | 'hidden' }
  | { readonly kind: 'show'; readonly tab: 0 | 1 }
  | { readonly kind: 'bootHidden'; readonly tab: 0 | 1 };

/**
 * The model's shared state: its tabs, whether the next SDK load fails, the page whose listeners are
 * being installed, and how many failures were made (each has its own message, as a stored error is
 * matched by it).
 */
const model = {
  tabs: [] as Tab[],
  failNextTrackerLoad: false,
  /** The next SDK load fails with this value, which Vite's preloader dispatches first. */
  sdkLoadFailure: undefined as { readonly tab: Tab; readonly failure: TypeError } | undefined,
  installing: undefined as Tab | undefined,
  /** The tab whose page is loading, whose channel the next `BroadcastChannel` is. */
  loading: undefined as Tab | undefined,
  /** The page synchronously dispatching its irreversible exit, including summary beacons. */
  exiting: undefined as Tab | undefined,
  failures: 0,
};

/** Beacons the browser takes from one tab until the next tick: few, so a hide may not fit what waits. */
const beaconRoom = 2;

/** The tabs' shared BroadcastChannel, delivering only when the model says so. */
const bus = {
  queue: [] as Array<{ readonly from: FakeChannel; readonly data: unknown }>,
  channels: new Set<FakeChannel>(),
};

class FakeChannel {
  private readonly listeners: Array<(event: { readonly data: unknown }) => void> = [];
  /** The tab whose page opened this channel, if any (a third tab's announcement has none). */
  private readonly owner = model.loading;
  public constructor(_name: string) {
    bus.channels.add(this);
  }
  public postMessage(data: unknown): void {
    bus.queue.push({ from: this, data });
  }
  public addEventListener(_type: string, listener: (event: { readonly data: unknown }) => void): void {
    this.listeners.push(listener);
  }
  public close(): void {
    bus.channels.delete(this);
  }
  public receive(data: unknown): void {
    const heard = Number(typeof data === 'object' && data !== null && 'buildId' in data ? data.buildId : data);
    this.owner?.heard.add(heard);
    for (const listener of this.listeners) {
      listener({ data });
    }
  }
}

const deliverAll = (): number => {
  let delivered = 0;
  for (let round = 0; round < 20 && bus.queue.length > 0; round += 1) {
    for (const { from, data } of bus.queue.splice(0)) {
      delivered += 1;
      for (const channel of bus.channels) {
        if (channel !== from) {
          channel.receive(data);
        }
      }
    }
  }
  return delivered;
};

type Tab = {
  readonly build: number;
  answer: Answer;
  /** Milliseconds this tab's edge takes to answer (a slow edge stays inside the 4 s request timeout). */
  readonly answerDelay: number;
  /** Answers naming this tab's own build since the last one naming another. */
  consecutiveOwn: number;
  fetches: number;
  /** Every build the edge named, in order (`unreachable` and `none` included), across this tab's pages. */
  readonly answers: Answer[];
  /** I10 violations found when a decision landed, and I8b ones when an event went, checked after each step. */
  readonly violations: string[];
  /** The builds the current page heard announced (plainly or as a live claim). */
  heard: Set<number>;
  /** Beacons the browser still takes from this tab until the next tick. */
  beacons: number;
  /** Whether the browser refused this tab a beacon since its page was last shown. */
  beaconRefused: boolean;
  errorReporting?: typeof ErrorReporting;
  /** Events the model error tracker sent per failure; Sentry ignores a second capture of the same value. */
  readonly tracked: Map<unknown, number>;
  /** Failures covered by a verified exit-summary attempt after the browser refused delivery. */
  readonly omittedAtExit: Set<unknown>;
  readonly exitSummaryCounts: number[];
  /** The tag each failure of a page that left would be sent with, as that page knew it when it went. */
  readonly tagsAtLeave: Map<unknown, StaleBuildRecovery.StaleBuildTag>;
  /** The tags a page knew for each of its failures whenever it was hidden (frozen or left). */
  readonly tagsAtHide: Map<unknown, Set<StaleBuildRecovery.StaleBuildTag>>;
  /** This tab's `sessionStorage`: it outlives the tab's pages. */
  readonly storage: Map<string, string>;
  /** The current page's `pagehide` listeners. */
  pageHide: Array<(event: { readonly persisted: boolean }) => void>;
  /** The current page's `pageshow` listeners. */
  pageShow: Array<() => void>;
  /** The current page's `visibilitychange` listeners. */
  visibility: Array<() => void>;
  /** This tab's document's `visibilityState`, which outlives its pages (a background tab stays one). */
  visibilityState: 'visible' | 'hidden';
  /** Whether the current page had a `pagehide` (into the back/forward cache) and no `pageshow` since. */
  inPageHide: boolean;
  /** The `stale_build` tag each tracked failure's event was sent with (`beforeSend` holds it). */
  readonly tags: Map<unknown, Promise<StaleBuildRecovery.StaleBuildTag>>;
  /** The edge once answered `none` (no build endpoint): the newer build wins and nothing is asked again. */
  sawNone: boolean;
  readonly analytics: Map<unknown, number>;
  /**
   * Each failure with the page (module instance) that saw it; a reload starts a new page. `sdk` marks
   * the error tracker's own chunk failing to load, which is never reported (I9).
   */
  readonly failures: Array<{
    readonly failure: unknown;
    readonly recovery: typeof StaleBuildRecovery;
    readonly sdk?: true;
    /** The channels it was sighted through. */
    readonly channels: Set<Channel>;
  }>;
  everStopped: boolean;
  wasWriting: boolean;
  /** Whether this page has started its one SDK load. */
  loadStarted: boolean;
  /** Whether this page's loader hands a failed load over only after a timer turn (a fast verdict wins). */
  lateHandOver: boolean;
  resumedWithOwn: number | undefined;
  skew?: typeof BuildSkew;
  recovery?: typeof StaleBuildRecovery;
};

const loadTab = async (tab: Tab): Promise<void> => {
  vi.resetModules();
  tab.heard = new Set();
  tab.beaconRefused = false;
  // The page's own document: its modules read it, so one tab's visibility is never the other's.
  vi.stubGlobal('document', {
    get visibilityState() {
      return tab.visibilityState;
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange' && model.installing === tab) {
        tab.visibility.push(listener);
      }
    },
    removeEventListener: () => undefined,
  });
  tab.inPageHide = false;
  vi.doMock('#lib/build-identity.js', async (importOriginal) => ({
    ...(await importOriginal<typeof BuildIdentity>()),
    readBuildId: () => tab.build,
    askLiveBuild: async () => {
      tab.fetches += 1;
      if (tab.answerDelay > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, tab.answerDelay);
        });
      }
      if (tab.answer === 'none') {
        tab.sawNone = true;
      }
      tab.answers.push(tab.answer);
      if (tab.answer === 'X' || tab.answer === 'Y') {
        const named = tab.answer === 'X' ? buildX : buildY;
        tab.consecutiveOwn = named === tab.build ? tab.consecutiveOwn + 1 : 0;
        return named;
      }
      return tab.answer;
    },
  }));
  const { storage } = tab;
  vi.doMock('#lib/session-storage.js', () => ({
    readSessionStorage: () => ({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    }),
  }));
  // The real error reporting, over a model SDK whose load can fail.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
  vi.doMock('#environment.config.js', () => ({ ENV: { SENTRY_DSN: 'https://model@sentry.invalid/1' } }));
  /* The SDK is imported lazily, after every tab has loaded, so one model SDK serves both: it hands a
   * capture to the tab whose failure it is, and whether a tab's handlers are installed is that tab's
   * own `isErrorTrackerListening`. */
  vi.doMock('#lib/sentry.lib.js', () => {
    const sdkLoad = model.sdkLoadFailure;
    if (sdkLoad !== undefined) {
      model.sdkLoadFailure = undefined;
      // Vite's preload helper wraps the SDK's import: it dispatches the failure, then rethrows it into the loader.
      sdkLoad.tab.failures.push({
        failure: sdkLoad.failure,
        recovery: sdkLoad.tab.recovery!,
        sdk: true,
        channels: new Set(),
      });
      sight(sdkLoad.tab, sdkLoad.failure, 'preload');
      throw sdkLoad.failure;
    }
    if (model.failNextTrackerLoad) {
      model.failNextTrackerLoad = false;
      throw new TypeError('Importing a module script failed.');
    }
    return {
      initSentry: () => undefined,
      captureUiError: (error: unknown) => {
        captureValue(error);
      },
    };
  });
  tab.errorReporting = await import('#lib/error-reporting.js');
  model.loading = tab;
  tab.skew = await import('#filesystem/build-skew.js');
  model.loading = undefined;
  tab.recovery = await import('#lib/stale-build-recovery.js');
  tab.recovery.subscribeGenuineFailures((failure) => {
    tab.analytics.set(failure, (tab.analytics.get(failure) ?? 0) + 1);
  });
  // The entry installs the recovery on every page; its `pagehide` listener is this page's.
  tab.pageHide = [];
  tab.pageShow = [];
  tab.visibility = [];
  tab.loadStarted = false;
  tab.lateHandOver = false;
  model.installing = tab;
  tab.recovery.installStaleBuildRecovery();
  model.installing = undefined;
};

type IngestedEvent = {
  readonly fingerprint?: readonly string[];
  readonly tags?: Readonly<Record<string, string>>;
  readonly exception?: { readonly values?: ReadonlyArray<{ readonly value?: string }> };
};

/** The tab and failure an event sent without the SDK is for, by the message it carries (each failure's is unique). */
const ownerOf = (
  body: unknown,
): { readonly tab: Tab; readonly failure: unknown; readonly event: IngestedEvent } | undefined => {
  const event = JSON.parse(String(body).split('\n')[2] ?? '{}') as IngestedEvent;
  const message = event.exception?.values?.[0]?.value;
  for (const tab of model.tabs) {
    const entry = tab.failures.find(
      (candidate) => candidate.failure instanceof Error && candidate.failure.message === message,
    );
    if (entry !== undefined) {
      return { tab, failure: entry.failure, event };
    }
  }
  return undefined;
};

/** Count an event sent without the SDK for its failure, with the tag it was sent with. */
const receiveEvent = (body: unknown): void => {
  const owner = ownerOf(body);
  if (owner !== undefined) {
    const { tab, failure, event } = owner;
    tab.tracked.set(failure, (tab.tracked.get(failure) ?? 0) + 1);
    tab.tags.set(failure, Promise.resolve(event.tags?.['stale_build'] as StaleBuildRecovery.StaleBuildTag));
  }
};

/**
 * The model ingest, for requests (`sendSentryEventDirectly`). I8b: a hidden page sends only what the
 * browser takes as it hides (a beacon here); an ordinary request from it may never go out.
 */
const ingest = async (_url: string, init: { readonly body?: unknown }): Promise<Response> => {
  const owner = ownerOf(init.body);
  if (owner !== undefined && isHidden(owner.tab)) {
    owner.tab.violations.push(`I8b ${String(owner.failure)} sent as a request while its page was hidden`);
  }
  receiveEvent(init.body);
  return new Response('{}');
};

/** The browser's `sendBeacon`: it takes a few from each tab at a time ({@link beaconRoom}), then refuses. */
const sendBeacon = (_url: string, body: unknown): boolean => {
  const event = JSON.parse(String(body).split('\n')[2] ?? '{}') as IngestedEvent;
  const isSummary = event.fingerprint?.[0] === 'ui-errors-undelivered-at-page-exit';
  const tab = ownerOf(body)?.tab ?? (isSummary ? model.exiting : undefined);
  if (isSummary) {
    expect(tab, 'exit summary belongs to an exiting page').toBeDefined();
    const count = /^(\d+) further UI errors were not delivered at page exit$/u.exec(
      event.exception?.values?.[0]?.value ?? '',
    )?.[1];
    expect(count, 'exit summary declares its exact omitted count').toBeDefined();
    tab?.exitSummaryCounts.push(Number(count));
  }
  if (tab !== undefined) {
    if (tab.beacons === 0) {
      tab.beaconRefused = true;
      return false;
    }
    tab.beacons -= 1;
  }
  receiveEvent(body);
  return true;
};

/**
 * The SDK captures a value once: as Sentry's `checkOrSetAlreadyCaught` does, it skips a value marked
 * `__sentry_captured__` (by itself, or by an event sent without it) and marks the rest.
 */
function captureValue(error: unknown): void {
  const owner = model.tabs.find((candidate) => candidate.failures.some((entry) => entry.failure === error));
  if (owner === undefined || typeof error !== 'object' || error === null) {
    return;
  }
  if ((error as { __sentry_captured__?: boolean }).__sentry_captured__ === true) {
    return;
  }
  Object.defineProperty(error, '__sentry_captured__', { value: true, enumerable: false, configurable: true });
  track(owner, error);
}

/**
 * The page is hidden: by `pagehide`, into the back/forward cache or for good, or by its document
 * turning hidden (`visibilitychange`). What it knew of each failure is noted.
 */
function hidePage(tab: Tab, how: { readonly persisted: boolean } | 'hidden'): void {
  if (how === 'hidden') {
    tab.visibilityState = 'hidden';
    for (const listener of tab.visibility) {
      listener();
    }
  } else {
    // As Safari may: the `pagehide` comes, the document's own state does not say hidden yet.
    tab.inPageHide = how.persisted;
    for (const listener of tab.pageHide) {
      listener(how);
    }
  }
  noteHiddenTags(tab);
}

/** Whether the tab's current page is hidden: its document is, or a `pagehide` has not been undone. */
const isHidden = (tab: Tab): boolean => tab.visibilityState === 'hidden' || tab.inPageHide;

/** What the current page knows of each of its failures while it is hidden: what it may send them with. */
function noteHiddenTags(tab: Tab): void {
  const page = tab.recovery!;
  for (const { failure, recovery } of tab.failures) {
    if (recovery === page) {
      const known = tab.tagsAtHide.get(failure) ?? new Set();
      known.add(page.readStaleBuildTag(failure));
      tab.tagsAtHide.set(failure, known);
    }
  }
}

/** The page is shown again: a `pagehide` is undone by `pageshow`, a hidden document turns visible. */
const showPage = (tab: Tab): void => {
  tab.beaconRefused = false;
  if (tab.inPageHide) {
    tab.inPageHide = false;
    for (const listener of tab.pageShow) {
      listener();
    }
  }
  if (tab.visibilityState === 'hidden') {
    tab.visibilityState = 'visible';
    for (const listener of tab.visibility) {
      listener();
    }
  }
};

/** Whether a promise has settled by the next timer turn. */
const hasSettled = async (promise: Promise<unknown> | undefined): Promise<boolean> => {
  if (promise === undefined) {
    return true;
  }
  const pending = Symbol('pending');
  const nextTurn = async (): Promise<typeof pending> => {
    await vi.advanceTimersByTimeAsync(0);
    return pending;
  };
  const raced = Promise.race([promise, nextTurn()]);
  return (await raced) !== pending;
};

/**
 * The page leaves (a refresh, or its automatic reload going through): its `pagehide` listeners run,
 * what each of its failures would be sent with is fixed, and the next page loads on the same storage.
 */
const leavePage = async (tab: Tab, { bootHidden = false }: { readonly bootHidden?: boolean } = {}): Promise<void> => {
  const page = tab.recovery!;
  const summariesBefore = tab.exitSummaryCounts.length;
  model.exiting = tab;
  try {
    hidePage(tab, { persisted: false });
  } finally {
    model.exiting = undefined;
  }
  const missing = tab.failures.filter(
    ({ failure, recovery, sdk }) => recovery === page && !sdk && !tab.tracked.has(failure),
  );
  if (missing.length > 0) {
    expect(tab.beaconRefused, 'only browser-refused delivery may be omitted at exit').toBe(true);
    expect(tab.exitSummaryCounts.slice(summariesBefore), 'exit summary accounts for every undelivered error').toEqual([
      missing.length,
    ]);
    for (const { failure } of missing) {
      tab.omittedAtExit.add(failure);
    }
  } else {
    expect(tab.exitSummaryCounts.slice(summariesBefore), 'no summary when every error was delivered').toEqual([]);
  }
  for (const { failure, recovery } of tab.failures) {
    if (recovery === page) {
      tab.tagsAtLeave.set(failure, page.readStaleBuildTag(failure));
    }
  }
  tab.skew?.closeBuildSkewChannel();
  if (bootHidden) {
    // The next page boots in a background tab: hidden from the start, no `visibilitychange` until shown.
    tab.visibilityState = 'hidden';
  }
  await loadTab(tab);
  if (bootHidden) {
    // Its first `pageshow` (not persisted) comes while the document is still hidden.
    for (const listener of tab.pageShow) {
      listener();
    }
  }
};

const newTab = (build: number, answer: Answer, answerDelay: number): Tab => ({
  build,
  answer,
  answerDelay,
  consecutiveOwn: 0,
  fetches: 0,
  answers: [],
  violations: [],
  heard: new Set(),
  beacons: beaconRoom,
  beaconRefused: false,
  tracked: new Map(),
  omittedAtExit: new Set(),
  exitSummaryCounts: [],
  tagsAtLeave: new Map(),
  tagsAtHide: new Map(),
  storage: new Map(),
  pageHide: [],
  pageShow: [],
  visibility: [],
  visibilityState: 'visible',
  inPageHide: false,
  tags: new Map(),
  sawNone: false,
  analytics: new Map(),
  failures: [],
  everStopped: false,
  wasWriting: true,
  loadStarted: false,
  lateHandOver: false,
  resumedWithOwn: undefined,
});

const flush = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each round lets the previous one's promises settle.
    await vi.advanceTimersByTimeAsync(0);
  }
};

/** The model error tracker sends one event for a failure, tagged as `beforeSend` would. */
function track(tab: Tab, failure: unknown): void {
  tab.tracked.set(failure, (tab.tracked.get(failure) ?? 0) + 1);
  const page = tab.failures.find((entry) => entry.failure === failure)?.recovery ?? tab.recovery!;
  tab.tags.set(failure, page.classifyStaleBuildFailure(failure));
}

/** The entry starts error reporting and hands a failed load to the recovery, as `entry.client` does. */
const startTracker = async (tab: Tab): Promise<void> => {
  tab.loadStarted = true;
  const page = tab.recovery!;
  await tab.errorReporting?.startErrorReporting((failure) => {
    if (tab.lateHandOver) {
      setTimeout(() => {
        page.recoverFromSdkLoadFailure(failure);
      }, 1000);
    } else {
      page.recoverFromSdkLoadFailure(failure);
    }
  });
};

/**
 * I10: a failure is decided genuine (`current`) only on the server's word or its silence. A decision
 * that landed within the lookup's budget, while every answer the edge gave named another build, must
 * have been decided by that build, whatever peer claimed what meanwhile.
 */
const watchDecision = (tab: Tab, failure: unknown, decision: Promise<StaleBuildRecovery.StaleBuildOutcome>): void => {
  const asked = tab.answers.length;
  // The lookup's budget, on the same fake clock: a decision that waited it out may rest on silence.
  const budget = { isOpen: true };
  setTimeout(() => {
    budget.isOpen = false;
  }, tab.skew!.lookupBudget);
  const other: Answer = tab.build === buildX ? 'Y' : 'X';
  // async-iife: bootstrap -- the check runs when the decision lands, as the decision itself does.
  void (async () => {
    const outcome = await decision;
    const given = tab.answers.slice(asked);
    if (outcome === 'current' && budget.isOpen && given.length > 0 && given.every((named) => named === other)) {
      tab.violations.push(
        `I10 ${String(failure)} decided current though the edge named ${other} ${String(given.length)}×`,
      );
    }
  })();
};

const sight = (tab: Tab, failure: unknown, channel: Channel): void => {
  const entry = tab.failures.find((candidate) => candidate.failure === failure);
  const isFirstSighting = entry?.channels.size === 0;
  entry?.channels.add(channel);
  const decision = tab.recovery?.recoverFromStaleBuild(failure, channel);
  if (decision !== undefined && isFirstSighting && entry.sdk === undefined) {
    watchDecision(tab, failure, decision);
  }
  if (isHidden(tab)) {
    // A failure on a hidden page goes at once, with what its page knows now.
    noteHiddenTags(tab);
  }
  /* Sentry's own global handlers capture what reaches `window`, once installed, and after the
   * recovery's capture-phase listener (`installStaleBuildRecovery`), which has started the decision. */
  if (channel === 'global' && tab.errorReporting?.isErrorTrackerListening() === true) {
    captureValue(failure);
  }
};

/**
 * The error tracker's own chunk fails to load, on a page that has not loaded it yet: Vite's preload
 * helper, which wraps that import too, dispatches the failure, then rethrows it into the loader,
 * which hands it over at once or a second later (after a fast verdict).
 */
const failSdkLoad = async (tab: Tab, handOver: 'prompt' | 'late'): Promise<void> => {
  if (tab.loadStarted) {
    return;
  }
  model.failures += 1;
  model.sdkLoadFailure = {
    tab,
    failure: new TypeError(
      `Failed to fetch dynamically imported module: /assets/sentry.lib-${String(model.failures)}.js`,
    ),
  };
  tab.lateHandOver = handOver === 'late';
  await startTracker(tab);
  // A load that did not run its factory (the SDK was already loaded for the other tab) fails nothing.
  model.sdkLoadFailure = undefined;
};

/**
 * I8: while a page is hidden, nothing it reported waits, since it may be frozen or discarded and
 * never run again: every failure it saw has gone to the tracker, and every event the tracker held
 * for one (`beforeSend`) has been released. The one exception is a failure only Vite's preloader
 * reported while the SDK's load is under way, which may be the SDK's own (never reported, I9): it
 * goes as soon as the loader answers.
 */
const checkNothingWaitsWhileHidden = async (tab: Tab, label: string): Promise<void> => {
  if (!isHidden(tab)) {
    return;
  }
  for (const { failure, recovery, sdk, channels } of tab.failures) {
    if (recovery !== tab.recovery || sdk) {
      continue;
    }
    if (tab.tracked.has(failure)) {
      // oxlint-disable-next-line no-await-in-loop -- Each held tag in turn.
      expect(await hasSettled(tab.tags.get(failure)), `I8 held tag released (${label})`).toBe(true);
      continue;
    }
    const mayBeSdkLoad =
      channels.size === 1 &&
      channels.has('preload') &&
      typeof tab.errorReporting?.isSdkLoadFailure(failure) !== 'boolean';
    // What the browser had no room for waits for the page to be shown or hidden again (I8b).
    expect(mayBeSdkLoad || tab.beaconRefused, `I8 failure sent while hidden (${label})`).toBe(true);
  }
};

/** Hidden (into the back/forward cache, or by switching away), then shown again: the page carries on. */
const hideAndShow = async (tab: Tab, via: 'pagehide' | 'hidden'): Promise<void> => {
  hidePage(tab, via === 'hidden' ? 'hidden' : { persisted: true });
  await checkNothingWaitsWhileHidden(tab, `freeze ${via}`);
  showPage(tab);
};

/** A step that hides or shows a page. */
type VisibilityStep = Extract<Step, { readonly kind: 'freeze' | 'hide' | 'show' | 'bootHidden' }>;

const visibilityKinds: ReadonlySet<Step['kind']> = new Set(['freeze', 'hide', 'show', 'bootHidden']);

const isVisibilityStep = (step: Step): step is VisibilityStep => visibilityKinds.has(step.kind);

const runVisibility = async (tab: Tab, step: VisibilityStep): Promise<void> => {
  switch (step.kind) {
    case 'freeze': {
      await hideAndShow(tab, step.via);
      return;
    }
    case 'hide': {
      hidePage(tab, step.via === 'hidden' ? 'hidden' : { persisted: true });
      return;
    }
    case 'show': {
      showPage(tab);
      return;
    }
    case 'bootHidden': {
      // A refresh while the tab is in the background (a restored session, say): the next page boots hidden.
      await leavePage(tab, { bootHidden: true });
    }
  }
};

const run = async (tabs: readonly [Tab, Tab], step: Step): Promise<number> => {
  if (isVisibilityStep(step)) {
    await runVisibility(tabs[step.tab], step);
    return 0;
  }
  switch (step.kind) {
    case 'deliver': {
      return deliverAll();
    }
    case 'announce': {
      // A third tab boots on this tab's build and announces itself; every tab hears it at once.
      const message = tabs[step.build].build;
      for (const channel of bus.channels) {
        channel.receive(message);
      }
      return 1;
    }
    case 'claimLive': {
      // A third tab, its build confirmed live by its own edge, says so and closes at once.
      const message = { buildId: tabs[step.build].build, live: true };
      for (const channel of bus.channels) {
        channel.receive(message);
      }
      return 1;
    }
    case 'answer': {
      tabs[step.tab].answer = step.answer;
      return 0;
    }
    case 'failure': {
      model.failures += 1;
      const failure = new TypeError(`Importing a module script failed. (${String(model.failures)})`);
      tabs[step.tab].failures.push({ failure, recovery: tabs[step.tab].recovery!, channels: new Set() });
      sight(tabs[step.tab], failure, step.channel);
      return 0;
    }
    case 'again': {
      const last = tabs[step.tab].failures.at(-1);
      // The same failure through another channel, on the page that saw it (the SDK's own load reaches no other).
      if (last !== undefined && last.sdk === undefined && last.recovery === tabs[step.tab].recovery) {
        sight(tabs[step.tab], last.failure, step.channel);
      }
      return 0;
    }
    case 'tick': {
      // The beacons sent so far have gone, so the browser takes more.
      for (const tab of tabs) {
        tab.beacons = beaconRoom;
      }
      await vi.advanceTimersByTimeAsync(step.ms);
      return 0;
    }
    case 'tracker': {
      // async-iife: bootstrap -- the entry starts error reporting without waiting.
      void startTracker(tabs[step.tab]);
      return 0;
    }
    case 'trackerFails': {
      model.failNextTrackerLoad = true;
      // async-iife: bootstrap -- the entry starts error reporting without waiting.
      void startTracker(tabs[step.tab]);
      return 0;
    }
    case 'query': {
      // async-iife: bootstrap -- a lookup another consumer started.
      void tabs[step.tab].skew?.queryLiveBuild();
      return 0;
    }
    case 'reload': {
      // A refresh on the same build: a fresh page announces itself again.
      await leavePage(tabs[step.tab]);
      return 0;
    }
    case 'sdkFails': {
      await failSdkLoad(tabs[step.tab], step.handOver);
      return 0;
    }
    case 'leave': {
      // The page's own automatic reload goes through (without this step, it stalls as time passes).
      const tab = tabs[step.tab];
      if (tab.recovery?.readReloadState() === 'pending') {
        await leavePage(tab);
      }
      return 0;
    }
  }
};

/** The error page's choice of the update prompt for a failure. */
const showsPrompt = (
  recovery: typeof StaleBuildRecovery,
  outcome: StaleBuildRecovery.StaleBuildOutcome | undefined,
  verdict: BuildSkew.ServerVerdict,
): boolean => recovery.showsUpdatePrompt(outcome, verdict);

/** I1, I3, I4 and I5 after one step. */
const checkStep = (
  tabs: readonly [Tab, Tab],
  step: Step,
  { fetchesBefore, delivered }: { readonly fetchesBefore: readonly number[]; readonly delivered: number },
): void => {
  const confirmations = 1 + (tabs[0].skew?.serverConfirmations ?? 2);
  for (const [index, tab] of tabs.entries()) {
    expect(tab.violations, `I8b and I10 tab ${String(index)}`).toStrictEqual([]);
    const skew = tab.skew!;
    const isWriting = !skew.isBuildSuperseded();
    if (!isWriting) {
      tab.everStopped = true;
    } else if (!tab.wasWriting) {
      tab.resumedWithOwn = tab.consecutiveOwn;
    }
    tab.wasWriting = isWriting;
    const verdict = skew.readServerVerdict();
    // I3: a confirmed `replaced` verdict always comes with an offer.
    if (verdict === 'replaced') {
      expect(skew.isReloadOffered(), `I3 tab ${String(index)}`).toBe(true);
    }
    // I7: no surface offers a reload while the page's own reload is pending.
    if (tab.recovery!.readReloadState() === 'pending') {
      expect(
        tab.recovery!.isReloadPromptShown(skew.isReloadOffered(), tab.recovery!.readReloadState()),
        `I7 tab ${String(index)}`,
      ).toBe(false);
    }
    // I4: a confirmed `live` verdict withdraws every offer, and no error page claims an update.
    if (verdict === 'live') {
      expect(skew.isReloadOffered(), `I4 tab ${String(index)}`).toBe(false);
      for (const { failure, recovery } of tab.failures) {
        if (recovery === tab.recovery) {
          const outcome = recovery.readStaleBuildOutcome(failure);
          expect(showsPrompt(recovery, outcome, verdict), `I4 page tab ${String(index)}`).toBe(false);
        }
      }
    }
    // I5: one step asks a bounded number of questions (one lookup and its confirmations per cause).
    const asked = tab.fetches - (fetchesBefore[index] ?? 0);
    const causes = 1 + delivered + (step.kind === 'tick' ? Math.ceil(step.ms / 1000) : 0);
    expect(asked, `I5 tab ${String(index)}`).toBeLessThanOrEqual(confirmations * causes);
  }
  // I1 (DF20): once messages are delivered, two builds never both write unless every tab a peer
  // stopped resumed on its own build confirmed as often as entering `replaced` takes.
  if (step.kind === 'deliver' && bus.queue.length === 0) {
    const bothWriting = tabs.every((tab) => !tab.skew!.isBuildSuperseded());
    if (bothWriting) {
      // I1b: an older tab never writes beside a newer one it was not told of (its edge may disagree).
      const [older, newer] = tabs[0].build < tabs[1].build ? tabs : [tabs[1], tabs[0]];
      expect(older.heard.has(newer.build), 'I1b older tab writes unaware of the newer one').toBe(true);
      for (const [index, tab] of tabs.entries()) {
        if (tab.everStopped) {
          expect(tab.resumedWithOwn ?? 0, `I1 tab ${String(index)}`).toBeGreaterThanOrEqual(confirmations);
        }
      }
    }
  }
};

/**
 * I2 (and I2b: the tag sent is the settled decision's, or what its page knew when it was hidden),
 * across every page of a tab, once the trackers are up and every wait has passed.
 */
const checkEnd = async (tabs: readonly [Tab, Tab]): Promise<void> => {
  for (const [index, tab] of tabs.entries()) {
    for (const { failure, recovery, sdk } of tab.failures) {
      const outcome = recovery.readStaleBuildOutcome(failure);
      if (sdk) {
        // I9: the error tracker's own load failing is never reported, to it or to analytics, whatever saw it.
        expect(tab.tracked.get(failure) ?? 0, `I9 tracker tab ${String(index)}`).toBe(0);
        expect(tab.analytics.get(failure) ?? 0, `I9 analytics tab ${String(index)}`).toBe(0);
        continue;
      }
      const omittedAtExit = tab.omittedAtExit.has(failure);
      expect(tab.tracked.get(failure) ?? 0, `I2 tracker tab ${String(index)}`).toBe(omittedAtExit ? 0 : 1);
      // I2b: the tag sent is the settled decision's, or what the page knew when it was hidden.
      const allowed = new Set(tab.tagsAtHide.get(failure));
      if (!tab.tagsAtLeave.has(failure) && outcome !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- Each tag was settled during the wait already.
        allowed.add(await recovery.classifyStaleBuildFailure(failure));
      }
      if (!omittedAtExit && allowed.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- Each tag was settled during the wait already.
        const sent = await tab.tags.get(failure);
        expect(allowed.has(sent!), `I2b tag tab ${String(index)} (${String(outcome)}: ${String(sent)})`).toBe(true);
      }
      expect(tab.analytics.get(failure) ?? 0, `I2 analytics tab ${String(index)} (${String(outcome)})`).toBe(
        outcome === 'current' ? 1 : 0,
      );
    }
  }
};

const tabIndex = constantFrom<0 | 1>(0, 1);
const answer = constantFrom<Answer>('X', 'Y', 'unreachable', 'none');
const channel = constantFrom<Channel>('boundary', 'global', 'preload');
const step: Arbitrary<Step> = oneof(
  { weight: 3, arbitrary: constant({ kind: 'deliver' } as const) },
  { weight: 1, arbitrary: record({ kind: constant<'announce'>('announce'), build: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'claimLive'>('claimLive'), build: tabIndex }) },
  { weight: 3, arbitrary: record({ kind: constant<'answer'>('answer'), tab: tabIndex, answer }) },
  { weight: 2, arbitrary: record({ kind: constant<'failure'>('failure'), tab: tabIndex, channel }) },
  { weight: 1, arbitrary: record({ kind: constant<'again'>('again'), tab: tabIndex, channel }) },
  { weight: 2, arbitrary: record({ kind: constant<'tick'>('tick'), ms: constantFrom(1000, 30_000) }) },
  { weight: 1, arbitrary: record({ kind: constant<'tracker'>('tracker'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'trackerFails'>('trackerFails'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'query'>('query'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'reload'>('reload'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'leave'>('leave'), tab: tabIndex }) },
  {
    weight: 1,
    arbitrary: record({
      kind: constant<'sdkFails'>('sdkFails'),
      tab: tabIndex,
      handOver: constantFrom<'prompt' | 'late'>('prompt', 'late'),
    }),
  },
  {
    weight: 1,
    arbitrary: record({ kind: constant<'freeze'>('freeze'), tab: tabIndex, via: constantFrom('pagehide', 'hidden') }),
  },
  {
    weight: 1,
    arbitrary: record({ kind: constant<'hide'>('hide'), tab: tabIndex, via: constantFrom('pagehide', 'hidden') }),
  },
  { weight: 1, arbitrary: record({ kind: constant<'show'>('show'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'bootHidden'>('bootHidden'), tab: tabIndex }) },
);

/** Sequences explored per run; the report quotes it. */
export const modelRuns = Number(process.env['TAU_MODEL_RUNS'] ?? 400);

beforeEach(() => {
  bus.queue.length = 0;
  bus.channels.clear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // The page's own reload is a request the model's `leave` step completes; every page listener is its page's.
  vi.stubGlobal('location', { href: 'https://taucad.dev/w/model', reload: () => undefined });
  vi.stubGlobal('fetch', ingest);
  vi.stubGlobal('navigator', { sendBeacon });
  vi.stubGlobal('addEventListener', (type: string, listener: (event: { readonly persisted: boolean }) => void) => {
    if (type === 'pagehide' && model.installing !== undefined) {
      model.installing.pageHide.push(listener);
    }
    if (type === 'pageshow' && model.installing !== undefined) {
      model.installing.pageShow.push(listener as () => void);
    }
  });
  vi.stubGlobal('removeEventListener', () => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('#lib/build-identity.js');
  vi.doUnmock('#lib/session-storage.js');
  vi.doUnmock('#environment.config.js');
  vi.doUnmock('#lib/sentry.lib.js');
});

type Setting = readonly [answerA: Answer, answerB: Answer, answerDelayA: number, pageAge: number];

/**
 * One run of the model: the steps, then every invariant. `inspect` sees the tabs once the end
 * checks passed, for the named scenarios below.
 */
const runModel = async (
  [answerA, answerB, answerDelayA, pageAge]: Setting,
  steps: readonly Step[],
  inspect?: (tabs: readonly [Tab, Tab]) => void,
): Promise<void> => {
  // Young pages reload on their own (the `leave` step lets one go through); older ones are offered the reload.
  vi.spyOn(performance, 'now').mockReturnValue(pageAge);
  model.failures = 0;
  bus.queue.length = 0;
  bus.channels.clear();
  const tabs = [newTab(buildX, answerA, answerDelayA), newTab(buildY, answerB, 0)] as const;
  model.tabs = [...tabs];
  model.failNextTrackerLoad = false;
  model.sdkLoadFailure = undefined;
  await loadTab(tabs[0]);
  await loadTab(tabs[1]);
  try {
    for (const next of steps) {
      const fetchesBefore = tabs.map((tab) => tab.fetches);
      // oxlint-disable-next-line no-await-in-loop -- The model runs one step at a time.
      const delivered = await run(tabs, next);
      // oxlint-disable-next-line no-await-in-loop -- The model runs one step at a time.
      await flush();
      checkStep(tabs, next, { fetchesBefore, delivered });
      for (const tab of tabs) {
        if (isHidden(tab)) {
          noteHiddenTags(tab);
          // oxlint-disable-next-line no-await-in-loop -- Each hidden tab in turn.
          await checkNothingWaitsWhileHidden(tab, next.kind);
        }
      }
    }
    // The tabs are shown again, so what the end checks wait for runs as on a visible page.
    for (const tab of tabs) {
      showPage(tab);
    }
    // A failing load the steps asked for that no page made does not carry into the end.
    model.failNextTrackerLoad = false;
    for (const tab of tabs) {
      // oxlint-disable-next-line no-await-in-loop -- Each tab's reporting starts in turn.
      await startTracker(tab);
    }
    // Past the longest wait `beforeSend` holds an event for, slow edges included.
    await vi.advanceTimersByTimeAsync(tabs[0].recovery!.staleBuildTagWait + 1000);
    await flush();
    for (const tab of tabs) {
      // oxlint-disable-next-line no-await-in-loop -- Each tab's reporting starts in turn.
      await startTracker(tab);
    }
    await checkEnd(tabs);
    inspect?.(tabs);
    // I6: no phase stops writes for good without a recheck, unless the server confirmed
    // another build (or there is no build endpoint, where the newer build wins as before).
    for (const tab of tabs) {
      tab.answer = tab.build === buildX ? 'X' : 'Y';
    }
    for (let round = 0; round < 12; round += 1) {
      deliverAll();
      // oxlint-disable-next-line no-await-in-loop -- Time passes one recheck at a time.
      await vi.advanceTimersByTimeAsync(30_000);
    }
    for (const [index, tab] of tabs.entries()) {
      if (tab.skew!.isBuildSuperseded() && !tab.sawNone) {
        expect(tab.skew!.readServerVerdict(), `I6 tab ${String(index)}`).toBe('replaced');
      }
    }
  } finally {
    for (const tab of tabs) {
      tab.skew?.closeBuildSkewChannel();
    }
  }
};

/** Tab A (build X) on a young page, its edge naming Y: its first failure reloads it on its own. */
const youngReplacedTab: Setting = ['Y', 'Y', 0, 1000];
/** Steps until tab A's lookup and its confirmations have run, so its reload is pending. */
const untilReloadPending: readonly Step[] = [
  { kind: 'failure', tab: 0, channel: 'boundary' },
  { kind: 'tick', ms: 1000 },
  { kind: 'tick', ms: 1000 },
];

describe('build-skew and stale-build-recovery, together (model)', () => {
  it('should account for three errors when the SDK fails and the page exits before their tags settle', async () => {
    await runModel(
      ['X', 'X', 0, 1000],
      [
        { kind: 'sdkFails', tab: 1, handOver: 'prompt' },
        { kind: 'failure', tab: 1, channel: 'boundary' },
        { kind: 'failure', tab: 1, channel: 'boundary' },
        { kind: 'failure', tab: 1, channel: 'boundary' },
        { kind: 'reload', tab: 1 },
      ],
      ([, tab]) => {
        expect(tab.tracked.size).toBe(2);
        expect(tab.omittedAtExit.size).toBe(1);
        expect(tab.exitSummaryCounts).toEqual([1]);
      },
    );
  });

  it('keep DF20, report every failure once, offer on replaced and withdraw on live, and ask a bounded number of times', async () => {
    await assert(
      asyncProperty(
        tuple(answer, answer, constantFrom(0, 3500), constantFrom(1000, 60_000)),
        array(step, { minLength: 1, maxLength: 12 }),
        async (setting, steps) => runModel(setting, steps),
      ),
      { numRuns: modelRuns },
    );
  }, 300_000);

  it('decide what a stalled reload covered as genuine once the server names this build again', async () => {
    await runModel(
      youngReplacedTab,
      [
        ...untilReloadPending,
        // Arrives while the reload is pending: provisionally the reload's.
        { kind: 'failure', tab: 0, channel: 'global' },
        { kind: 'answer', tab: 0, answer: 'X' },
        // The page never leaves: the reload stalls, and the stall check hears this build.
        { kind: 'tick', ms: 30_000 },
      ],
      ([tab]) => {
        expect(tab.failures).toHaveLength(2);
        for (const { failure, recovery } of tab.failures) {
          expect(recovery.readStaleBuildOutcome(failure)).toBe('current');
          expect(tab.analytics.get(failure)).toBe(1);
        }
      },
    );
  }, 60_000);

  it("decide a deploy's failure superseded though a peer's claim lands while the lookup confirms", async () => {
    await runModel(
      // Tab A's edge is slow and names Y throughout; the page is too old to reload on its own.
      ['Y', 'Y', 3500, 60_000],
      [
        { kind: 'failure', tab: 0, channel: 'boundary' },
        // The first answer (at 3.5 s) starts the confirmations; the first is asked at 4.5 s.
        ...Array.from({ length: 5 }, () => ({ kind: 'tick', ms: 1000 }) as const),
        // A tab on build Y boots while that confirmation is in flight.
        { kind: 'announce', build: 1 },
        { kind: 'tick', ms: 30_000 },
      ],
      ([tab]) => {
        const [failure] = tab.failures;
        expect(failure?.recovery.readStaleBuildOutcome(failure.failure)).toBe('superseded');
        expect(tab.analytics.get(failure?.failure) ?? 0).toBe(0);
        expect(tab.skew?.readServerVerdict()).toBe('replaced');
      },
    );
  }, 60_000);

  it('tell an older tab that boots while the newer one is stopped, once its writes resume, though the live-claiming tab closed', async () => {
    await runModel(
      ['X', 'X', 0, 60_000],
      [
        { kind: 'deliver' },
        // A tab on build X, confirmed live by its edge, claims it and closes: tab B (build Y) stops.
        { kind: 'claimLive', build: 0 },
        // Tab A boots afresh on build X while B is stopped; B stays silent to it.
        { kind: 'reload', tab: 0 },
        { kind: 'deliver' },
        { kind: 'answer', tab: 0, answer: 'Y' },
        { kind: 'answer', tab: 1, answer: 'Y' },
        // B's edge names Y as often as leaving supersession takes: B writes again, and says so.
        ...Array.from({ length: 3 }, () => ({ kind: 'tick', ms: 30_000 }) as const),
        { kind: 'deliver' },
      ],
      ([older, newer]) => {
        expect(newer.skew?.isBuildSuperseded()).toBe(false);
        expect(older.heard.has(newer.build)).toBe(true);
      },
    );
  }, 60_000);

  it.each(['pagehide', 'hidden'] as const)(
    'keep what a hide (%s) cannot fit in the beacons the browser takes waiting, never sent as a request while hidden, and send it once shown',
    async (via) => {
      await runModel(
        ['Y', 'Y', 3500, 60_000],
        [
          { kind: 'trackerFails', tab: 0 },
          // Decisions still under way when the page is hidden, more than the browser takes beacons for.
          ...Array.from({ length: 4 }, () => ({ kind: 'failure', tab: 0, channel: 'boundary' }) as const),
          { kind: 'hide', tab: 0, via },
          { kind: 'show', tab: 0 },
        ],
        ([tab]) => {
          expect(tab.failures).toHaveLength(4);
          for (const { failure } of tab.failures) {
            expect(tab.tracked.get(failure)).toBe(1);
          }
        },
      );
    },
    60_000,
  );

  it('send errors reported after a failed SDK load without it, once, with the decision of the page that saw them', async () => {
    await runModel(
      youngReplacedTab,
      [
        { kind: 'trackerFails', tab: 0 },
        ...untilReloadPending,
        { kind: 'failure', tab: 0, channel: 'boundary' },
        { kind: 'leave', tab: 0 },
      ],
      ([tab]) => {
        expect(tab.failures).toHaveLength(2);
        // Both were sent by the page that saw them, with the decision it had made when it went.
        expect([...tab.tagsAtLeave.values()]).toStrictEqual(['superseded', 'superseded']);
        for (const { failure } of tab.failures) {
          expect(tab.tracked.get(failure)).toBe(1);
        }
      },
    );
  }, 60_000);

  it.each(['pagehide', 'hidden'] as const)(
    'release an event the tracker held when the page is hidden (%s), tagged undecided, and carry on once shown again',
    async (via) => {
      await runModel(
        // Tab A's edge is slow, so its decision is still under way when the page is hidden.
        ['Y', 'Y', 3500, 60_000],
        [
          { kind: 'tracker', tab: 0 },
          { kind: 'failure', tab: 0, channel: 'global' },
          { kind: 'freeze', tab: 0, via },
          { kind: 'failure', tab: 0, channel: 'boundary' },
        ],
        ([tab]) => {
          const [frozen, later] = tab.failures;
          expect([...(tab.tagsAtHide.get(frozen?.failure) ?? [])]).toStrictEqual(['undecided']);
          expect(frozen?.recovery.readStaleBuildOutcome(frozen.failure)).toBe('superseded');
          // The page carried on: the failure after it was shown again was decided and sent as usual.
          expect(later?.recovery.readStaleBuildOutcome(later.failure)).toBe('superseded');
          expect(tab.tracked.get(later?.failure)).toBe(1);
        },
      );
    },
    60_000,
  );

  it('send at once what a page that boots hidden reports, through its first pageshow, until it is shown', async () => {
    await runModel(
      // A slow edge: the decision is still under way when each failure is reported.
      ['Y', 'Y', 3500, 60_000],
      [
        { kind: 'bootHidden', tab: 0 },
        { kind: 'failure', tab: 0, channel: 'boundary' },
        { kind: 'tracker', tab: 0 },
        { kind: 'failure', tab: 0, channel: 'global' },
        { kind: 'show', tab: 0 },
        { kind: 'failure', tab: 0, channel: 'boundary' },
      ],
      ([tab]) => {
        const [first, second, later] = tab.failures;
        expect([...(tab.tagsAtHide.get(first?.failure) ?? [])]).toContain('undecided');
        expect([...(tab.tagsAtHide.get(second?.failure) ?? [])]).toContain('undecided');
        // Shown: the failure after it was decided and sent as usual.
        expect(tab.tagsAtHide.has(later?.failure)).toBe(false);
        expect(tab.tracked.get(later?.failure)).toBe(1);
      },
    );
  }, 60_000);

  it.each(['pagehide', 'hidden'] as const)(
    'send at once an error reported while the page is hidden (%s) after the SDK failed to load',
    async (via) => {
      await runModel(
        ['Y', 'Y', 3500, 60_000],
        [
          { kind: 'trackerFails', tab: 0 },
          { kind: 'hide', tab: 0, via },
          { kind: 'failure', tab: 0, channel: 'boundary' },
          { kind: 'failure', tab: 0, channel: 'preload' },
        ],
        ([tab]) => {
          for (const { failure } of tab.failures) {
            expect([...(tab.tagsAtHide.get(failure) ?? [])]).toContain('undecided');
            expect(tab.tracked.get(failure)).toBe(1);
          }
        },
      );
    },
    60_000,
  );

  it.each([
    { name: 'the live build (a content blocker)', served: 'X', decided: 'current', handOver: 'prompt' },
    // The reload it started never goes through here, so it stalls and is offered.
    { name: 'a deploy that stopped serving it', served: 'Y', decided: 'superseded', handOver: 'prompt' },
    // A fast verdict (the edge cannot answer) lands before the loader hands the failure over.
    {
      name: 'an edge that cannot answer, the verdict first',
      served: 'unreachable',
      decided: 'current',
      handOver: 'late',
    },
    { name: 'the live build, the verdict first', served: 'X', decided: 'current', handOver: 'late' },
  ] as const)(
    "never report the error tracker's own chunk failing on $name, though Vite's preloader reported it first",
    async ({ served, decided, handOver }) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await runModel(
        [served, served, 0, 1000],
        [{ kind: 'sdkFails', tab: 0, handOver }, ...untilReloadPending.slice(1)],
        ([tab]) => {
          const [blocked] = tab.failures;
          expect(blocked?.sdk).toBe(true);
          expect(blocked?.recovery.readStaleBuildOutcome(blocked.failure)).toBe(decided);
          expect(tab.tracked.get(blocked?.failure) ?? 0).toBe(0);
          expect(tab.analytics.get(blocked?.failure) ?? 0).toBe(0);
        },
      );
    },
    60_000,
  );
});
