import { describe, expect, it } from 'vitest';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import type { GeoSpecRuntimeClient } from '#model/types.js';
import { createCollector } from '#runner/collector.js';
import { compileGeoSpecTestNamePattern, matchesGeoSpecTestName } from '#runner/filter.js';
import { chargeBudget, withMatcherBudget } from '#runner/matcher-budget.js';
import { countRunnerTests } from '#runner/worker/serial-runner.js';
import {
  angleBetweenDegrees,
  axisAngleBetweenDegrees,
  normalize,
  transformDirection,
  transformPoint,
} from '#selector/vector-math.js';
import { interopExpectations } from '#step/interop-nist.manifest.js';
import type { GeoSpecTestCase } from '#runner/types.js';

describe('interop manifest', () => {
  it('should declare the pinned NIST PMI expectations', () => {
    expect(interopExpectations.length).toBeGreaterThan(0);
    expect(interopExpectations.every((expectation) => expectation.file.length > 0)).toBe(true);
  });
});

describe('GeoSpecModelLoadError', () => {
  it('should snapshot structured diagnostics', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'first' },
      { code: 'B', severity: 'error', message: 'second' },
    ]);

    expect(error.message).toBe('first\nsecond');
    expect(error.diagnostics).toHaveLength(2);
  });

  it('should default the message when no diagnostics are supplied', () => {
    expect(new GeoSpecModelLoadError([]).message).toBe('GeoSpec model load failed.');
  });

  it('should stringify details that cannot be structurally cloned', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: { fn: () => undefined } },
    ]);

    expect(error.diagnostics[0]?.details).toBe('{}');
  });

  it('should keep string details verbatim', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: 'reason' as unknown as { fn: () => void } },
    ]);
    const cloned = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: { fn: () => undefined, self: undefined } },
    ]);

    expect(error.diagnostics[0]?.details).toBe('reason');
    expect(cloned.diagnostics[0]?.details).toBe('{}');
  });

  it('should tolerate a diagnostic with no details at all', () => {
    const bigint = { value: 1n };
    const error = new GeoSpecModelLoadError([{ code: 'A', severity: 'error', message: 'x', details: bigint }]);

    expect(error.diagnostics[0]?.details).toStrictEqual(bigint);
  });
});

describe('test-name filter', () => {
  const test = (suite: string[], name: string): GeoSpecTestCase => ({
    suite,
    name,
    assertions: [],
    status: 'passed',
    diagnostics: [],
  });

  it('should treat blank patterns as no filter', () => {
    expect(compileGeoSpecTestNamePattern(undefined)).toStrictEqual({ success: true });
    expect(compileGeoSpecTestNamePattern('   ')).toStrictEqual({ success: true });
  });

  it('should pass a precompiled expression through', () => {
    const pattern = /abc/u;

    expect(compileGeoSpecTestNamePattern(pattern)).toStrictEqual({ success: true, pattern });
  });

  it('should compile a string source', () => {
    const compiled = compileGeoSpecTestNamePattern('bore');

    expect(compiled.success && compiled.pattern?.source).toBe('bore');
  });

  it('should report an invalid source', () => {
    const compiled = compileGeoSpecTestNamePattern('(');

    expect(compiled.success).toBe(false);
    expect(!compiled.success && compiled.issue.code).toBe('INVALID_GEOSPEC_TEST_NAME_PATTERN');
  });

  it('should match against the full suite path', () => {
    expect(matchesGeoSpecTestName(test(['outer'], 'inner'), /outer > inner/u)).toBe(true);
    expect(matchesGeoSpecTestName(test(['outer'], 'inner'), /nope/u)).toBe(false);
    expect(matchesGeoSpecTestName(test([], 'inner'), undefined)).toBe(true);
  });
});

describe('matcher budget private controls', () => {
  it('should honour private budgets and restore an outer budget', () => {
    const outer = withMatcherBudget({
      matcher: 'outer',
      workUnitBudget: 2,
      wallBackstop: 60_000,
      evaluate: () => {
        const inner = withMatcherBudget({
          matcher: 'inner',
          workUnitBudget: 2,
          evaluate: () => {
            chargeBudget(99);
            return [];
          },
        });
        expect(inner[0]?.code).toBe('MATCHER_TIMEOUT');
        chargeBudget(1);
        return [];
      },
    });

    expect(outer).toStrictEqual([]);
  });

  it('should report the non-verdict wall backstop', () => {
    const diagnostics = withMatcherBudget({
      matcher: 'stalled',
      wallBackstop: 0.000_001,
      evaluate: () => {
        const start = Date.now();
        while (Date.now() <= start) {
          // Spin one millisecond so the backstop deadline is genuinely past
        }
        chargeBudget(1);
        return [];
      },
    });

    expect(diagnostics[0]?.code).toBe('MATCHER_STALLED');
  });

  it('should ignore charges outside a matcher', () => {
    expect(() => {
      chargeBudget(1_000_000);
    }).not.toThrow();
  });
});

describe('runner aggregates', () => {
  it('should count pass and fail totals, ignoring skips', () => {
    expect(
      countRunnerTests([
        { suite: [], name: 'a', assertions: [], status: 'passed', diagnostics: [] },
        { suite: [], name: 'b', assertions: [], status: 'failed', diagnostics: [] },
        { suite: [], name: 'c', assertions: [], status: 'skipped', diagnostics: [] },
      ]),
    ).toStrictEqual({ passed: 1, failed: 1 });
  });
});

