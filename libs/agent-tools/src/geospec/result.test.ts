import { describe, expect, it } from 'vitest';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { GeoSpecTestCase } from 'geospec/runner';
import { runnerResultToTestModelOutput } from '#geospec/result.js';

const project = (test: GeoSpecTestCase, file = 'gear.geospec.ts') =>
  runnerResultToTestModelOutput(
    {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      files: [
        {
          file,
          result: {
            success: true,
            passed: false,
            tests: [test],
            bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
          },
        },
      ],
    },
    [file],
  );

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(values);

const nativeReport = (options: {
  readonly claimId: string;
  readonly polarity: 'negative' | 'positive';
  readonly seed: number;
  readonly status: 'failed' | 'passed' | 'refused';
}): GeoSpecCanonicalClaimReport => {
  const { claimId, polarity, seed, status } = options;
  return {
    canonicalClaim: bytes(seed, 0, 255),
    canonicalPlan: bytes(seed + 1, 1, 254),
    canonicalResult: bytes(seed + 2, 2, 253),
    claim: { claimId, label: `claim-${seed}` },
    claimId,
    diagnostics: [{ code: `D${seed}`, severity: 'info' }],
    evidence: { value: seed },
    polarity,
    result: { claimId, status },
    status,
  };
};

describe('model-facing diagnostics', () => {
  it('renders nested rejected warnings in plain-text reasons without dropping their structured originals', () => {
    const nested = [
      { code: 'NON_MANIFOLD', severity: 'warning', message: 'Open gear tooth at x=2', details: { source: 'gear.ts' } },
    ];
    const diagnostic: GeometryDiagnostic = {
      code: 'GEOSPEC_DIAGNOSTICS_PRESENT',
      severity: 'error',
      message: 'Forbidden diagnostics',
      details: { diagnostics: nested },
    };
    const output = project({ suite: [], name: 'health', status: 'failed', assertions: [], diagnostics: [diagnostic] });
    expect(output.failures[0]?.reason).toContain('NON_MANIFOLD: Open gear tooth at x=2');
    expect(output.failures[0]?.diagnostics?.[0]?.details).toEqual({ diagnostics: nested });
  });
  it('keeps every spatial failure and independent test error, omitting only identity mirrors', () => {
    const left: GeometryDiagnostic = {
      code: 'INTERSECTION',
      severity: 'error',
      message: 'Parts overlap',
      spatial: { center: [1, 2, 3] },
      details: { pair: ['left', 'gear'] },
    };
    const right: GeometryDiagnostic = { ...left, spatial: { center: [4, 5, 6] }, details: { pair: ['right', 'gear'] } };
    const independent = structuredClone(left);
    const test: GeoSpecTestCase = {
      suite: [],
      name: 'fit',
      status: 'failed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: false, diagnostics: [left] },
        { kind: 'watertight', subject: {}, expected: true, passed: false, diagnostics: [right] },
      ],
      diagnostics: [left, right, independent],
    };
    const output = project(structuredClone(test));
    expect(output.total).toBe(1);
    expect(output.failures[0]?.diagnostics).toStrictEqual([left, right, independent]);
    expect(output.failures[0]?.reason).toBe('Parts overlap\nParts overlap\nParts overlap');
  });
});

