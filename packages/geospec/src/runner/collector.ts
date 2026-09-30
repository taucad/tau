/**
 * The GeoSpec collector shell (split-doc D-S2).
 *
 * The substrate owns the suite/test tree, the `expectGeo` proxy, the frozen
 * matcher-name list, `GeoSpecAssertionError` and the `__GEOSPEC_COLLECTOR__`
 * global. Matcher BODIES live in the engine: the proxy builds one invocation
 * per call from the machine-readable matcher registry and hands it across the
 * seam. With no engine registered every matcher answers with the
 * `GEOSPEC_ENGINE_UNAVAILABLE` diagnostic — an assertion failure, never a
 * crash.
 *
 * @module
 */

import {
  createGeoSpecMatcherMethods,
  createGeoSpecAssertionClient,
  GeoSpecAssertionError as NativeAssertionError,
} from '#assertion-client/index.js';
import type {
  GeoSpecAuthoringInvocation,
  GeoSpecAssertionClientOptions,
  GeoSpecCanonicalClaimReport,
} from '#assertion-client/index.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';
import type { GeoSpecMatcherName } from '#engine/matchers.js';
import {
  encodeGeoSpecCanonicalJson,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherRegistryVersion,
  toGeoSpecProtocolJson,
} from '#engine/protocol.js';
import type { GeoSpecClaimResult, GeoSpecExecutionOptions } from '#engine/protocol.js';
import type { JSONValue } from '@taucad/runtime/types';
import { geoSpecEngineUnavailableDiagnostic, getGeoSpecEngineProtocol } from '#engine/registry.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { diagnosticForTransport, geometryDiagnosticSchema } from '#model/errors.js';
import { matchesGeoSpecTestName } from '#runner/filter.js';
import type { GeoSpecTestNamePattern } from '#runner/filter.js';
import {
  defaultMatcherWallBackstop,
  MatcherBudgetExceeded,
  MatcherWallBackstopExceeded,
  resolveMatcherWorkUnitBudget,
  withMatcherBudget,
} from '#runner/matcher-budget.js';
import type { GeoSpecAssertion, GeoSpecMatcher, GeoSpecTestCase } from '#runner/types.js';
import { resolveGeoSpecSubject } from '#model/subject.js';

type GeoSpecTestFunction = () => unknown | PromiseLike<unknown>;

/**
 * Collects suites, tests, assertions, and async completion state for one
 * GeoSpec module execution.
 *
 * @public
 */
export type GeoSpecCollector = {
  tests: GeoSpecTestCase[];
  describe(name: string, function_: GeoSpecTestFunction): void;
  describeSkip(name: string, _function?: GeoSpecTestFunction): void;
  it(name: string, function_: GeoSpecTestFunction): void;
  itSkip(name: string, _function?: GeoSpecTestFunction): void;
  expectGeo(subject: unknown): GeoSpecMatcher;
  waitForCompletion(testTimeout?: number, testNamePattern?: GeoSpecTestNamePattern): Promise<void>;
};

/** Native collector surface for hosts that explicitly supply a native engine. @public */
export type GeoSpecNativeCollector = Omit<GeoSpecCollector, 'expectGeo'> & {
  expectGeo(subject: unknown): GeoSpecMatcher;
};

/** Per-module collector configuration; native subject/engine lifetime stays with the host. @public */
export type GeoSpecCollectorOptions = {
  matcherWallBackstop?: number;
  forensic?: boolean;
  nativeAssertions?: GeoSpecAssertionClientOptions;
};

export const collectorGlobalKey = '__GEOSPEC_COLLECTOR__';
const geospecGlobal = globalThis as typeof globalThis & Record<string, unknown>;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { then?: unknown }).then === 'function';

/**
 * Assertion error thrown by GeoSpec matchers when an expectation does not hold.
 *
 * Runner, CLI, and tool adapters unwrap this error to preserve structured
 * diagnostics instead of collapsing them into a single string.
 *
 * @public
 */
export class GeoSpecAssertionError extends Error {
  public readonly diagnostics: readonly GeometryDiagnostic[];

