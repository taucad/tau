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

import { geoSpecMatcherDescriptors, normalizeGeoSpecExpected } from '#engine/matchers.js';
import type { GeoSpecMatcherDescriptor, GeoSpecMatcherName } from '#engine/matchers.js';
import {
  encodeGeoSpecCanonicalJson,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherRegistryVersion,
  toGeoSpecProtocolJson,
} from '#engine/protocol.js';
import type { GeoSpecClaimResult, GeoSpecExecutionOptions } from '#engine/protocol.js';
import type { JSONValue } from '@taucad/types';
import { geoSpecEngineUnavailableDiagnostic, getGeoSpecEngineProtocol } from '#engine/registry.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
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

type GeoSpecTestFunction = () => unknown | PromiseLike<unknown>;
type GeoSpecAuthoringInvocation = {
  protocolVersion: number;
  matcher: GeoSpecMatcherName;
  kind: GeoSpecAssertion['kind'];
  subject: unknown;
  arguments: readonly unknown[];
  expected: unknown;
};

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

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('model.volume is not a function')) {
    return [
      {
        code: 'GEOSPEC_SUBJECT_API_MISUSE',
        severity: 'error',
        message: 'GeoSpec GeometrySubject does not expose model.volume().',
        suggestion: 'Use expectGeo(model).toHaveVolume({ value, tolerance }) instead of reading model.volume().',
        details: error,
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
        details: error,
      },
    ];
  }
  return [
    {
      code: 'TEST_FAILED',
      severity: 'error',
      message,
      details: error,
    },
  ];
};

const isSettledDiagnostics = (
  result: readonly GeometryDiagnostic[] | Promise<readonly GeometryDiagnostic[]>,
): result is readonly GeometryDiagnostic[] => !isPromiseLike(result);

let nextClaim = 0;

const diagnosticFromWire = (value: unknown): GeometryDiagnostic => {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('GeoSpec engine returned a non-object diagnostic.');
  }
  const diagnostic = value as Record<string, unknown>;
  if (
    typeof diagnostic['code'] !== 'string' ||
    !['error', 'warning', 'info'].includes(String(diagnostic['severity'])) ||
    typeof diagnostic['message'] !== 'string'
  ) {
    throw new TypeError('GeoSpec engine returned an invalid diagnostic shape.');
  }
  return diagnostic as GeometryDiagnostic;
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