describe('collector suite errors', () => {
  it('should record a synchronous suite-definition failure', async () => {
    const collector = createCollector();
    collector.describe('broken', () => {
      throw new Error('sync definition exploded');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('sync definition exploded');
  });

  it('should stringify a non-Error thrown from a test body', async () => {
    const collector = createCollector();
    collector.it('throws a string', () => {
      // oxlint-disable-next-line typescript/only-throw-error -- the collector must survive non-Error throws.
      throw 'plain string';
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('plain string');
  });
});

describe('vector math', () => {
  it('should reject degenerate directions', () => {
    expect(normalize([0, 0, 0])).toBeUndefined();
    expect(angleBetweenDegrees([0, 0, 0], [1, 0, 0])).toBeUndefined();
    expect(angleBetweenDegrees([1, 0, 0], [0, 0, 0])).toBeUndefined();
    expect(axisAngleBetweenDegrees([0, 0, 0], [1, 0, 0])).toBeUndefined();
  });

  it('should measure orientation-insensitive axis angles', () => {
    expect(angleBetweenDegrees([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180);
    expect(axisAngleBetweenDegrees([1, 0, 0], [-1, 0, 0])).toBeCloseTo(0);
    expect(angleBetweenDegrees([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
  });

  it('should apply row-major placement transforms', () => {
    const translate = [1, 0, 0, 5, 0, 1, 0, 6, 0, 0, 1, 7, 0, 0, 0, 1];

    expect(transformPoint(translate, [1, 2, 3])).toStrictEqual([6, 8, 10]);
    expect(transformDirection(translate, [1, 2, 3])).toStrictEqual([1, 2, 3]);
    expect(transformPoint([], [1, 2, 3])).toStrictEqual([0, 0, 0]);
  });
});

describe('runtime export intent', () => {
  const routelessRuntime = {} as unknown as GeoSpecRuntimeClient;

  it('should request canonical mesh evidence from a route-unaware runtime', () => {
    const intent = resolveRuntimeExportIntent({ runtime: routelessRuntime, format: 'glb' });

    expect(intent).toStrictEqual({
      options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'glb', coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        honored: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
          sourceUnit: 'mm',
        },
      },
    });
  });

  it('should accept a direct BRep STEP route and record its provenance', () => {
    const runtime = {
      bestRouteFor: () => ({
        kernelId: 'replicad',
        sourceFormat: 'brep',
        targetFormat: 'step',
        fidelity: 'brep',
        exportOptions: { schema: { properties: { coordinateSystem: {} } } },
      }),
    } as unknown as GeoSpecRuntimeClient;

    const intent = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(intent).toStrictEqual({
      options: { coordinateSystem: 'z-up' },
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'step' },
        honored: { format: 'step', sourceUnit: 'mm', coordinateSystem: 'z-up' },
        route: {
          kernelId: 'replicad',
          sourceFormat: 'brep',
          targetFormat: 'step',
          fidelity: 'brep',
          direct: true,
        },
      },
    });
  });

  it('should reject a transcoded STEP route', () => {
    const runtime = {
      bestRouteFor: () => ({ transcoderId: 'mesh-to-step', fidelity: 'mesh' }),
    } as unknown as GeoSpecRuntimeClient;

    const result = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(result).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED' })],
    });
  });

  it('should accept a route-aware runtime that has no STEP route at all', () => {
    const runtime = { bestRouteFor: () => undefined } as unknown as GeoSpecRuntimeClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'stp' })).toStrictEqual({
      options: {},
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'stp' },
        honored: { format: 'stp', sourceUnit: 'mm' },
        route: undefined,
      },
    });
  });

  it('should fail a mesh route that cannot express the canonical request', () => {
    const runtime = {
      bestRouteFor: () => ({ exportOptions: { schema: { properties: {} } } }),
    } as unknown as GeoSpecRuntimeClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
  });

  it('should fall back to a canonical request when a route-aware runtime advertises no routes', () => {
    const runtime = { bestRouteFor: () => undefined, capabilities: { routes: [] } } as unknown as GeoSpecRuntimeClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'gltf' })).toMatchObject({ sourceUnit: 'mm' });
  });

  it('should report a missing route when the runtime advertises routes it cannot pick from', () => {
    const runtime = {
      bestRouteFor: () => undefined,
      capabilities: { routes: [{}] },
    } as unknown as GeoSpecRuntimeClient;
    const viaRoutesFor = {
      bestRouteFor: () => undefined,
      routesFor: () => [{}],
    } as unknown as GeoSpecRuntimeClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
    expect(resolveRuntimeExportIntent({ runtime: viaRoutesFor, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
  });

  it('should honour a fully expressive mesh route', () => {
    const runtime = {
      bestRouteFor: () => ({
        kernelId: 'replicad',
        transcoderId: 'gltf',
        exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } } },
      }),
    } as unknown as GeoSpecRuntimeClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toMatchObject({
      options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      provenance: { route: { direct: false } },
    });
  });
});
