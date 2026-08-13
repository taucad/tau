import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeoSpec, describe as geoDescribe, expectGeo, geoSpecMatcherNames, it as geoIt, test } from '#index.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';
import { decodeGeoSpecCanonicalJson, geoSpecEngineProtocolVersion, toGeoSpecProtocolJson } from '#engine/protocol.js';
import { clearGeoSpecEngine, registerGeoSpecEngine } from '#engine/seam.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import type { GeoSpecSubmitClaimsRequest, GeoSpecSubmitClaimsResult } from '#engine/protocol.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import {
  clearCollectorGlobals,
  collectorGlobalKey,
  createCollector,
  GeoSpecAssertionError,
  getCollector,
  installCollector,
} from '#runner/collector.js';

const failure: GeometryDiagnostic = { code: 'FIXTURE_FAIL', severity: 'error', message: 'nope' };

const subject = { kind: 'geometry-subject-reference', subjectId: 'subject-1', contentHash: 'sha256:test' };

const claimResult = (
  request: GeoSpecSubmitClaimsRequest,
  diagnostics: readonly GeometryDiagnostic[] = [],
): GeoSpecSubmitClaimsResult => {
  const claim = decodeGeoSpecCanonicalJson(request.claims[0]!);
  const claimId =
    typeof claim === 'object' && claim !== null && !Array.isArray(claim) && typeof claim['claimId'] === 'string'
      ? claim['claimId']
      : 'invalid';
  return {
    requestId: request.requestId,
    results: [
      {
        claimId,
        status: diagnostics.length === 0 ? 'passed' : 'failed',
        diagnostics: diagnostics.map((diagnostic) => toGeoSpecProtocolJson(diagnostic)),
        provenance: {},
      },
    ],
  };
};

const registerProtocol = (options: {
  capability: string;
  submitClaims: (request: GeoSpecSubmitClaimsRequest) => GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult>;
}): void => {
  registerGeoSpecEngine({
    protocolVersion: geoSpecEngineProtocolVersion,
    engine: 'collector-test-engine',
    version: '0.0.0',
    protocol: createTestGeoSpecEngineProtocol({
      capabilities: [options.capability],
      submitClaims: options.submitClaims,
    }),
  });
};

afterEach(() => {
  vi.useRealTimers();
  clearGeoSpecEngine();
  clearCollectorGlobals();
});

describe('collector globals', () => {
  it('should install, read, and clear the collector global', () => {
    const collector = createCollector();
    installCollector(collector);

    expect(getCollector()).toBe(collector);
    expect((globalThis as Record<string, unknown>)[collectorGlobalKey]).toBe(collector);

    clearCollectorGlobals();
    expect(() => getCollector()).toThrow('GeoSpec collector is not active');
  });

  it('should reject a non-collector global', () => {
    (globalThis as Record<string, unknown>)[collectorGlobalKey] = { describe: () => undefined };

    expect(() => getCollector()).toThrow('GeoSpec collector is not active');
  });
});

describe('suite and test tree', () => {
  it('should record nested suites, skips, and passing tests', async () => {
    const collector = createCollector();
    collector.describe('outer', () => {
      collector.it('passes', () => undefined);
      collector.itSkip('skipped');
    });
    collector.describeSkip('ignored suite', () => {
      throw new Error('never runs');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => [entry.suite, entry.name, entry.status])).toStrictEqual([
      [['outer'], 'passes', 'passed'],
      [['outer'], 'skipped', 'skipped'],
      [[], 'ignored suite', 'skipped'],
    ]);
  });

  it('should settle asynchronous suite definitions before running tests', async () => {
    const collector = createCollector();
    collector.describe('async suite', async () => {
      await Promise.resolve();
      collector.it('registered late', () => undefined);
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.status)).toStrictEqual(['passed']);
  });

  it('should record a failed asynchronous suite definition as a failed test', async () => {
    const collector = createCollector();
    collector.describe('broken suite', async () => {
      await Promise.resolve();
      throw new Error('definition exploded');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('definition exploded');
  });

  it('should run waitForCompletion only once', async () => {
    const collector = createCollector();
    collector.it('once', () => undefined);
    await collector.waitForCompletion(1000);
    const first = collector.tests[0]?.durationMs;
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.durationMs).toBe(first);
  });

  it('should not execute tests the name pattern excludes', async () => {
    const executed: string[] = [];
    const collector = createCollector();
    collector.it('kept', () => {
      executed.push('kept');
    });
    collector.it('dropped', () => {
      executed.push('dropped');
    });
    await collector.waitForCompletion(1000, /kept/u);

    expect(executed).toStrictEqual(['kept']);
  });

  it('should fail a test that exceeds the timeout', async () => {
    const collector = createCollector();
    collector.it('slow', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    await collector.waitForCompletion(1);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.message).toContain('timed out');
  });

  it('should not impose a default timeout on cold model acquisition', async () => {
    vi.useFakeTimers();
    const collector = createCollector();
    collector.it('cold assembly', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 51_000);
      });
    });

    const completion = collector.waitForCompletion();
    await vi.advanceTimersByTimeAsync(51_000);
    await completion;

    expect(collector.tests[0]?.status).toBe('passed');
  });
});