const withTimeout = async (promise: Promise<unknown>, testTimeout?: number): Promise<void> => {
  if (testTimeout === undefined) {
    await promise;
    return;
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`GeoSpec test timed out after ${testTimeout}ms.`));
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
export const createCollector = (options?: { matcherWallBackstop?: number; forensic?: boolean }): GeoSpecCollector => {
  const execution: GeoSpecExecutionOptions = {
    forensic: options?.forensic ?? false,
    matcherWallBackstop: options?.matcherWallBackstop ?? defaultMatcherWallBackstop,
  };
  const suite: string[] = [];
  const tests: GeoSpecTestCase[] = [];
  const definitionPending: Array<Promise<unknown>> = [];
  const scheduled: Array<{ test: GeoSpecTestCase; function_: GeoSpecTestFunction }> = [];
  const pendingAssertions = new WeakMap<GeoSpecTestCase, Array<Promise<void>>>();
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
      suite: [...suite],
      name,
      assertions: [],
      status: 'skipped',
      diagnostics: [],
    });
  };

  const recordAsyncAssertion = (
    test: GeoSpecTestCase,
    assertion: GeoSpecAssertion,
    evaluate: () => Promise<GeometryDiagnostic[]>,
  ): GeoSpecAssertion => {
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
    })();
    const existing = pendingAssertions.get(test) ?? [];
    existing.push(pending);
    pendingAssertions.set(test, existing);
    return assertion;
  };

  /**
   * One matcher method. Defined outside the per-name loop so each closure
   * captures its own descriptor rather than a shared loop variable.
   */
  const createMatcherMethod =
    (subject: unknown, name: GeoSpecMatcherName, descriptor: GeoSpecMatcherDescriptor) =>
    (...callArguments: readonly unknown[]): GeoSpecAssertion => {
      if (!isGeoSpecTestCase(activeTest)) {
        throw new Error('expectGeo() must be called inside it().');
      }

      const assertion: GeoSpecAssertion = {
        kind: descriptor.kind,
        subject,
        expected: normalizeGeoSpecExpected(descriptor.expected, callArguments),
      };
      activeTest.assertions.push(assertion);

      const invocation: GeoSpecAuthoringInvocation = {
        protocolVersion: geoSpecEngineProtocolVersion,
        matcher: name,
        kind: descriptor.kind,
        subject,
        arguments: callArguments,
        expected: assertion.expected,
      };

      if (descriptor.mode === 'async') {
        return recordAsyncAssertion(activeTest, assertion, async () => [
          ...(await invokeMatcherWithBudget(invocation, execution)),
        ]);
      }

      // R1/R13: the sync choke point stamps the duration and brackets the
      // evaluation with the deterministic work-unit budget. The budget is
      // verdict-bearing, so it stays in the substrate and applies
      // identically to every engine.
      const startedAt = performance.now();
      try {
        return recordAssertion(
          assertion,
          withMatcherBudget({
            matcher: descriptor.kind,
            wallBackstop: execution.matcherWallBackstop,
            evaluate: () => {
              const result = invokeMatcher(invocation, execution);
              return isSettledDiagnostics(result) ? [...result] : [asyncFromSyncMatcherDiagnostic(name)];
            },
          }),
        );
      } finally {
        assertion.durationMs = performance.now() - startedAt;
      }
    };

  return {
    describe(name, function_) {
      suite.push(name);
      try {
        const result = function_();
        if (isPromiseLike(result)) {
          const capturedSuite = [...suite];
          trackDefinitionPending(result, {
            onError(error) {
              tests.push({
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
        suite: [...suite],
        name,
        assertions: [],
        status: 'passed',
        diagnostics: [],
      };
      tests.push(test);
      scheduled.push({ test, function_ });
    },

    itSkip(name) {
      recordSkipped(name);
    },

    expectGeo(subject) {
      const matcher: Partial<Record<GeoSpecMatcherName, unknown>> = {};
      for (const name of Object.keys(geoSpecMatcherDescriptors) as GeoSpecMatcherName[]) {
        matcher[name] = createMatcherMethod(subject, name, geoSpecMatcherDescriptors[name]);
      }
      return matcher as GeoSpecMatcher;
    },

    async waitForCompletion(testTimeout, testNamePattern) {
      if (executed) {
        return;
      }
      executed = true;
      await withTimeout(Promise.allSettled(definitionPending), testTimeout);
      for (const scheduledTest of scheduled) {
        if (!matchesGeoSpecTestName(scheduledTest.test, testNamePattern)) {
          continue;
        }

        const previousTest = activeTest;
        activeTest = scheduledTest.test;
        const startedAt = performance.now();
        try {
          // oxlint-disable-next-line no-await-in-loop -- GeoSpec CAD tests run serially so model-loader state and native resources cannot cross-wire.
          await withTimeout(Promise.resolve(scheduledTest.function_()), testTimeout);
          // oxlint-disable-next-line no-await-in-loop -- Assertions must settle before the next CAD test mutates runner bindings.
          await withTimeout(Promise.all(pendingAssertions.get(scheduledTest.test) ?? []), testTimeout);
        } catch (error) {
          scheduledTest.test.status = 'failed';
          scheduledTest.test.diagnostics.push(...createErrorDiagnostics(error));
        } finally {
          activeTest = previousTest;
          scheduledTest.test.durationMs = performance.now() - startedAt;
        }
      }
    },

    tests,
  };
};

/**
 * Clear runner globals after a module finishes.
 */
export const clearCollectorGlobals = (): void => {
  Reflect.deleteProperty(geospecGlobal, collectorGlobalKey);
};

/**
 * Install a collector into the current JavaScript global scope.
 *
 * @param collector - Collector for the active run.
 */
export const installCollector = (collector: GeoSpecCollector): void => {
  geospecGlobal[collectorGlobalKey] = collector;
};