  public constructor(diagnostics: readonly GeometryDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n') || 'GeoSpec assertion failed.');
    this.name = 'GeoSpecAssertionError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

const createErrorDiagnostics = (error: unknown): GeometryDiagnostic[] => {
  if (error instanceof GeoSpecAssertionError) {
    return [...error.diagnostics];
  }

  // VM modules and worker transports do not share Error constructors. Validate
  // the named error's data instead of relying on instanceof across realms.
  if (typeof error === 'object' && error !== null && Reflect.get(error, 'name') === 'GeoSpecModelLoadError') {
    const diagnostics: unknown = Reflect.get(error, 'diagnostics');
    if (Array.isArray(diagnostics) && diagnostics.length > 0) {
      try {
        return diagnostics.map((diagnostic) => diagnosticForTransport(diagnosticFromWire(diagnostic)));
      } catch {
        // Malformed diagnostic arrays remain a failed test, never an empty pass.
      }
    }
  }

  const message =
    typeof error === 'object' && error !== null && typeof Reflect.get(error, 'message') === 'string'
      ? String(Reflect.get(error, 'message'))
      : String(error);
  const { details } = diagnosticForTransport({ code: 'TEST_FAILED', severity: 'error', message, details: error });
  if (message.includes('model.volume is not a function')) {
    return [
      {
        code: 'GEOSPEC_SUBJECT_API_MISUSE',
        severity: 'error',
        message: 'GeoSpec GeometrySubject does not expose model.volume().',
        suggestion: 'Use expectGeo(model).toHaveVolume({ value, tolerance }) instead of reading model.volume().',
        details,
      },
    ];
  }
  if (/Cannot read properties of undefined \(reading 'bounds'\)/u.test(message)) {
    return [
      {
        code: 'GEOSPEC_SUBJECT_API_MISUSE',
        severity: 'error',
        message: 'GeoSpec GeometrySubject does not expose model.boundingBox.bounds.',
        suggestion:
          'Use expectGeo(model).toHaveBoundingBox({ min, max, size, center, tolerance }) instead of reading model.boundingBox.',
        details,
      },
    ];
  }
  return [
    {
      code: 'TEST_FAILED',
      severity: 'error',
      message,
      details,
    },
  ];
};

const isSettledDiagnostics = (
  result: readonly GeometryDiagnostic[] | Promise<readonly GeometryDiagnostic[]>,
): result is readonly GeometryDiagnostic[] => !isPromiseLike(result);

let nextClaim = 0;

const diagnosticFromWire = (value: unknown): GeometryDiagnostic => {
  return geometryDiagnosticSchema.parse(value);
};

const diagnosticsFromClaimResult = (result: GeoSpecClaimResult): readonly GeometryDiagnostic[] => {
  const diagnostics = result.diagnostics.map((diagnostic) => diagnosticFromWire(diagnostic));
  if (result.status === 'passed' || diagnostics.length > 0) {
    return diagnostics;
  }
  return [
    {
      code: result.status === 'cancelled' ? 'GEOSPEC_CLAIM_CANCELLED' : 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
      severity: 'error',
      message:
        result.status === 'cancelled'
          ? `GeoSpec claim '${result.claimId}' was cancelled.`
          : `GeoSpec engine returned '${result.status}' without a diagnostic.`,
      suggestion: 'Re-run the claim; if it repeats, inspect the registered engine transport.',
      details: { claimId: result.claimId, status: result.status },
    },
  ];
};

const invokeMatcher = (
  invocation: GeoSpecAuthoringInvocation,
  execution: GeoSpecExecutionOptions,
): readonly GeometryDiagnostic[] | Promise<readonly GeometryDiagnostic[]> => {
  const protocol = getGeoSpecEngineProtocol();
  if (!protocol) {
    return [geoSpecEngineUnavailableDiagnostic(invocation.matcher)];
  }
  const subjectId: unknown =
    typeof invocation.subject === 'object' && invocation.subject !== null
      ? Reflect.get(invocation.subject, 'subjectId')
      : undefined;
  if (typeof subjectId !== 'string') {
    return [
      {
        code: 'GEOSPEC_SUBJECT_UNSUPPORTED',
        severity: 'error',
        message: `expectGeo(...).${invocation.matcher}() requires an ingested GeoSpec subject reference.`,
        suggestion: 'Await loadModel()/loadStep()/loadMesh() and pass the returned subject to expectGeo().',
        details: { matcher: invocation.matcher },
      },
    ];
  }
  nextClaim += 1;
  const claimId = `claim-${nextClaim}`;
  try {
    const claim: JSONValue = {
      claimId,
      capability: invocation.matcher,
      subjectIds: [subjectId],
      payload: {
        kind: invocation.kind,
        arguments: invocation.arguments.map((argument) => toGeoSpecProtocolJson(argument)),
        expected: toGeoSpecProtocolJson(invocation.expected),
      },
      workUnitBudget: resolveMatcherWorkUnitBudget(invocation.kind),
    };
    const submitted = protocol.submitClaims({
      requestId: claimId,
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [encodeGeoSpecCanonicalJson(claim)],
    });
    const settle = (batch: Awaited<typeof submitted>): readonly GeometryDiagnostic[] => {
      const result = batch.results[0];
      return result === undefined
        ? [
            {
              code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
              severity: 'error',
              message: `GeoSpec engine returned no result for '${claimId}'.`,
              suggestion: 'Fix the registered engine protocol implementation.',
              details: { claimId },
            },
          ]
        : diagnosticsFromClaimResult(result);
    };
    if (!isPromiseLike(submitted)) {
      return settle(submitted);
    }
    return (async () => settle(await submitted))();
  } catch (error) {
    if (error instanceof MatcherBudgetExceeded || error instanceof MatcherWallBackstopExceeded) {
      throw error;
    }
    return [
      {
        code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'Use only serializable matcher arguments and retained GeoSpec subject references.',
        details: { matcher: invocation.matcher },
      },
    ];
  }
};

/**
 * Start either matcher mode under the same deterministic budget. Async
 * matchers may return a promise, but every current budget charge happens
 * synchronously while the engine starts the claim.
 */
const invokeMatcherWithBudget = (
  invocation: GeoSpecAuthoringInvocation,
  execution: GeoSpecExecutionOptions,
): readonly GeometryDiagnostic[] | Promise<readonly GeometryDiagnostic[]> => {
  let pending: Promise<readonly GeometryDiagnostic[]> | undefined;
  const immediate = withMatcherBudget({
    matcher: invocation.kind,
    wallBackstop: execution.matcherWallBackstop,
    evaluate: () => {
      const result = invokeMatcher(invocation, execution);
      if (isSettledDiagnostics(result)) {
        return [...result];
      }
      pending = Promise.resolve(result);
      return [];
    },
  });
  return pending ?? immediate;
};

/**
 * Diagnostic for an engine that returns a promise from a matcher the registry
 * declares synchronous. The registry — not the engine — decides whether an
 * assertion settles inside the `it()` body, so a mismatch is a contract
 * violation and must fail loudly rather than silently pass.
 */
const asyncFromSyncMatcherDiagnostic = (matcher: GeoSpecMatcherName): GeometryDiagnostic => ({
  code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
  severity: 'error',
  message: `The registered GeoSpec engine returned a promise from '${matcher}', which the matcher registry declares synchronous.`,
  suggestion: 'Fix the engine to settle this matcher synchronously, or declare it async in the matcher registry.',
  details: { matcher, protocolVersion: geoSpecEngineProtocolVersion },
});

const recordAssertion = (assertion: GeoSpecAssertion, diagnostics: GeometryDiagnostic[]): GeoSpecAssertion => {
  assertion.passed = diagnostics.length === 0;
  assertion.diagnostics = diagnostics;
  if (diagnostics.length > 0) {
    throw new GeoSpecAssertionError(diagnostics);
  }
  return assertion;
};

class GeoSpecTestTimeoutError extends Error {}

const withTimeout = async <Result>(promise: Promise<Result>, testTimeout?: number): Promise<Result> => {
  if (testTimeout === undefined) {
    return promise;
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new GeoSpecTestTimeoutError(`GeoSpec test timed out after ${testTimeout}ms.`));
        }, testTimeout);
      }),
    ]);
  } finally {
    /* v8 ignore next -- The Promise executor runs synchronously, so the handle is always assigned. */
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const recordRejectedSettlements = (
  settled: ReadonlyArray<PromiseSettledResult<unknown>>,
  recordFailure: (error: unknown) => void,
): void => {
  for (const result of settled) {
    if (result.status === 'rejected') {
      recordFailure(result.reason);
    }
  }
};

const settlePendingAssertions = async (
  settlement: Promise<Array<PromiseSettledResult<unknown>>>,
  options: {
    callbackTimedOut: boolean;
    native: boolean;
    recordFailure: (error: unknown) => void;
    testTimeout?: number;
  },
): Promise<Array<PromiseSettledResult<unknown>> | undefined> => {
  if (options.native && options.callbackTimedOut) {
    return settlement;
  }
  try {
    return await withTimeout(settlement, options.testTimeout);
  } catch (error) {
    options.recordFailure(error);
    return options.native ? settlement : undefined;
  }
};

export const getCollector = (): GeoSpecCollector => {
  const collector = geospecGlobal[collectorGlobalKey];
  if (!isGeoSpecCollector(collector)) {
    throw new Error('GeoSpec collector is not active. Run the module through runGeoSpecModule().');
  }

  return collector;
};

const isGeoSpecCollector = (value: unknown): value is GeoSpecCollector =>
  typeof value === 'object' &&
  value !== null &&
  'describe' in value &&
  'it' in value &&
  'expectGeo' in value &&
  'tests' in value;

const isGeoSpecTestCase = (value: unknown): value is GeoSpecTestCase =>
  typeof value === 'object' && value !== null && 'suite' in value && 'name' in value && 'assertions' in value;

/**
 * Create a collector used by the embedded GeoSpec runner.
 *
 * @returns A fresh collector instance.
 */
/** @public */
export function createCollector(
  options: GeoSpecCollectorOptions & { nativeAssertions: GeoSpecAssertionClientOptions },
): GeoSpecNativeCollector;
export function createCollector(options?: GeoSpecCollectorOptions & { nativeAssertions?: undefined }): GeoSpecCollector;
export function createCollector(options?: GeoSpecCollectorOptions): GeoSpecCollector | GeoSpecNativeCollector;
/**
 * Create the collector for the explicitly selected engine mode.
 * @param options - Legacy execution settings or a native assertion client configuration.
 * @returns A fresh collector whose matcher surface matches the selected mode.
 * @public
 */
export function createCollector(options?: GeoSpecCollectorOptions): GeoSpecCollector | GeoSpecNativeCollector {
  const nativeClient =
    options?.nativeAssertions === undefined ? undefined : createGeoSpecAssertionClient(options.nativeAssertions);
  const execution: GeoSpecExecutionOptions = {
    forensic: options?.forensic ?? false,
    matcherWallBackstop: options?.matcherWallBackstop ?? defaultMatcherWallBackstop,
  };
  const suite: string[] = [];
  const tests: GeoSpecTestCase[] = [];
  const definitionPending: Array<Promise<unknown>> = [];
  const scheduled: Array<{ test: GeoSpecTestCase; function_: GeoSpecTestFunction }> = [];
  const pendingAssertions = new WeakMap<GeoSpecTestCase, Array<Promise<unknown>>>();
  const nativeClaimFailures = new WeakSet<GeoSpecAssertionError>();
  let activeTest: GeoSpecTestCase | undefined;
  let executed = false;

  const trackDefinitionPending = (
    operation: PromiseLike<unknown>,
    handlers: {
      onError(error: unknown): void;
      onFinally(): void;
    },
  ): void => {
    definitionPending.push(
      (async () => {
        try {
          await operation;
        } catch (error) {
          handlers.onError(error);
        } finally {
          handlers.onFinally();
        }
      })(),
    );
  };

  const recordSkipped = (name: string): void => {
    tests.push({
      ordinal: tests.length,
      suite: [...suite],
      name,
      assertions: [],
      status: 'skipped',
      diagnostics: [],
    });
  };

  // oxlint-disable-next-line typescript/promise-function-async -- Return the exact tracked promise, so unawaited native calls have no unobserved wrapper rejection.
  const recordAsyncAssertion = (
    test: GeoSpecTestCase,
    assertion: GeoSpecAssertion,
    evaluate: () => Promise<GeometryDiagnostic[]>,
  ): Promise<GeoSpecAssertion> => {
    const pending = (async () => {
      // R1: asynchronous matchers get the same duration stamp as the sync choke point.
      const startedAt = performance.now();
      let diagnostics: GeometryDiagnostic[];
      try {
        diagnostics = await evaluate();
      } finally {
        assertion.durationMs = performance.now() - startedAt;
      }
      assertion.passed = diagnostics.length === 0;
      assertion.diagnostics = diagnostics;
      if (diagnostics.length > 0) {
        throw new GeoSpecAssertionError(diagnostics);
      }
      return assertion;
    })();
    // Observe immediately even when authors leave a native assertion unawaited.
    // The original rejection remains tracked and is surfaced at test completion.
    // oxlint-disable-next-line promise/prefer-await-to-then -- Attach a rejection observer synchronously; retain the original verdict-bearing promise below.
    const observed = pending.catch(() => undefined);
    const existing = pendingAssertions.get(test) ?? [];
    existing.push(pending, observed);
    pendingAssertions.set(test, existing);
    return pending;
  };

  const recordInvocation = (invocation: GeoSpecAuthoringInvocation): GeoSpecAssertion => {
    if (!isGeoSpecTestCase(activeTest)) {
      throw new Error('expectGeo() must be called inside it().');
    }

    const assertion: GeoSpecAssertion = {
      kind: invocation.kind,
      subject: invocation.subject,
      expected: invocation.expected,
    };
    activeTest.assertions.push(assertion);
    const descriptor = geoSpecMatcherDescriptors[invocation.matcher];

    if (invocation.matcher === 'toHaveNoComponentInterference' || invocation.matcher === 'toHaveSpatialRelationships') {
      void recordAsyncAssertion(activeTest, assertion, async () => [
        ...(await invokeMatcherWithBudget(invocation, execution)),
      ]);
      return assertion;
    }

    // R1/R13: the sync choke point stamps the duration and brackets the
    // evaluation with the deterministic work-unit budget. The budget is
    // verdict-bearing, so it stays in the legacy protocol-2 substrate.
    const startedAt = performance.now();
    try {
      return recordAssertion(
        assertion,
        withMatcherBudget({
          matcher: descriptor.kind,
          wallBackstop: execution.matcherWallBackstop,
          evaluate: () => {
            const result = invokeMatcher(invocation, execution);
            return isSettledDiagnostics(result) ? [...result] : [asyncFromSyncMatcherDiagnostic(invocation.matcher)];
          },
        }),
      );
    } finally {
      assertion.durationMs = performance.now() - startedAt;
    }
  };

  const collector: GeoSpecCollector = {
    describe(name, function_) {
      suite.push(name);
      try {
        const result = function_();
        if (isPromiseLike(result)) {
          const capturedSuite = [...suite];
          trackDefinitionPending(result, {
            onError(error) {
              tests.push({
                ordinal: tests.length,
                suite: capturedSuite,
                name,
                assertions: [],
                status: 'failed',
                diagnostics: createErrorDiagnostics(error),
              });
            },
            onFinally() {
              suite.pop();
            },
          });
          return;
        }
      } catch (error) {
        tests.push({
          ordinal: tests.length,
          suite: [...suite],
          name,
          assertions: [],
          status: 'failed',
          diagnostics: createErrorDiagnostics(error),
        });
      }
      suite.pop();
    },

    describeSkip(name) {
      recordSkipped(name);
    },

    it(name, function_) {
      const test: GeoSpecTestCase = {
        ordinal: tests.length,
        suite: [...suite],
        name,
        assertions: [],
        status: 'not-run',
        diagnostics: [],
      };
      tests.push(test);
      scheduled.push({ test, function_ });
    },

    itSkip(name) {
      recordSkipped(name);
    },

    expectGeo(subject) {
      const methods = (polarity: 'positive' | 'negative') =>
        createGeoSpecMatcherMethods({
          invoke: (invocation) => {
            if (
              invocation.matcher === 'toSatisfyRationalPlate' ||
              invocation.matcher === 'toSatisfyParallelPlaneDistance'
            ) {
              throw new TypeError('This reference engine cannot evaluate the fixed compiled contract.');
            }
            return recordInvocation(invocation);
          },
          polarity,
          subject,
        });
      return Object.assign(methods('positive'), { not: methods('negative') });
    },

    async waitForCompletion(testTimeout, testNamePattern) {
      if (executed) {
        return;
      }
      executed = true;
      const definitionSettlement = Promise.allSettled(definitionPending);
      try {
        await withTimeout(definitionSettlement, testTimeout);
      } catch (error) {
        if (nativeClient !== undefined) {
          await definitionSettlement;
        }
        throw error;
      }
      for (const scheduledTest of scheduled) {
        if (!matchesGeoSpecTestName(scheduledTest.test, testNamePattern)) {
          continue;
        }

        const previousTest = activeTest;
        activeTest = scheduledTest.test;
        scheduledTest.test.status = 'passed';
        const startedAt = performance.now();
        const failures: unknown[] = [];
        const recordFailure = (error: unknown): void => {
          if (!failures.some((failure) => Object.is(failure, error))) {
            failures.push(error);
          }
        };
        try {
          let callbackPending: Promise<unknown> | undefined;
          try {
            callbackPending = Promise.resolve(scheduledTest.function_());
            // oxlint-disable-next-line no-await-in-loop -- GeoSpec CAD tests run serially so model-loader state and native resources cannot cross-wire.
            await withTimeout(callbackPending, testTimeout);
          } catch (error) {
            recordFailure(error);
          }
          if (nativeClient !== undefined && callbackPending !== undefined) {
            // A reporting timeout does not transfer ownership of native work.
            // Keep the active test installed while its real callback settles so
            // late assertions remain attached to this test before host cleanup.
            // oxlint-disable-next-line no-await-in-loop -- Native ownership must drain before the serial runner advances.
            recordRejectedSettlements(await Promise.allSettled([callbackPending]), recordFailure);
          }
          const callbackTimedOut = failures.some((failure) => failure instanceof GeoSpecTestTimeoutError);
          if (nativeClient !== undefined || !callbackTimedOut) {
            const assertionSettlement = Promise.allSettled(pendingAssertions.get(scheduledTest.test) ?? []);
            // A callback timeout already establishes the verdict. Native mode
            // still drains real assertion settlement without another timer.
            // oxlint-disable-next-line no-await-in-loop -- Assertions must settle before the serial runner advances.
            const settled = await settlePendingAssertions(assertionSettlement, {
              callbackTimedOut,
              native: nativeClient !== undefined,
              recordFailure,
              ...(testTimeout === undefined ? {} : { testTimeout }),
            });
            if (settled !== undefined) {
              recordRejectedSettlements(settled, recordFailure);
            }
          }
          if (failures.length > 0 || scheduledTest.test.assertions.some((assertion) => assertion.passed === false)) {
            scheduledTest.test.status = 'failed';
            for (const failure of failures) {
              scheduledTest.test.diagnostics.push(...createErrorDiagnostics(failure));
            }
            const { assertions } = scheduledTest.test;
            const infrastructureFailure =
              failures.some(
                (failure) => !(failure instanceof GeoSpecAssertionError) || !nativeClaimFailures.has(failure),
              ) ||
              assertions.some(
                (assertion) =>
                  assertion.passed === false &&
                  (assertion.report === undefined ||
                    assertion.report.status === 'invalid' ||
                    assertion.report.status === 'engine-error'),
              );
            if (nativeClient !== undefined && !infrastructureFailure) {
              const statuses = assertions.map((assertion) => assertion.report?.status);
              scheduledTest.test.status = statuses.includes('failed')
                ? 'failed'
                : statuses.some((status) => status !== undefined && status !== 'passed' && status !== 'unsupported')
                  ? 'inconclusive'
                  : statuses.includes('unsupported')
                    ? 'unsupported'
                    : 'failed';
            }
          }
        } finally {
          activeTest = previousTest;
          scheduledTest.test.durationMs = performance.now() - startedAt;
        }
      }
    },

    tests,
  };
  if (nativeClient === undefined) {
    return collector;
  }
  const recordNativeInvocation = (invocation: GeoSpecAuthoringInvocation): GeoSpecAssertion => {
    if (!isGeoSpecTestCase(activeTest)) {
      throw new Error('expectGeo() must be called inside it().');
    }
    const assertion: GeoSpecAssertion = {
      kind: invocation.kind,
      subject: null,
      expected: invocation.expected,
    };
    activeTest.assertions.push(assertion);
    const startedAt = performance.now();
    try {
      const admission = resolveGeoSpecSubject(invocation.subject, options?.nativeAssertions?.engine);
      assertion.subject = admission.identity;
      if (admission.load !== undefined) {
        assertion.loadId = admission.load.loadId;
      }
      const methods = nativeClient.expectGeo(admission.identity);
      const chain = invocation.polarity === 'negative' ? methods.not : methods;
      // The shared authoring registry already supplies each method's argument tuple.
      const method = chain[invocation.matcher] as (...arguments_: readonly unknown[]) => GeoSpecCanonicalClaimReport;
      let report: GeoSpecCanonicalClaimReport;
      try {
        report = method(...invocation.arguments);
      } catch (error) {
        if (!(error instanceof NativeAssertionError)) {
          throw error;
        }
        report = error.report;
      }
      assertion.report = report;
      if (report.status === 'passed') {
        return recordAssertion(assertion, []);
      }
      const diagnostics = report.diagnostics.map((diagnostic) =>
        diagnosticForTransport(diagnosticFromWire(diagnostic)),
      );
      return recordAssertion(
        assertion,
        diagnostics.length > 0
          ? diagnostics
          : [
              {
                code: 'GEOSPEC_NATIVE_ASSERTION_FAILED',
                severity: 'error',
                message: `Native claim '${report.claimId}' ended with status '${report.status}'.`,
                details: { claimId: report.claimId, status: report.status },
              },
            ],
      );
    } catch (error) {
      if (error instanceof GeoSpecAssertionError && assertion.report !== undefined) {
        nativeClaimFailures.add(error);
      }
      assertion.passed = false;
      assertion.diagnostics ??= createErrorDiagnostics(error);
      throw error;
    } finally {
      assertion.durationMs = performance.now() - startedAt;
    }
  };
  const nativeCollector: GeoSpecNativeCollector = {
    ...collector,
    expectGeo(subject: unknown) {
      return Object.assign(
        createGeoSpecMatcherMethods({ invoke: recordNativeInvocation, polarity: 'positive', subject }),
        { not: createGeoSpecMatcherMethods({ invoke: recordNativeInvocation, polarity: 'negative', subject }) },
      );
    },
  };
  return nativeCollector;
}

/**
 * Clear runner globals after a module finishes.
 */
/** @public */
export const clearCollectorGlobals = (): void => {
  Reflect.deleteProperty(geospecGlobal, collectorGlobalKey);
};

/**
 * Install a collector into the current JavaScript global scope.
 *
 * @param collector - Collector for the active run.
 */
/** @public */
export const installCollector = (collector: GeoSpecCollector | GeoSpecNativeCollector): void => {
  geospecGlobal[collectorGlobalKey] = collector;
};
