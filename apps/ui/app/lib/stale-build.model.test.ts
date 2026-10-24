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
 * apps), and the SDK's own chunk can fail as Vite's preload helper reports it: `vite:preloadError`
 * first, then the loader's own hand-over.
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
  | { readonly kind: 'answer'; readonly tab: 0 | 1; readonly answer: Answer }
  | { readonly kind: 'failure'; readonly tab: 0 | 1; readonly channel: Channel }
  | { readonly kind: 'again'; readonly tab: 0 | 1; readonly channel: Channel }
  | { readonly kind: 'tick'; readonly ms: number }
  | { readonly kind: 'tracker'; readonly tab: 0 | 1 }
  | { readonly kind: 'trackerFails'; readonly tab: 0 | 1 }
  | { readonly kind: 'query'; readonly tab: 0 | 1 }
  | { readonly kind: 'reload'; readonly tab: 0 | 1 }
  | { readonly kind: 'leave'; readonly tab: 0 | 1 }
  | { readonly kind: 'sdkFails'; readonly tab: 0 | 1 }
  | { readonly kind: 'freeze'; readonly tab: 0 | 1; readonly via: 'pagehide' | 'hidden' };

/**
 * The model's shared state: its tabs, whether the next SDK load fails, the page whose listeners are
 * being installed, and how many failures were made (each has its own message, as a stored error is
 * matched by it).
 */
const model = {
  tabs: [] as Tab[],
  failNextTrackerLoad: false,
  installing: undefined as Tab | undefined,
  failures: 0,
  visibility: 'visible' as 'visible' | 'hidden',
};

/** The tabs' shared BroadcastChannel, delivering only when the model says so. */
const bus = {
  queue: [] as Array<{ readonly from: FakeChannel; readonly data: unknown }>,
  channels: new Set<FakeChannel>(),
};

class FakeChannel {
  private readonly listeners: Array<(event: { readonly data: unknown }) => void> = [];
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
  errorReporting?: typeof ErrorReporting;
  /** Events the model error tracker sent per failure; Sentry ignores a second capture of the same value. */
  readonly tracked: Map<unknown, number>;
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
  }>;
  everStopped: boolean;
  wasWriting: boolean;
  resumedWithOwn: number | undefined;
  skew?: typeof BuildSkew;
  recovery?: typeof StaleBuildRecovery;
};

const loadTab = async (tab: Tab): Promise<void> => {
  vi.resetModules();
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
  tab.skew = await import('#filesystem/build-skew.js');
  tab.recovery = await import('#lib/stale-build-recovery.js');
  tab.recovery.subscribeGenuineFailures((failure) => {
    tab.analytics.set(failure, (tab.analytics.get(failure) ?? 0) + 1);
  });
  // The entry installs the recovery on every page; its `pagehide` listener is this page's.
  tab.pageHide = [];
  tab.pageShow = [];
  tab.visibility = [];
  model.installing = tab;
  tab.recovery.installStaleBuildRecovery();
  model.installing = undefined;
};

/**
 * The model ingest: an event sent without the SDK (`sendSentryEventDirectly`) is counted for the
 * failure whose message it carries (each failure's is unique), with the tag it was sent with.
 */
const ingest = async (_url: string, init: { readonly body?: unknown }): Promise<Response> => {
  const event = JSON.parse(String(init.body).split('\n')[2] ?? '{}') as {
    readonly tags?: Readonly<Record<string, string>>;
    readonly exception?: { readonly values?: ReadonlyArray<{ readonly value?: string }> };
  };
  const message = event.exception?.values?.[0]?.value;
  for (const tab of model.tabs) {
    const failure = tab.failures.find(
      (candidate) => candidate.failure instanceof Error && candidate.failure.message === message,
    )?.failure;
    if (failure !== undefined) {
      tab.tracked.set(failure, (tab.tracked.get(failure) ?? 0) + 1);
      tab.tags.set(failure, Promise.resolve(event.tags?.['stale_build'] as StaleBuildRecovery.StaleBuildTag));
    }
  }
  return new Response('{}');
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
  const page = tab.recovery!;
  if (how === 'hidden') {
    model.visibility = 'hidden';
    for (const listener of tab.visibility) {
      listener();
    }
  } else {
    for (const listener of tab.pageHide) {
      listener(how);
    }
  }
  for (const { failure, recovery } of tab.failures) {
    if (recovery === page) {
      const known = tab.tagsAtHide.get(failure) ?? new Set();
      known.add(page.readStaleBuildTag(failure));
      tab.tagsAtHide.set(failure, known);
    }
  }
}

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
const leavePage = async (tab: Tab): Promise<void> => {
  const page = tab.recovery!;
  hidePage(tab, { persisted: false });
  for (const { failure, recovery } of tab.failures) {
    if (recovery === page) {
      tab.tagsAtLeave.set(failure, page.readStaleBuildTag(failure));
    }
  }
  tab.skew?.closeBuildSkewChannel();
  await loadTab(tab);
};

