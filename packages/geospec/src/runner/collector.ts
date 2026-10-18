/**
 * The GeoSpec collector (split-doc D-S2).
 *
 * The substrate owns the suite/test tree, the `expectGeo` proxy,
 * `GeoSpecAssertionError` and the `__GEOSPEC_COLLECTOR__` global. Every
 * matcher call is lowered by the native assertion client and evaluated
 * synchronously by the compiled engine the host supplies; the collector records
 * the canonical report and its diagnostics on the active test.
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
import { assertGeoSpecAuthoredWorkUnitLimit } from '#engine/client.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { diagnosticForTransport, geometryDiagnosticSchema } from '#model/errors.js';
import { matchesGeoSpecTestName } from '#runner/filter.js';
import { geoSpecTimeoutCode } from '#runner/timeout-codes.js';
import type { GeoSpecTestNamePattern } from '#runner/filter.js';
import type {
  GeoSpecAssertion,
  GeoSpecExpectOptions,
  GeoSpecMatcher,
  GeoSpecTestCase,
  GeoSpecTestEvent,
} from '#runner/types.js';
import { regionScopeRefusal } from '#model/region-scope.js';
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
  expectGeo(subject: unknown, options?: GeoSpecExpectOptions): GeoSpecMatcher;
  waitForCompletion(testTimeout?: number, testNamePattern?: GeoSpecTestNamePattern): Promise<void>;
};

/** Per-module collector configuration; native subject/engine lifetime stays with the host. @public */
export type GeoSpecCollectorOptions = {
  matcherWallBackstop?: number;
  forensic?: boolean;
  nativeAssertions: GeoSpecAssertionClientOptions;
  /** Observes each selected test as it starts and settles, for host progress reporting. */
  onTestEvent?: (event: GeoSpecTestEvent) => void;
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

class GeoSpecTestTimeoutError extends Error {
  /** Milliseconds. */
  public readonly testTimeout: number;

  public constructor(testTimeout: number) {
    super(`GeoSpec test timed out after ${testTimeout}ms.`);
    this.name = 'GeoSpecTestTimeoutError';
    this.testTimeout = testTimeout;
  }
}

/**
 * Whether a thrown value is an engine or host `limit-exceeded` refusal. Thrown by a test or `describe` body, it is a
 * load refused admission: like a claim refused for capacity, it leaves the test's claims undecided, never false.
 *
 * @param error - A thrown value.
 * @returns Whether it carries the `limit-exceeded` code.
 */
const isAdmissionRefusal = (error: unknown): error is Readonly<Record<string, unknown>> =>
  typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'limit-exceeded';

/**
 * A `limit-exceeded` thrown inside a claim, after its load was admitted: the engine or host ran out of room for the
 * claim itself (engine handles or memory, or room to restore an evicted load), so it names no limit of the model. The
 * claim fails as an engine failure, the way any other exception inside a claim does, not as a claim a limit left
 * undecided.
 *
 * @param error - The refusal.
 * @returns The claim's diagnostic, without the refusal code that would read as a limit.
 */
const claimRefusalDiagnostic = (error: Readonly<Record<string, unknown>>): GeometryDiagnostic => {
  const { message, name } = error;
  const text = typeof message === 'string' ? message : 'GeoSpec ran out of room for this claim.';
  return {
    code: 'TEST_FAILED',
    severity: 'error',
    message: text,
    details: { name: typeof name === 'string' ? name : 'Error', message: text },
  };
};

/**
 * The refused admission as a capacity-refused claim reports it: the capacity code, with the numbers as details.
 *
 * @param error - The refusal: an engine `ProtocolError` or the native model loader's own `RangeError`.
 * @returns The diagnostic the test carries.
 */
const admissionRefusalDiagnostic = (error: Readonly<Record<string, unknown>>): GeometryDiagnostic => {
  const { capacity, message } = error;
  const { code, ...details }: Record<string, unknown> =
    typeof capacity === 'object' && capacity !== null ? { ...capacity } : {};
  return diagnosticForTransport({
    code: typeof code === 'string' ? code : 'GEOSPEC_RESOURCE_LIMIT',
    severity: 'error',
    message: typeof message === 'string' ? message : 'GeoSpec refused to admit this load.',
    ...(Object.keys(details).length === 0 ? {} : { details }),
  });
};

const createErrorDiagnostics = (error: unknown): GeometryDiagnostic[] => {
  if (error instanceof GeoSpecAssertionError) {
    return [...error.diagnostics];
  }

  if (isAdmissionRefusal(error)) {
    return [admissionRefusalDiagnostic(error)];
  }

  if (error instanceof GeoSpecTestTimeoutError) {
    return [
      {
        code: geoSpecTimeoutCode.test,
        severity: 'error',
        message: `${error.message} The test still ran to completion before the run moved on; this is a wall-clock timeout, not a geometry verdict.`,
        suggestion:
          'Keep the assertion and the model as designed. Raise testTimeout (CLI --test-timeout) so the requirement can finish; if this host cannot give it the time, report it as not decided at this capacity.',
        details: { testTimeout: error.testTimeout },
      },
    ];
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

const diagnosticFromWire = (value: unknown): GeometryDiagnostic => {
  return geometryDiagnosticSchema.parse(value);
};

const recordAssertion = (assertion: GeoSpecAssertion, diagnostics: GeometryDiagnostic[]): GeoSpecAssertion => {
  assertion.passed = diagnostics.length === 0;
  assertion.diagnostics = diagnostics;
  if (diagnostics.length > 0) {
    throw new GeoSpecAssertionError(diagnostics);
  }
  return assertion;
};

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
          reject(new GeoSpecTestTimeoutError(testTimeout));
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
 * Create the collector used by the embedded GeoSpec runner.
 *
 * @param options - The native assertion client configuration for this module.
 * @returns A fresh collector whose matchers evaluate through the native engine.
 * @public
 */
export function createCollector(options: GeoSpecCollectorOptions): GeoSpecCollector {
  const nativeClient = createGeoSpecAssertionClient(options.nativeAssertions);
  const suite: string[] = [];
  const tests: GeoSpecTestCase[] = [];
  const definitionPending: Array<Promise<unknown>> = [];
  const scheduled: Array<{ test: GeoSpecTestCase; function_: GeoSpecTestFunction }> = [];
  const nativeClaimFailures = new WeakSet<GeoSpecAssertionError>();
  let activeTest: GeoSpecTestCase | undefined;
  let executed = false;
  const notifyTestEvent = (type: GeoSpecTestEvent['type'], test: GeoSpecTestCase): void => {
    try {
      options.onTestEvent?.({ type, test });
    } catch {
      // Progress observers report; they never decide a verdict.
    }
  };

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

  const recordInvocation = (
    invocation: GeoSpecAuthoringInvocation,
    expectOptions: GeoSpecExpectOptions | undefined,
  ): GeoSpecAssertion => {
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
      const admission = resolveGeoSpecSubject(invocation.subject, options.nativeAssertions.engine);
      assertion.subject = admission.identity;
      if (admission.load !== undefined) {
        assertion.loadId = admission.load.loadId;
      }
      const region = admission.load?.region;
      if (region !== undefined) {
        assertion.region = { min: [...region.min], max: [...region.max] };
      }
      const regionRefusal = regionScopeRefusal(region, invocation.kind);
      if (regionRefusal !== undefined) {
        return recordAssertion(assertion, [regionRefusal]);
      }
      const workUnitLimit = expectOptions?.workUnitLimit ?? admission.load?.workUnitLimit;
      const methods = nativeClient.expectGeo(
        admission.identity,
        workUnitLimit === undefined ? undefined : { workUnitLimit },
      );
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
      if (isAdmissionRefusal(error)) {
        // The claim's load was already admitted, so this refusal is no limit of the model.
        return recordAssertion(assertion, [claimRefusalDiagnostic(error)]);
      }
      assertion.passed = false;
      assertion.diagnostics ??= createErrorDiagnostics(error);
      throw error;
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
                status: isAdmissionRefusal(error) ? 'inconclusive' : 'failed',
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
          status: isAdmissionRefusal(error) ? 'inconclusive' : 'failed',
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

    expectGeo(subject, expectOptions) {
      // Validate once at the chain, before any claim, so a bad budget names expectGeo.
      assertGeoSpecAuthoredWorkUnitLimit(
        expectOptions?.workUnitLimit,
        'expectGeo workUnitLimit',
        options.nativeAssertions.maximumWorkUnitLimit,
      );
      const invoke = (invocation: GeoSpecAuthoringInvocation): GeoSpecAssertion =>
        recordInvocation(invocation, expectOptions);
      return Object.assign(createGeoSpecMatcherMethods({ invoke, polarity: 'positive', subject }), {
        not: createGeoSpecMatcherMethods({ invoke, polarity: 'negative', subject }),
      });
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
        await definitionSettlement;
        throw error;
      }
      for (const scheduledTest of scheduled) {
        if (!matchesGeoSpecTestName(scheduledTest.test, testNamePattern)) {
          continue;
        }

        const previousTest = activeTest;
        activeTest = scheduledTest.test;
        scheduledTest.test.status = 'passed';
        notifyTestEvent('test-start', scheduledTest.test);
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
          if (callbackPending !== undefined) {
            // A reporting timeout does not transfer ownership of native work.
            // Keep the active test installed while its real callback settles so
            // late assertions remain attached to this test before host cleanup.
            // oxlint-disable-next-line no-await-in-loop -- Native ownership must drain before the serial runner advances.
            recordRejectedSettlements(await Promise.allSettled([callbackPending]), recordFailure);
          }
          if (failures.length > 0 || scheduledTest.test.assertions.some((assertion) => assertion.passed === false)) {
            scheduledTest.test.status = 'failed';
            for (const failure of failures) {
              scheduledTest.test.diagnostics.push(...createErrorDiagnostics(failure));
            }
            const { assertions } = scheduledTest.test;
            const infrastructureFailure =
              failures.some(
                (failure) =>
                  !isAdmissionRefusal(failure) &&
                  (!(failure instanceof GeoSpecAssertionError) || !nativeClaimFailures.has(failure)),
              ) ||
              assertions.some(
                (assertion) =>
                  assertion.passed === false &&
                  (assertion.report === undefined ||
                    assertion.report.status === 'invalid' ||
                    assertion.report.status === 'engine-error'),
              );
            if (!infrastructureFailure) {
              const statuses = assertions.map((assertion) => assertion.report?.status);
              scheduledTest.test.status = statuses.includes('failed')
                ? 'failed'
                : failures.some((failure) => isAdmissionRefusal(failure)) ||
                    statuses.some((status) => status !== undefined && status !== 'passed' && status !== 'unsupported')
                  ? 'inconclusive'
                  : statuses.includes('unsupported')
                    ? 'unsupported'
                    : 'failed';
            }
          }
        } finally {
          activeTest = previousTest;
          scheduledTest.test.durationMs = performance.now() - startedAt;
          notifyTestEvent('test-complete', scheduledTest.test);
        }
      }
    },

    tests,
  };
  return collector;
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
export const installCollector = (collector: GeoSpecCollector): void => {
  geospecGlobal[collectorGlobalKey] = collector;
};