describe('native canonical reports', () => {
  it('projects every passed, failed, and refused claim as JSON without canonical engine bytes', () => {
    const passedOne = nativeReport({ claimId: 'pass-1', status: 'passed', polarity: 'positive', seed: 10 });
    const passedTwo = nativeReport({ claimId: 'pass-2', status: 'passed', polarity: 'negative', seed: 20 });
    const failed = nativeReport({ claimId: 'fail-1', status: 'failed', polarity: 'positive', seed: 30 });
    const refused = nativeReport({ claimId: 'refused-1', status: 'refused', polarity: 'negative', seed: 40 });
    const passing = project({
      suite: ['native'],
      name: 'passes',
      status: 'passed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: true, nativeReport: passedOne },
        { kind: 'watertight', subject: {}, expected: false, passed: true, nativeReport: passedTwo },
      ],
      diagnostics: [],
    });
    const failing = project({
      suite: ['native'],
      name: 'fails and refuses',
      status: 'failed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: false, nativeReport: failed },
        { kind: 'watertight', subject: {}, expected: false, passed: false, nativeReport: refused },
      ],
      diagnostics: [],
    });

    expect(testModelOutputSchema.parse(passing)).toStrictEqual(passing);
    expect(testModelOutputSchema.parse(failing)).toStrictEqual(failing);
    expect(passing.passes[0]?.reports?.map(({ claimId, status, polarity }) => ({ claimId, status, polarity }))).toEqual(
      [
        { claimId: 'pass-1', status: 'passed', polarity: 'positive' },
        { claimId: 'pass-2', status: 'passed', polarity: 'negative' },
      ],
    );
    expect(
      failing.failures[0]?.reports?.map(({ claimId, status, polarity }) => ({ claimId, status, polarity })),
    ).toEqual([
      { claimId: 'fail-1', status: 'failed', polarity: 'positive' },
      { claimId: 'refused-1', status: 'refused', polarity: 'negative' },
    ]);
    for (const [projected, original] of [
      [passing.passes[0]?.reports?.[0], passedOne],
      [passing.passes[0]?.reports?.[1], passedTwo],
      [failing.failures[0]?.reports?.[0], failed],
      [failing.failures[0]?.reports?.[1], refused],
    ] as const) {
      expect(projected).toStrictEqual({
        claimId: original.claimId,
        status: original.status,
        polarity: original.polarity,
        claim: original.claim,
        result: original.result,
        diagnostics: original.diagnostics,
        evidence: original.evidence,
      });
    }
  });

  it('leaves legacy passed and failed row shapes unchanged', () => {
    expect(
      project({
        suite: [],
        name: 'legacy pass',
        status: 'passed',
        assertions: [{ kind: 'watertight', subject: {}, expected: true, passed: true }],
        diagnostics: [],
      }),
    ).toStrictEqual({
      failures: [],
      passes: [
        {
          id: 'gear.geospec.ts:legacy pass',
          requirement: 'legacy pass',
          targetFile: 'gear.geospec.ts',
        },
      ],
      passed: 1,
      total: 1,
    });
    expect(
      project({
        suite: [],
        name: 'legacy fail',
        status: 'failed',
        assertions: [{ kind: 'watertight', subject: {}, expected: true, passed: false }],
        diagnostics: [],
      }),
    ).toStrictEqual({
      failures: [
        {
          id: 'gear.geospec.ts:legacy fail',
          requirement: 'legacy fail',
          reason: 'GeoSpec test failed.',
          suggestion: 'Inspect the GeoSpec diagnostics and update the model or expected geometry assertion.',
          targetFile: 'gear.geospec.ts',
          diagnostics: [],
        },
      ],
      passes: [],
      passed: 0,
      total: 1,
    });
  });
});

describe('GeoSpec authoring recovery', () => {
  it('should direct an empty project to its selected recipe without assuming legacy', () => {
    const output = runnerResultToTestModelOutput(
      { success: true, passed: 0, failed: 0, selectedTests: 0, files: [] },
      [],
    );
    expect(testModelOutputSchema.safeParse(output).success).toBe(true);
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]).toMatchObject({
      id: 'missing_geospec_file',
      targetFile: '*.geospec.ts',
    });
    expect(output.failures[0]?.suggestion).toContain('selected API recipe in the test_model description');
    expect(output.failures[0]?.suggestion).toContain('loadModel with expectGeo for legacy');
    expect(output.failures[0]?.suggestion).toContain('loadNativeModel with expectNativeGeo for native');
  });
});
