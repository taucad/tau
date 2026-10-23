// @vitest-environment node
/**
 * Model test of `build-skew` and `stale-build-recovery` together (TAU-UI-6, DF20): two tabs, A on
 * build X and B on build Y, run the real modules with fake time, a fake `/health/build` per tab
 * (so edges can disagree), a fake BroadcastChannel and a model error tracker. fast-check explores
 * bounded sequences of announcements, server answers, chunk failures, timer ticks, error-tracker
 * start-up and reloads, and the invariants below are checked after every step.
 */
import process from 'node:process';
import { array, assert, asyncProperty, constant, constantFrom, oneof, record, tuple } from 'fast-check';
import type { Arbitrary } from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BuildIdentity from '#lib/build-identity.js';
import type * as BuildSkew from '#filesystem/build-skew.js';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';

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
  | { readonly kind: 'query'; readonly tab: 0 | 1 }
  | { readonly kind: 'reload'; readonly tab: 0 | 1 };

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
  trackerReady: boolean;
  readonly trackerQueue: unknown[];
  /** Failures the model error tracker holds; Sentry ignores a second capture of the same error. */
  readonly tracked: Set<unknown>;
  /** The `stale_build` tag each tracked failure's event was sent with (`beforeSend` holds it). */
  readonly tags: Map<unknown, Promise<StaleBuildRecovery.StaleBuildTag>>;
  /** The edge once answered `none` (no build endpoint): the newer build wins and nothing is asked again. */
  sawNone: boolean;
  readonly analytics: Map<unknown, number>;
  /** Each failure with the page (module instance) that saw it; a reload starts a new page. */
  readonly failures: Array<{ readonly failure: unknown; readonly recovery: typeof StaleBuildRecovery }>;
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
  const storage = new Map<string, string>();
  vi.doMock('#lib/session-storage.js', () => ({
    readSessionStorage: () => ({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    }),
  }));
  vi.doMock('#lib/error-reporting.js', () => ({
    startErrorReporting: async () => undefined,
    isErrorTrackerListening: () => tab.trackerReady,
    reportUiError: async (error: unknown) => {
      if (tab.trackerReady) {
        track(tab, error);
      } else {
        tab.trackerQueue.push(error);
      }
    },
  }));
  tab.skew = await import('#filesystem/build-skew.js');
  tab.recovery = await import('#lib/stale-build-recovery.js');
  tab.recovery.subscribeGenuineFailures((failure) => {
    tab.analytics.set(failure, (tab.analytics.get(failure) ?? 0) + 1);
  });
};

const newTab = (build: number, answer: Answer, answerDelay: number): Tab => ({
  build,
  answer,
  answerDelay,
  consecutiveOwn: 0,
  fetches: 0,
  trackerReady: false,
  trackerQueue: [],
  tracked: new Set(),
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

/** The model error tracker captures a failure once, its event tagged as `beforeSend` would. */
function track(tab: Tab, failure: unknown): void {
  if (tab.tracked.has(failure)) {
    return;
  }
  tab.tracked.add(failure);
  const page = tab.failures.find((entry) => entry.failure === failure)?.recovery ?? tab.recovery!;
  tab.tags.set(failure, page.classifyStaleBuildFailure(failure));
}

const startTracker = (tab: Tab): void => {
  tab.trackerReady = true;
  for (const error of tab.trackerQueue.splice(0)) {
    track(tab, error);
  }
};

const sight = (tab: Tab, failure: unknown, channel: Channel): void => {
  // async-iife: bootstrap -- the decision lands on its own, as from a listener.
  void tab.recovery?.recoverFromStaleBuild(failure, channel);
  /* Sentry's own global handlers capture what reaches `window`, once installed, and after the
   * recovery's capture-phase listener (`installStaleBuildRecovery`), which has started the decision. */
  if (channel === 'global' && tab.trackerReady) {
    track(tab, failure);
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
      const failure = new TypeError('Importing a module script failed.');
      tabs[step.tab].failures.push({ failure, recovery: tabs[step.tab].recovery! });
      sight(tabs[step.tab], failure, step.channel);
      return 0;
    }
    case 'again': {
      const last = tabs[step.tab].failures.at(-1);
      // The same failure through another channel, on the page that saw it.
      if (last !== undefined && last.recovery === tabs[step.tab].recovery) {
        sight(tabs[step.tab], last.failure, step.channel);
      }
      return 0;
    }
    case 'tick': {
      await vi.advanceTimersByTimeAsync(step.ms);
      return 0;
    }
    case 'tracker': {
      startTracker(tabs[step.tab]);
      return 0;
    }
    case 'query': {
      // async-iife: bootstrap -- a lookup another consumer started.
      void tabs[step.tab].skew?.queryLiveBuild();
      return 0;
    }
    case 'reload': {
      // A refresh on the same build: a fresh page announces itself again.
      const tab = tabs[step.tab];
      tab.skew?.closeBuildSkewChannel();
      await loadTab(tab);
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

/** I2 (and I2b: the tag sent is the settled decision's) once the trackers are up and every wait has passed. */
const checkEnd = async (tabs: readonly [Tab, Tab]): Promise<void> => {
  for (const [index, tab] of tabs.entries()) {
    for (const { failure, recovery } of tab.failures) {
      const outcome = recovery.readStaleBuildOutcome(failure);
      expect(tab.tracked.has(failure), `I2 tracker tab ${String(index)}`).toBe(true);
      if (outcome !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- Each tag was settled during the wait already.
        const [sent, settled] = await Promise.all([tab.tags.get(failure), recovery.classifyStaleBuildFailure(failure)]);
        expect(sent, `I2b tag tab ${String(index)} (${outcome})`).toBe(settled);
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
  { weight: 1, arbitrary: record({ kind: constant<'query'>('query'), tab: tabIndex }) },
  { weight: 1, arbitrary: record({ kind: constant<'reload'>('reload'), tab: tabIndex }) },
);

/** Sequences explored per run; the report quotes it. */
export const modelRuns = Number(process.env['TAU_MODEL_RUNS'] ?? 400);

beforeEach(() => {
  bus.queue.length = 0;
  bus.channels.clear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // Past the auto-reload window: reloads are offered, never made (the reload path has its own tests).
  vi.spyOn(performance, 'now').mockReturnValue(60_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('#lib/build-identity.js');
  vi.doUnmock('#lib/session-storage.js');
  vi.doUnmock('#lib/error-reporting.js');
});

describe('build-skew and stale-build-recovery, together (model)', () => {
  it('keep DF20, report every failure once, offer on replaced and withdraw on live, and ask a bounded number of times', async () => {
    await assert(
      asyncProperty(
        tuple(answer, answer, constantFrom(0, 3500)),
        array(step, { minLength: 1, maxLength: 12 }),
        async ([answerA, answerB, answerDelayA], steps) => {
          bus.queue.length = 0;
          bus.channels.clear();
          const tabs = [newTab(buildX, answerA, answerDelayA), newTab(buildY, answerB, 0)] as const;
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
            for (const tab of tabs) {
              startTracker(tab);
            }
            // Past the longest wait `beforeSend` holds an event for, slow edges included.
            await vi.advanceTimersByTimeAsync(tabs[0].recovery!.staleBuildTagWait + 1000);
            await flush();
            for (const tab of tabs) {
              startTracker(tab);
            }
            await checkEnd(tabs);
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
        },
      ),
      { numRuns: modelRuns },
    );
  }, 300_000);
});