describe('expectGeo proxy', () => {
  it('should expose every registry matcher name in registry order', () => {
    const matcher = createCollector().expectGeo(undefined);

    expect(Object.keys(matcher)).toStrictEqual(Object.keys(geoSpecMatcherDescriptors));
    expect(geoSpecMatcherNames).toStrictEqual(Object.keys(geoSpecMatcherDescriptors));
  });

  it('should refuse assertions outside it()', () => {
    expect(() => createCollector().expectGeo(undefined).toBeWatertight()).toThrow(
      'expectGeo() must be called inside it().',
    );
  });

  it('should record a passing synchronous assertion with its normalized expectation', async () => {
    const claims: unknown[] = [];
    registerProtocol({
      capability: 'toHaveBoundingBox',
      submitClaims: (request) => {
        claims.push(decodeGeoSpecCanonicalJson(request.claims[0]!));
        return claimResult(request);
      },
    });

    const collector = createCollector();
    collector.it('bounds', () => {
      collector.expectGeo(subject).toHaveBoundingBox([0, 0, 0], [1, 1, 1]);
    });
    await collector.waitForCompletion(1000);

    const [assertion] = collector.tests[0]?.assertions ?? [];
    expect(collector.tests[0]?.status).toBe('passed');
    expect(assertion?.passed).toBe(true);
    expect(assertion?.expected).toStrictEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(assertion?.durationMs).toBeGreaterThanOrEqual(0);
    expect(claims[0]).toMatchObject({
      capability: 'toHaveBoundingBox',
      subjectIds: ['subject-1'],
      payload: {
        kind: 'boundingBox',
        arguments: [
          [0, 0, 0],
          [1, 1, 1],
        ],
        expected: { min: [0, 0, 0], max: [1, 1, 1] },
      },
    });
  });

  it('should throw GeoSpecAssertionError inside it() when a sync matcher fails', async () => {
    registerProtocol({ capability: 'toBeWatertight', submitClaims: (request) => claimResult(request, [failure]) });

    const collector = createCollector();
    let caught: unknown;
    collector.it('watertight', () => {
      try {
        collector.expectGeo(subject).toBeWatertight();
      } catch (error) {
        caught = error;
        throw error;
      }
    });
    await collector.waitForCompletion(1000);

    expect(caught).toBeInstanceOf(GeoSpecAssertionError);
    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics).toStrictEqual([failure]);
  });

  it('should settle an async matcher before the test completes', async () => {
    registerProtocol({
      capability: 'toHaveSpatialRelationships',
      submitClaims: async (request) => claimResult(request, [failure]),
    });

    const collector = createCollector();
    collector.it('relationships', () => {
      collector.expectGeo(subject).toHaveSpatialRelationships({ relationships: [] });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.assertions[0]?.diagnostics).toStrictEqual([failure]);
  });

  it('should answer GEOSPEC_ENGINE_UNAVAILABLE when no engine backs the matcher', async () => {
    const collector = createCollector();
    collector.it('volume', () => {
      collector.expectGeo('subject').toHaveVolume({ value: 1 });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.diagnostics[0]?.code).toBe('GEOSPEC_ENGINE_UNAVAILABLE');
  });

  it('should reject an engine that returns a promise from a synchronous matcher', async () => {
    registerProtocol({ capability: 'toHaveVolume', submitClaims: async (request) => claimResult(request) });

    const collector = createCollector();
    collector.it('volume', () => {
      collector.expectGeo(subject).toHaveVolume({ value: 1 });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.diagnostics[0]?.code).toBe('GEOSPEC_ENGINE_CONTRACT_VIOLATION');
  });

  it('should translate known subject-API misuse into a guided diagnostic', async () => {
    const collector = createCollector();
    collector.it('misuse', () => {
      throw new Error('model.volume is not a function');
    });
    collector.it('bounds misuse', () => {
      throw new Error("Cannot read properties of undefined (reading 'bounds')");
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.diagnostics[0]?.code)).toStrictEqual([
      'GEOSPEC_SUBJECT_API_MISUSE',
      'GEOSPEC_SUBJECT_API_MISUSE',
    ]);
  });
});

describe('authoring helpers', () => {
  it('should delegate the module-scoped helpers to the installed collector', async () => {
    const collector = createCollector();
    installCollector(collector);

    geoDescribe('helpers', () => {
      geoIt('runs', () => {
        expect(expectGeo('subject')).toHaveProperty('toBeWatertight');
      });
      test('aliased', () => undefined);
      geoIt.skip('skipped test');
      geoDescribe.skip('skipped suite');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.name)).toStrictEqual([
      'runs',
      'aliased',
      'skipped test',
      'skipped suite',
    ]);
  });

  it('should expose lazy mesh helpers from createGeoSpec', async () => {
    const geospec = createGeoSpec();

    await expect(geospec.loadMesh({ source: 'model.glb' })).resolves.toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_ENGINE_UNAVAILABLE' })],
    });
    await expect(geospec.analyzeMesh({ source: 'model.glb' })).resolves.toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_ENGINE_UNAVAILABLE' })],
    });
  });
});
