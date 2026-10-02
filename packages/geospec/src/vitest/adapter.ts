/** Vitest integration for the runner-independent GeoSpec assertion client. @module */

import { afterEach, expect } from 'vitest';
import type { MatcherState } from 'vitest';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '#assertion-client/index.js';
import type {
  GeoSpecAssertionClient,
  GeoSpecAssertionClientOptions,
  GeoSpecMatcherMethods,
} from '#assertion-client/index.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';
import type { GeoSpecMatcherName } from '#engine/matchers.js';
import type { GeoSpecCanonicalClaimReport, GeoSpecNativeSubject } from '#engine/client.js';
import type { GeoSpecSubject } from '#model/subject.js';

type GeoSpecVitestMatcherMethods = GeoSpecMatcherMethods<Promise<void>>;
type GeoSpecVitestResult = {
  readonly actual: GeoSpecCanonicalClaimReport;
  readonly expected: Readonly<{ claimId: string; polarity: string; status: string }>;
  readonly message: () => string;
  readonly meta: Readonly<{ geoSpec: GeoSpecCanonicalClaimReport }>;
  readonly pass: boolean;
};
type GeoSpecVitestMatcher = (
  this: MatcherState,
  received: GeoSpecNativeSubject | GeoSpecSubject | PromiseLike<GeoSpecNativeSubject | GeoSpecSubject>,
  ...arguments_: readonly unknown[]
) => Promise<GeoSpecVitestResult>;
type GeoSpecVitestMatcherMap = Record<string, GeoSpecVitestMatcher>;
type GeoSpecVitestTestTask = {
  onFinished?: Array<() => unknown>;
  promises?: Array<Promise<unknown>>;
};

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-empty-object-type, typescript/no-explicit-any -- Vitest's merge target is an interface with this exact generic default.
  interface Matchers<T = any> extends GeoSpecVitestMatcherMethods {}
}

/** Installed Vitest matcher map and lifecycle settlement hook. @public */
export type GeoSpecVitestAdapter = {
  readonly matchers: GeoSpecVitestMatcherMap;
  flush(): Promise<void>;
};

const resultEvidence = (report: GeoSpecCanonicalClaimReport): Record<string, unknown> | undefined =>
  report.evidence !== null && typeof report.evidence === 'object' && !Array.isArray(report.evidence)
    ? report.evidence
    : undefined;

const frameworkResult = (state: MatcherState, report: GeoSpecCanonicalClaimReport): GeoSpecVitestResult => {
  const positiveSatisfied = resultEvidence(report)?.['positiveSatisfied'];
  const evaluated =
    (report.status === 'passed' || report.status === 'failed') && typeof positiveSatisfied === 'boolean';
  const statusMatchesPolarity =
    evaluated && (report.status === 'passed') === (positiveSatisfied === (report.polarity === 'positive'));
  return {
    // Vitest applies `.not` after this result. Terminal, missing-evidence and
    // contradictory reports use the current host polarity so both forms fail.
    pass: statusMatchesPolarity ? positiveSatisfied : state.isNot,
    actual: report,
    expected: { claimId: report.claimId, polarity: report.polarity, status: report.status },
    meta: { geoSpec: report },
    message: () => JSON.stringify(report.result),
  };
};

// Vitest's custom matcher wrapper creates the final assertion promise by
// calling this thenable. Tracking that final promise is the only point where
// ignored and explicitly awaited assertions can still be distinguished.
// oxlint-disable unicorn/no-thenable, typescript/promise-function-async, promise/prefer-await-to-then, typescript/parameter-properties, typescript/no-restricted-types, typescript/no-floating-promises, tau-lint/no-async-iife -- Promise interposition is the Vitest 4.1 settlement seam; erasableSyntaxOnly forbids the preferred parameter properties.
class VitestPromiseTracker {
  private readonly task: GeoSpecVitestTestTask;
  private readonly tracked: Array<Promise<unknown>> = [];

  public constructor(task: GeoSpecVitestTestTask) {
    this.task = task;
    task.onFinished ??= [];
    void task.onFinished.push(() => {
      while (this.tracked.length > 0) {
        const [promise] = this.tracked;
        if (promise === undefined) {
          break;
        }
        this.remove(promise);
      }
    });
  }

  public replace<Previous, Next>(current: TestTrackedPromise<Previous>, promise: Promise<Next>): Promise<Next> {
    this.remove(current);
    return this.track(promise);
  }

  public track<Result>(promise: Promise<Result>): Promise<Result> {
    const tracked = new TestTrackedPromise(promise, this);
    this.task.promises ??= [];
    void this.task.promises.push(tracked);
    void this.tracked.push(tracked);
    return tracked;
  }

  private remove(promise: Promise<unknown>): void {
    const taskIndex = this.task.promises?.indexOf(promise) ?? -1;
    if (taskIndex !== -1) {
      void this.task.promises?.splice(taskIndex, 1);
    }
    const trackedIndex = this.tracked.indexOf(promise);
    if (trackedIndex !== -1) {
      void this.tracked.splice(trackedIndex, 1);
    }
  }
}

class TestTrackedPromise<Result> implements Promise<Result> {
  private readonly promise: Promise<Result>;
  private readonly tracker: VitestPromiseTracker;

  public constructor(promise: Promise<Result>, tracker: VitestPromiseTracker) {
    this.promise = promise;
    this.tracker = tracker;
    void promise.catch(() => undefined);
  }

  public get [Symbol.toStringTag](): string {
    return 'Promise';
  }

  public then<Fulfilled = Result, Rejected = never>(
    onfulfilled?: ((value: Result) => Fulfilled | PromiseLike<Fulfilled>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<Rejected> | Rejected) | null,
  ): Promise<Fulfilled | Rejected> {
    return this.tracker.replace(this, this.promise.then(onfulfilled, onrejected));
  }