const newTab = (build: number, answer: Answer, answerDelay: number): Tab => ({
  build,
  answer,
  answerDelay,
  consecutiveOwn: 0,
  fetches: 0,

  tracked: new Map(),
  tagsAtLeave: new Map(),
  tagsAtHide: new Map(),
  storage: new Map(),
  pageHide: [],
  pageShow: [],
  visibility: [],
  tags: new Map(),
  sawNone: false,
  analytics: new Map(),
  failures: [],
  everStopped: false,
  wasWriting: true,
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

const startTracker = async (tab: Tab): Promise<void> => {
  await tab.errorReporting?.startErrorReporting();
};

const sight = (tab: Tab, failure: unknown, channel: Channel): void => {
  // async-iife: bootstrap -- the decision lands on its own, as from a listener.
  void tab.recovery?.recoverFromStaleBuild(failure, channel);
  /* Sentry's own global handlers capture what reaches `window`, once installed, and after the
   * recovery's capture-phase listener (`installStaleBuildRecovery`), which has started the decision. */
  if (channel === 'global' && tab.errorReporting?.isErrorTrackerListening() === true) {
    captureValue(failure);
  }
};

/**
 * The error tracker's own chunk fails to load: Vite's preload helper, which wraps that import too,
 * dispatches the failure, then rethrows it into the loader, which hands it over.
 */
const failSdkLoad = async (tab: Tab): Promise<void> => {
  model.failures += 1;
  const page = tab.recovery!;
  const failure = new TypeError(
    `Failed to fetch dynamically imported module: /assets/sentry.lib-${String(model.failures)}.js`,
  );
  tab.failures.push({ failure, recovery: page, sdk: true });
  sight(tab, failure, 'preload');
  await Promise.resolve();
  page.recoverFromSdkLoadFailure(failure);
};

/** Hidden (into the back/forward cache, or by switching away), then shown again: the page carries on. */
const hideAndShow = async (tab: Tab, via: 'pagehide' | 'hidden'): Promise<void> => {
  hidePage(tab, via === 'hidden' ? 'hidden' : { persisted: true });
  // I8: nothing the hidden page held waits past it: every event the tracker held for it has gone.
  for (const { failure, recovery } of tab.failures) {
    if (recovery === tab.recovery && tab.tracked.has(failure)) {
      // oxlint-disable-next-line no-await-in-loop -- Each held tag in turn.
      expect(await hasSettled(tab.tags.get(failure)), `I8 held tag released on ${via}`).toBe(true);
    }
  }
  if (via === 'hidden') {
    model.visibility = 'visible';
  }
  for (const listener of via === 'hidden' ? tab.visibility : tab.pageShow) {
    listener();
  }
};

const run = async (tabs: readonly [Tab, Tab], step: Step): Promise<number> => {
  switch (step.kind) {
    case 'deliver': {
      return deliverAll();
    }
    case 'answer': {
      tabs[step.tab].answer = step.answer;
      return 0;
    }
    case 'failure': {
      model.failures += 1;
      const failure = new TypeError(`Importing a module script failed. (${String(model.failures)})`);
      tabs[step.tab].failures.push({ failure, recovery: tabs[step.tab].recovery! });
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
      await failSdkLoad(tabs[step.tab]);
      return 0;
    }
    case 'freeze': {
      await hideAndShow(tabs[step.tab], step.via);
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
      expect(tab.tracked.get(failure) ?? 0, `I2 tracker tab ${String(index)}`).toBe(1);
      // I2b: the tag sent is the settled decision's, or what the page knew when it was hidden.
      const allowed = new Set(tab.tagsAtHide.get(failure));
      if (!tab.tagsAtLeave.has(failure) && outcome !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- Each tag was settled during the wait already.
        allowed.add(await recovery.classifyStaleBuildFailure(failure));
      }
      if (allowed.size > 0) {
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
  { weight: 3, arbitrary: record({ kind: constant<'answer'>('answer'), tab: tabIndex, answer }) },
  { weight: 2, arbitrary: record({ kind: constant<'failure'>('failure'), tab: tabIndex, channel }) },
  { weight: 1, arbitrary: record({ kind: constant<'again'>('again'), tab: tabIndex, channel }) },
  { weight: 2, arbitrary: record({ kind: constant<'tick'>('tick'), ms: constantFrom(1000, 30_000) }) },
  { weight: 1, arbitrary: record({ kind: constant<'tracker'>('tracker'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'trackerFails'>('trackerFails'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'query'>('query'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'reload'>('reload'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'leave'>('leave'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'sdkFails'>('sdkFails'), tab: tabIndex }) },
  {
    weight: 1,
    arbitrary: record({ kind: constant<'freeze'>('freeze'), tab: tabIndex, via: constantFrom('pagehide', 'hidden') }),
  },
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
  vi.stubGlobal('addEventListener', (type: string, listener: (event: { readonly persisted: boolean }) => void) => {
    if (type === 'pagehide' && model.installing !== undefined) {
      model.installing.pageHide.push(listener);
    }
    if (type === 'pageshow' && model.installing !== undefined) {
      model.installing.pageShow.push(listener as () => void);
    }
  });
  vi.stubGlobal('removeEventListener', () => undefined);
  model.visibility = 'visible';
  vi.stubGlobal('document', {
    get visibilityState() {
      return model.visibility;
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange' && model.installing !== undefined) {
        model.installing.visibility.push(listener);
      }
    },
    removeEventListener: () => undefined,
  });
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

  it.each([
    ['the live build (a content blocker)', 'X', 'current'],
    // The reload it started never goes through here, so it stalls and is offered.
    ['a deploy that stopped serving it', 'Y', 'superseded'],
  ] as const)(
    "never report the error tracker's own chunk failing on %s, though Vite's preloader reported it first",
    async (_case, served, decided) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await runModel(
        [served, served, 0, 1000],
        [{ kind: 'tracker', tab: 0 }, { kind: 'sdkFails', tab: 0 }, ...untilReloadPending.slice(1)],
        ([tab]) => {
          const [blocked] = tab.failures;
          expect(blocked?.recovery.readStaleBuildOutcome(blocked.failure)).toBe(decided);
          expect(tab.tracked.get(blocked?.failure) ?? 0).toBe(0);
          expect(tab.analytics.get(blocked?.failure) ?? 0).toBe(0);
        },
      );
    },
    60_000,
  );
});