  public catch<Caught = never>(
    onrejected?: ((reason: unknown) => Caught | PromiseLike<Caught>) | null,
  ): Promise<Caught | Result> {
    return this.tracker.replace(this, this.promise.catch(onrejected));
  }

  public finally(onfinally?: (() => void) | null): Promise<Result> {
    return this.tracker.replace(this, this.promise.finally(onfinally));
  }
}

class VitestMatcherPromise implements Promise<GeoSpecVitestResult> {
  private readonly invocationStack: string | undefined;
  private readonly promise: Promise<GeoSpecVitestResult>;
  private readonly task: GeoSpecVitestTestTask | undefined;

  public constructor(promise: Promise<GeoSpecVitestResult>, task?: GeoSpecVitestTestTask, invocationStack?: string) {
    this.promise = promise;
    this.task = task;
    this.invocationStack = invocationStack;
  }

  public get [Symbol.toStringTag](): string {
    return 'Promise';
  }

  public then<Fulfilled = GeoSpecVitestResult, Rejected = never>(
    onfulfilled?: ((value: GeoSpecVitestResult) => Fulfilled | PromiseLike<Fulfilled>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<Rejected> | Rejected) | null,
  ): Promise<Fulfilled | Rejected> {
    const assertion = this.promise.then(onfulfilled, onrejected).catch((error: unknown) => {
      if (error instanceof Error && this.invocationStack !== undefined) {
        const frames = this.invocationStack.split('\n').slice(1).join('\n');
        error.stack = `${error.stack ?? error.message}\nGeoSpec assertion invoked at:\n${frames}`;
      }
      throw error;
    });
    return this.task === undefined ? assertion : new VitestPromiseTracker(this.task).track(assertion);
  }

  public catch<Caught = never>(
    onrejected?: ((reason: unknown) => Caught | PromiseLike<Caught>) | null,
  ): Promise<Caught | GeoSpecVitestResult> {
    return this.promise.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null): Promise<GeoSpecVitestResult> {
    return this.promise.finally(onfinally);
  }
}
// oxlint-enable unicorn/no-thenable, typescript/promise-function-async, promise/prefer-await-to-then, typescript/parameter-properties, typescript/no-restricted-types, typescript/no-floating-promises, tau-lint/no-async-iife

/**
 * Create Vitest matchers over an existing runner-independent client.
 *
 * @param client - Native GeoSpec assertion client shared with standalone use.
 * @returns Matchers and a hook that settles every operation started by a test.
 * @public
 */
export const createGeoSpecVitestAdapter = (client: GeoSpecAssertionClient): GeoSpecVitestAdapter => {
  const pending = new Set<Promise<GeoSpecCanonicalClaimReport>>();
  const matchers: GeoSpecVitestMatcherMap = {};

  for (const matcher of Object.keys(geoSpecMatcherDescriptors) as GeoSpecMatcherName[]) {
    // This must throw synchronously for Vitest's asymmetric path, which cannot
    // consume an asynchronous custom matcher result.
    // oxlint-disable-next-line typescript/promise-function-async -- A synchronous throw rejects Vitest's unsupported asymmetric path before it treats a Promise as truthy.
    matchers[matcher] = function (
      this: MatcherState,
      received: GeoSpecNativeSubject | GeoSpecSubject | PromiseLike<GeoSpecNativeSubject | GeoSpecSubject>,
      ...arguments_: readonly unknown[]
    ): Promise<GeoSpecVitestResult> {
      if (!Reflect.has(this, 'assertion')) {
        throw new TypeError('GeoSpec Vitest matchers do not support asymmetric use.');
      }
      const task = Reflect.get(this, 'task') as GeoSpecVitestTestTask | undefined;
      const operation = (async (): Promise<GeoSpecCanonicalClaimReport> => {
        const subject = await received;
        const chain = client.expectGeo(subject);
        const methods = this.isNot ? chain.not : chain;
        try {
          return Reflect.apply(methods[matcher], methods, arguments_) as GeoSpecCanonicalClaimReport;
        } catch (error) {
          if (error instanceof GeoSpecAssertionError) {
            return error.report;
          }
          throw error;
        }
      })();
      if (task === undefined) {
        pending.add(operation);
      }
      const framework = (async (): Promise<GeoSpecVitestResult> => frameworkResult(this, await operation))();
      return new VitestMatcherPromise(framework, task, new Error('Track GeoSpec assertion origin.').stack);
    };
  }

  const flush = async (): Promise<void> => {
    const operations = [...pending];
    pending.clear();
    const reports = await Promise.all(operations);
    const failed = reports.find((report) => report.status !== 'passed');
    if (failed !== undefined) {
      throw new GeoSpecAssertionError(failed);
    }
    if (pending.size > 0) {
      await flush();
    }
  };

  return { matchers, flush };
};

/**
 * Register GeoSpec matchers and their settlement hook in the active Vitest file.
 *
 * @param client - Native client shared with standalone assertion calls.
 * @returns The installed adapter for reporters or explicit flushing.
 * @public
 */
export const installGeoSpecVitest = (client: GeoSpecAssertionClient): GeoSpecVitestAdapter => {
  const adapter = createGeoSpecVitestAdapter(client);
  expect.extend(adapter.matchers);
  afterEach(async () => adapter.flush());
  return adapter;
};

/**
 * Create a native client and register it with the active Vitest file.
 *
 * @param options - Flat native assertion-client options.
 * @returns The installed adapter for reporters or explicit flushing.
 * @public
 */
export const setupGeoSpecVitest = (options: GeoSpecAssertionClientOptions): GeoSpecVitestAdapter =>
  installGeoSpecVitest(createGeoSpecAssertionClient(options));
