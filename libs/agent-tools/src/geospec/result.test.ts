import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { geoSpecFailureCategorySchema, testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { GeoSpecTestCase } from 'geospec/runner';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import { runnerResultToTestModelOutput } from '#geospec/result.js';
import type { GeoSpecKernelEvidence } from '#geospec/result.js';

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

const claimReport = (options: {
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
  it('should preserve literal subjectId parameter keys through lineage transport', () => {
    const parameters: Record<string, unknown> = {
      subjectId: 'authored-name',
      size: 2,
      nested: { subjectId: 'nested-name', keep: true },
    };
    const lineage = {
      status: 'complete',
      modules: [],
      loads: [
        {
          loadId: 'load-1',
          status: 'complete',
          subject: { subjectHash: 'a'.repeat(64) },
          evidence: {
            loadId: 'load-1',
            status: 'complete',
            format: 'gltf',
            parameters,
            ingestOptions: {},
            artifacts: [{ name: 'mesh.bin', sourcePath: 'assets/mesh.bin', sha256: 'b'.repeat(64), byteLength: 2 }],
          },
        },
      ],
    } as const;
    const result: GeoSpecRunnerResult = {
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [
        {
          file: 'gear.geospec.ts',
          result: {
            success: true,
            passed: true,
            lineage,
            bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
            tests: [{ suite: [], name: 'control', status: 'passed', assertions: [], diagnostics: [] }],
          },
        },
      ],
    };
    const output = runnerResultToTestModelOutput(result, ['gear.geospec.ts']);
    expect(output.lineage).toStrictEqual([{ file: 'gear.geospec.ts', lineage }]);
    expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
    for (const invalid of [() => undefined, new Map(), /literal/u, new Uint8Array([1]), Number.NaN]) {
      parameters['invalid'] = invalid;
      expect(() => runnerResultToTestModelOutput(result, ['gear.geospec.ts'])).toThrow(ZodError);
    }
    delete parameters['invalid'];
    Reflect.set(lineage.loads[0].subject, 'engine', { nativeHandle: 1 });
    expect(() => runnerResultToTestModelOutput(result, ['gear.geospec.ts'])).toThrow(ZodError);
  });
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

describe('canonical reports', () => {
  it('should not certify a selection containing only intentional skips', () => {
    const output = runnerResultToTestModelOutput(
      {
        success: true,
        passed: 0,
        failed: 0,
        selectedTests: 1,
        lineageStatus: 'complete',
        accounting: {
          discovered: 1,
          selected: 1,
          completed: 0,
          passed: 0,
          failed: 0,
          unsupported: 0,
          inconclusive: 0,
          skipped: 1,
          notRun: 0,
          requestedFiles: ['gear.geospec.ts'],
          completedFiles: ['gear.geospec.ts'],
          notRunFiles: [],
          discoveryComplete: true,
          cancelled: false,
          bailed: false,
        },
        files: [
          {
            file: 'gear.geospec.ts',
            result: {
              success: true,
              passed: true,
              tests: [{ name: 'skipped', suite: [], status: 'skipped', assertions: [], diagnostics: [] }],
              bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
            },
          },
        ],
      },
      ['gear.geospec.ts'],
    );
    expect(output.runStatus).toBe('not-run');
    expect(output.failures[0]?.id).toBe('NO_MATCHING_GEOSPEC_TESTS');
    expect(output.accounting?.skipped).toBe(1);
  });
  it.each(['passed', 'skipped', 'not-run', 'unsupported', 'inconclusive'] as const)(
    'should qualify only completed selected work while retaining excluded definitions (%s)',
    (status) => {
      const complete = status === 'passed' || status === 'skipped';
      const accounting = {
        discovered: 3,
        selected: 2,
        completed: status === 'skipped' || status === 'not-run' ? 1 : 2,
        passed: status === 'passed' ? 2 : 1,
        failed: 0,
        unsupported: status === 'unsupported' ? 1 : 0,
        inconclusive: status === 'inconclusive' ? 1 : 0,
        skipped: status === 'skipped' ? 1 : 0,
        notRun: status === 'not-run' ? 2 : 1,
        requestedFiles: ['gear.geospec.ts'],
        completedFiles: ['gear.geospec.ts'],
        notRunFiles: [],
        discoveryComplete: true,
        cancelled: false,
        bailed: false,
      };
      const output = runnerResultToTestModelOutput(
        {
          success: complete,
          passed: accounting.passed,
          failed: 0,
          selectedTests: 2,
          accounting,
          lineageStatus: 'complete',
          files: [
            {
              file: 'gear.geospec.ts',
              result: {
                success: true,
                passed: complete,
                tests: [
                  { name: 'control', suite: [], status: 'passed', assertions: [], diagnostics: [] },
                  { name: 'selected', suite: [], status, assertions: [], diagnostics: [] },
                ],
                bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
              },
            },
          ],
        },
        ['gear.geospec.ts'],
      );
      expect(output.runStatus).toBe(status === 'not-run' ? 'inconclusive' : status === 'skipped' ? 'passed' : status);
      expect(output.accounting).toEqual(accounting);
      expect(output.tests?.map((test) => test.status)).toEqual(['passed', status]);
    },
  );
  it('should retain completed claim bytes and registered tests when the module later fails', () => {
    const report = claimReport({ claimId: 'before-crash', status: 'passed', polarity: 'positive', seed: 60 });
    const output = runnerResultToTestModelOutput(
      {
        success: false,
        passed: 0,
        failed: 1,
        selectedTests: 1,
        files: [
          {
            file: 'gear.geospec.ts',
            result: {
              success: false,
              issues: [],
              tests: [
                {
                  ordinal: 0,
                  suite: [],
                  name: 'before crash',
                  status: 'passed',
                  diagnostics: [],
                  assertions: [{ kind: 'watertight', subject: {}, expected: true, passed: true, report }],
                },
              ],
            },
          },
        ],
      },
      ['gear.geospec.ts'],
    );
    expect(output.runStatus).toBe('failed');
    expect(output.tests).toEqual([
      {
        id: 'gear.geospec.ts:0',
        ordinal: 0,
        requirement: 'before crash',
        targetFile: 'gear.geospec.ts',
        status: 'passed',
        assertions: [{ ordinal: 0, status: 'passed', matcher: 'watertight' }],
      },
    ]);
    expect(output.passes[0]?.reports?.[0]?.canonical?.result).toEqual([...report.canonicalResult]);
    expect(output.failures[0]?.id).toBe('gear.geospec.ts:bundle');
  });
  it('should retain skipped and not-run requirements in requested-run accounting', () => {
    const accounting = {
      discovered: 3,
      selected: 2,
      completed: 1,
      passed: 1,
      failed: 0,
      unsupported: 0,
      inconclusive: 0,
      skipped: 1,
      notRun: 1,
      requestedFiles: ['gear.geospec.ts', 'missing.geospec.ts'],
      completedFiles: ['gear.geospec.ts'],
      notRunFiles: ['missing.geospec.ts'],
      discoveryComplete: false,
      cancelled: true,
      bailed: false,
    };
    const statuses: Array<GeoSpecTestCase['status']> = ['passed', 'skipped', 'not-run'];
    const result: GeoSpecRunnerResult = {
      success: false,
      passed: 1,
      failed: 0,
      selectedTests: 2,
      accounting,
      lineageStatus: 'unavailable',
      files: [
        {
          file: 'gear.geospec.ts',
          result: {
            success: true,
            passed: false,
            tests: statuses.map((status, index) => ({
              suite: [],
              name: `requirement ${index}`,
              status,
              assertions: [],
              diagnostics: [],
            })),
            bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
          },
        },
      ],
    };
    const output = runnerResultToTestModelOutput(result, accounting.requestedFiles);
    expect(output).toMatchObject({ accounting, lineageStatus: 'unavailable', runStatus: 'inconclusive' });
    expect(output.tests?.map(({ status }) => status)).toEqual(['passed', 'skipped', 'not-run']);
    expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
  });
  it.each(['unsupported', 'inconclusive', 'refused', 'cancelled', 'unknown'])(
    'does not turn a %s negative claim into a passing tool row',
    (status) => {
      const report = {
        ...claimReport({ claimId: 'missing-evidence', status: 'refused', polarity: 'negative', seed: 50 }),
        status,
        result: { status },
      };
      const output = project({
        suite: [],
        name: 'evidence required',
        status: 'passed',
        assertions: [{ kind: 'watertight', subject: {}, expected: false, passed: true, report }],
        diagnostics: [],
      });
      expect(output.passes).toHaveLength(0);
      expect(output.failures).toHaveLength(1);
      expect(output.failures[0]?.reports?.[0]?.status).toBe(status);
    },
  );

  it('should preserve exact core bytes before compact result normalization', () => {
    const passedOne = claimReport({ claimId: 'pass-1', status: 'passed', polarity: 'positive', seed: 10 });
    const passedTwo = claimReport({ claimId: 'pass-2', status: 'passed', polarity: 'negative', seed: 20 });
    const failed = claimReport({ claimId: 'fail-1', status: 'failed', polarity: 'positive', seed: 30 });
    const refused = claimReport({ claimId: 'refused-1', status: 'refused', polarity: 'negative', seed: 40 });
    const passing = project({
      suite: ['native'],
      name: 'passes',
      status: 'passed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: true, report: passedOne },
        { kind: 'watertight', subject: {}, expected: false, passed: true, report: passedTwo },
      ],
      diagnostics: [],
    });
    const failing = project({
      suite: ['native'],
      name: 'fails and refuses',
      status: 'failed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: false, report: failed },
        { kind: 'watertight', subject: {}, expected: false, passed: false, report: refused },
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
        canonical: {
          claim: [...original.canonicalClaim],
          plan: [...original.canonicalPlan],
          result: [...original.canonicalResult],
        },
      });
    }
  });

  it('preserves passed and failed row shapes for reports without compiled claims', () => {
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
      runStatus: 'failed',
      lineageStatus: 'unavailable',
      tests: [
        {
          id: 'gear.geospec.ts:legacy pass',
          requirement: 'legacy pass',
          targetFile: 'gear.geospec.ts',
          status: 'passed',
          assertions: [{ ordinal: 0, status: 'passed', matcher: 'watertight' }],
        },
      ],
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
          status: 'failed',
          reason: 'GeoSpec test failed.',
          suggestion:
            'Change the model so it meets this requirement, using the expected and actual values in the diagnostics. Keep the assertion and its tolerance.',
          category: 'geometry',
          targetFile: 'gear.geospec.ts',
          diagnostics: [],
        },
      ],
      passes: [],
      passed: 0,
      total: 1,
      runStatus: 'failed',
      lineageStatus: 'unavailable',
      tests: [
        {
          id: 'gear.geospec.ts:legacy fail',
          requirement: 'legacy fail',
          targetFile: 'gear.geospec.ts',
          status: 'failed',
          assertions: [{ ordinal: 0, status: 'failed', matcher: 'watertight' }],
        },
      ],
    });
  });
});

describe('per-assertion results', () => {
  it('should keep a passed claim beside the refused claim of the same requirement', () => {
    const refusal: GeometryDiagnostic = {
      code: 'GEOSPEC_ANALYSIS_LIMIT',
      severity: 'error',
      message: 'Continuous evidence needs 35.6 MiB (37290112 bytes); the analysis limit is 32 MiB (33554432 bytes).',
      details: { limit: 33_554_432, limitClass: 'analysis', required: 37_290_112, unit: 'bytes' },
    };
    const passed = claimReport({ claimId: 'bounds', polarity: 'positive', seed: 1, status: 'passed' });
    const refused = claimReport({ claimId: 'interference', polarity: 'positive', seed: 4, status: 'refused' });
    const output = project({
      suite: ['gears'],
      name: 'mesh without interference',
      status: 'inconclusive',
      assertions: [
        { kind: 'boundingBox', subject: null, expected: {}, passed: true, diagnostics: [], report: passed },
        {
          kind: 'componentInterference',
          subject: null,
          expected: {},
          passed: false,
          diagnostics: [refusal],
          report: { ...refused, claim: { claimId: 'interference', capability: 'toHaveNoComponentInterference' } },
          loadId: 'load-1',
        },
      ],
      diagnostics: [refusal],
    });

    expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
    expect(output.failures[0]?.status).toBe('inconclusive');
    expect(output.tests?.[0]?.assertions).toStrictEqual([
      { ordinal: 0, status: 'passed', matcher: 'boundingBox' },
      {
        ordinal: 1,
        status: 'inconclusive',
        matcher: 'componentInterference',
        code: 'GEOSPEC_ANALYSIS_LIMIT',
        message: refusal.message,
        limit: {
          kind: 'capacity',
          name: 'continuousEvidenceBytes',
          declared: 33_554_432,
          measured: 37_290_112,
          unit: 'bytes',
          operation: 'toHaveNoComponentInterference',
          subject: 'load-1',
          retry: null,
          source: 'engine',
        },
      },
    ]);
  });

  it.each([
    ['failed', 'failed'],
    ['unsupported', 'unsupported'],
    ['invalid', 'failed'],
    ['engine-error', 'failed'],
    ['cancelled', 'inconclusive'],
  ] as const)('should read a %s claim as %s', (reportStatus, status) => {
    const report = {
      ...claimReport({ claimId: 'c', polarity: 'positive', seed: 1, status: 'failed' }),
      status: reportStatus,
    };
    const output = project({
      suite: [],
      name: 'claim',
      status,
      assertions: [{ kind: 'volume', subject: null, expected: {}, passed: false, report }],
      diagnostics: [],
    });

    expect(output.tests?.[0]?.assertions?.[0]?.status).toBe(status);
  });

  it.each([
    ['unsupported', 'unsupported'],
    ['refused', 'inconclusive'],
    ['failed', 'failed'],
  ] as const)(
    'should give a passed test whose %s claim did not pass that claim status, not failed',
    (reportStatus, status) => {
      const output = project({
        suite: [],
        name: 'claim',
        status: 'passed',
        assertions: [
          {
            kind: 'boundingBox',
            subject: null,
            expected: {},
            passed: true,
            report: claimReport({ claimId: 'a', polarity: 'positive', seed: 1, status: 'passed' }),
          },
          {
            kind: 'volume',
            subject: null,
            expected: {},
            passed: true,
            report: {
              ...claimReport({ claimId: 'b', polarity: 'positive', seed: 2, status: 'failed' }),
              status: reportStatus,
            },
          },
        ],
        diagnostics: [],
      });

      expect(output.failures[0]?.status).toBe(status);
    },
  );

  it('should fail a claim that threw before the engine reported', () => {
    const thrown: GeometryDiagnostic = { code: 'TEST_FAILED', severity: 'error', message: 'threw' };
    const output = project({
      suite: [],
      name: 'claim',
      status: 'failed',
      assertions: [{ kind: 'volume', subject: null, expected: {}, passed: false, diagnostics: [thrown] }],
      diagnostics: [thrown],
    });

    expect(output.failures[0]?.status).toBe('failed');
    expect(output.tests?.[0]?.assertions).toStrictEqual([
      { ordinal: 0, status: 'failed', matcher: 'volume', code: 'TEST_FAILED', message: 'threw' },
    ]);
  });
});

describe('GeoSpec authoring recovery', () => {
  it('should direct an empty project to the canonical recipe without engine selection', () => {
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
    expect(output.failures[0]?.suggestion).toContain('loadModel from geospec/model and expectGeo from geospec');
    expect(output.failures[0]?.suggestion).not.toMatch(/native|legacy/u);
  });
});

describe('failure categories and suggestions', () => {
  const refused = (diagnostic: GeometryDiagnostic, status: 'failed' | 'refused' = 'refused'): GeoSpecTestCase => ({
    suite: ['shade'],
    name: 'is one piece',
    status: status === 'failed' ? 'failed' : 'inconclusive',
    assertions: [
      {
        kind: 'connectedComponents',
        subject: {},
        expected: { count: 1 },
        passed: false,
        loadId: 'load-1',
        diagnostics: [diagnostic],
        report: claimReport({ claimId: 'claim-1', polarity: 'positive', seed: 1, status }),
      },
    ],
    diagnostics: [],
  });
  const failureOf = (test: GeoSpecTestCase, kernels?: ReadonlyMap<string, GeoSpecKernelEvidence>) => {
    const output = runnerResultToTestModelOutput(
      {
        success: false,
        passed: 0,
        failed: 1,
        selectedTests: 1,
        files: [
          {
            file: 'lamp.geospec.ts',
            result: {
              success: true,
              passed: false,
              tests: [test],
              bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
              lineage: {
                status: 'complete',
                modules: [],
                loads: [
                  {
                    loadId: 'load-1',
                    status: 'complete',
                    evidence: {
                      loadId: 'load-1',
                      status: 'complete',
                      format: 'glb',
                      parameters: {},
                      ingestOptions: {},
                      sourcePath: 'main.ts',
                      artifacts: [{ name: 'main.glb', sha256: 'c'.repeat(64), byteLength: 3 }],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      ['lamp.geospec.ts'],
      kernels === undefined ? {} : { kernels },
    );
    expect(testModelOutputSchema.safeParse(output).success).toBe(true);
    const [failure] = output.failures;
    if (failure === undefined) {
      throw new Error('Expected one failure row.');
    }
    return failure;
  };
  const weakening = /update the model or expected geometry assertion|weaken|relax the tolerance/iu;
  const reducing = /\b(?:coarsen|coarser export|shrink|crop the|smaller part)\b/iu;
  const limitRows: ReadonlySet<string> = new Set(['analysis-limit', 'resource-limit', 'work-budget']);
  /** One row of every failure category, each with the next step its suggestion must lead with. */
  const categoryRows: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly suggestion?: string;
    readonly decided?: boolean;
    readonly category: string;
    readonly next: RegExp;
  }> = [
    {
      code: 'GEOSPEC_CONNECTED_COMPONENTS_MISMATCH',
      message: 'The model has 2 spatially disjoint components; the claim declares 1.',
      decided: true,
      category: 'geometry',
      next: /^Change the model so it meets this requirement/u,
    },
    {
      code: 'GEOSPEC_ANALYSIS_LIMIT',
      message: 'Connectivity scratch 6.1 GB exceeds the 256 MiB analysis limit.',
      category: 'analysis-limit',
      next: /^Not decided: the analysis limit[^]*No `test_model` argument raises it[^]*not decided\.$/u,
    },
    {
      code: 'GEOSPEC_RESOURCE_LIMIT',
      message: 'Primary geometry 54 MB exceeds the 64 MiB subject limit.',
      category: 'resource-limit',
      next: /^Not decided: the admission limit[^]*No `test_model` argument raises it[^]*not decided\.$/u,
    },
    {
      code: 'MATCHER_TIMEOUT',
      message: 'Claim exhausted 8000000 work units.',
      category: 'work-budget',
      next: /workUnitLimit/u,
    },
    {
      code: 'GEOSPEC_TEST_TIMEOUT',
      message: 'GeoSpec test timed out after 20000ms.',
      category: 'timeout',
      next: /testTimeout/u,
    },
    {
      code: 'GEOSPEC_EVIDENCE_UNSUPPORTED',
      message: 'The subject is outside the qualified continuous wall-thickness domains.',
      category: 'unsupported-evidence',
      next: /^Keep the assertion and load evidence that can answer it\./u,
    },
    {
      code: 'GEOSPEC_MODEL_OPTION_INVALID',
      message:
        "GeoSpec loadModel workUnitLimit must be a positive integer no greater than this host's maximum of 512000000 (the host can raise it with maximumWorkUnitLimit); received 0.",
      suggestion: 'Pass a positive integer workUnitLimit within the stated bound, or omit it for the engine default.',
      category: 'model-load',
      next: /^Pass a positive integer workUnitLimit/u,
    },
    {
      code: 'GEOSPEC_SOME_FUTURE_CODE',
      message: 'A refusal this host has never seen.',
      category: 'infrastructure',
      next: /not a geometry verdict/u,
    },
  ];

  it.each(categoryRows)(
    'should map $code to its own $category category with a next step that keeps the claim',
    ({ code, message, suggestion, decided = false, category, next }) => {
      const diagnostic: GeometryDiagnostic = {
        code,
        severity: 'error',
        message,
        ...(suggestion === undefined ? {} : { suggestion }),
      };
      const failure = failureOf(refused(diagnostic, decided ? 'failed' : 'refused'));
      expect(failure.category).toBe(category);
      expect(failure.suggestion).toMatch(next);
      expect(failure.suggestion).not.toMatch(weakening);
      expect(failure.suggestion).not.toMatch(reducing);
      // Of the limit rows, only work-budget rows name workUnitLimit; a model-load row may name the option it refuses.
      expect(limitRows.has(category) && failure.suggestion.includes('workUnitLimit')).toBe(category === 'work-budget');
    },
  );

  it('should give every failure category a row in the category table', () => {
    expect(new Set(categoryRows.map((row) => row.category))).toStrictEqual(
      new Set(geoSpecFailureCategorySchema.options),
    );
  });

  it('should drop an engine suggestion that reduces the model to fit a limit', () => {
    const failure = failureOf(
      refused({
        code: 'GEOSPEC_ANALYSIS_LIMIT',
        severity: 'error',
        message: 'Connectivity scratch exceeds the analysis limit.',
        suggestion: 'Load a coarser export or crop the subject.',
      }),
    );
    expect(failure.suggestion).not.toMatch(reducing);
    expect(failure.suggestion).toMatch(/^Not decided: /u);
  });

  describe('typed limits', () => {
    const claimRefusal = (diagnostic: GeometryDiagnostic, capability: string): GeoSpecTestCase => {
      const test = refused(diagnostic);
      const [assertion] = test.assertions;
      return {
        ...test,
        assertions: [
          {
            ...assertion!,
            report: { ...assertion!.report!, claim: { claimId: 'claim-1', capability } },
          },
        ],
      };
    };
    /** A load that threw before any claim: the collector records the refusal on the test alone. */
    const admissionRefusal = (diagnostic: GeometryDiagnostic): GeoSpecTestCase => ({
      suite: ['knot'],
      name: 'is watertight',
      status: 'inconclusive',
      assertions: [],
      diagnostics: [diagnostic],
    });
    const projected = (test: GeoSpecTestCase) => {
      const output = project(test, 'lamp.geospec.ts');
      expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
      const [failure] = output.failures;
      expect(output.tests?.[0]?.limit).toStrictEqual(failure?.limit);
      return failure!;
    };
    const engineSuggestion =
      'The claim could not be decided within the configured limit. Keep the claim unchanged; the host can construct the engine with a larger limit or work budget.';

    it('should name an analysis refusal by the evidence the engine names, with its numbers and no retry', () => {
      const failure = projected(
        claimRefusal(
          {
            code: 'GEOSPEC_ANALYSIS_LIMIT',
            severity: 'error',
            message:
              'Continuous evidence needs 35.6 MiB (37290112 bytes); the analysis limit is 32 MiB (33554432 bytes).',
            suggestion: engineSuggestion,
            details: { limit: 33_554_432, limitClass: 'analysis', required: 37_290_112, unit: 'bytes' },
          },
          'toHaveNoComponentInterference',
        ),
      );
      expect(failure).toMatchObject({
        category: 'analysis-limit',
        limit: {
          kind: 'capacity',
          name: 'continuousEvidenceBytes',
          declared: 33_554_432,
          measured: 37_290_112,
          unit: 'bytes',
          operation: 'toHaveNoComponentInterference',
          subject: 'load-1',
          retry: null,
          source: 'engine',
        },
        suggestion:
          'Not decided: toHaveNoComponentInterference needs more than continuousEvidenceBytes (33554432 bytes; this subject 37290112). No `test_model` argument raises it; keep the model and assertion as designed and report the claim as not decided.',
      });
      expect(failure.suggestion).not.toMatch(/step|mesh|workUnitLimit|work budget/iu);
    });

    it('should read a plural "limits" refusal by its code, not its wording', () => {
      const message = 'The report bundle exceeds the declared binary or retained derived-data limits.';
      const limited = projected(
        claimRefusal(
          {
            code: 'GEOSPEC_ANALYSIS_LIMIT',
            severity: 'error',
            message,
            details: { limit: 1_048_576, limitClass: 'analysis', required: 2_097_152, unit: 'bytes' },
          },
          'toHaveNoComponentInterference',
        ),
      );
      expect(limited).toMatchObject({
        category: 'analysis-limit',
        limit: { name: 'reportBundleBytes', declared: 1_048_576, measured: 2_097_152, retry: null },
      });
      const gap = projected(refused({ code: 'GEOSPEC_UNSUPPORTED_EVIDENCE', severity: 'error', message }));
      expect(gap.category).toBe('unsupported-evidence');
      expect(gap).not.toHaveProperty('limit');
    });

    it.each([
      {
        message:
          'Primary geometry is 68.7 MiB (72000184 bytes); the configured binary subject limit is 64 MiB (67108864 bytes).',
        details: { limitClass: 'admission', unit: 'bytes', limit: 67_108_864, required: 72_000_184 },
        limit: { name: 'maxSubjectBytes', declared: 67_108_864, measured: 72_000_184, unit: 'bytes', source: 'engine' },
      },
      {
        message: 'GeoSpec retained admission input exceeds its byte limit.',
        details: {
          limitClass: 'admission',
          unit: 'bytes',
          name: 'maxTotalBinaryBytes',
          limit: 134_217_728,
          required: 144_000_184,
          source: 'host',
        },
        limit: {
          name: 'maxTotalBinaryBytes',
          declared: 134_217_728,
          measured: 144_000_184,
          unit: 'bytes',
          source: 'host',
        },
      },
      {
        message: 'The decoded mesh has 4000064 triangles; the configured triangle limit is 4000000 triangles.',
        details: { limitClass: 'admission', unit: 'triangles', limit: 4_000_000, required: 4_000_064 },
        limit: { name: 'maxTriangles', declared: 4_000_000, measured: 4_000_064, unit: 'triangles', source: 'engine' },
      },
      {
        message:
          'This admission needs 33 retained subjects; the configured retained subject limit is 32 retained subjects.',
        details: { limitClass: 'admission', unit: 'retained subjects', limit: 32, required: 33 },
        limit: { name: 'maxRetainedSubjects', declared: 32, measured: 33, unit: 'retained subjects', source: 'engine' },
      },
    ])('should type the refused admission as its configured limit $limit.name', ({ message, details, limit }) => {
      const failure = projected(
        admissionRefusal({ code: 'GEOSPEC_RESOURCE_LIMIT', severity: 'error', message, details }),
      );
      expect(failure.category).toBe('resource-limit');
      expect(failure.limit).toStrictEqual({ kind: 'capacity', ...limit, operation: 'ingestSubject', retry: null });
      expect(failure.suggestion).toBe(
        `Not decided: ingestSubject needs more than ${limit.name} (${limit.declared} ${limit.unit}; this subject ${limit.measured}). No \`test_model\` argument raises it; keep the model and assertion as designed and report the claim as not decided.`,
      );
    });

    it('should fall back to the limit class for a refusal whose message names no evidence', () => {
      const failure = projected(
        claimRefusal(
          {
            code: 'GEOSPEC_ANALYSIS_LIMIT',
            severity: 'error',
            message: 'Refused.',
            details: { limitClass: 'analysis', unit: 'mesh entries', limit: 256 },
          },
          'toBeWatertight',
        ),
      );
      expect(failure.limit).toMatchObject({ name: 'analysisMeshEntries', declared: 256 });
      expect(failure.limit).not.toHaveProperty('measured');
      expect(failure.suggestion).toMatch(
        /^Not decided: toBeWatertight needs more than analysisMeshEntries \(256 mesh entries\)\. /u,
      );
    });

    it('should leave a refusal without a unit untyped and name the operation from the matcher kind', () => {
      const untyped = projected(
        refused({ code: 'GEOSPEC_ANALYSIS_LIMIT', severity: 'error', message: 'x', details: { limit: 1 } }),
      );
      expect(untyped).not.toHaveProperty('limit');
      const typed = projected(
        refused({
          code: 'GEOSPEC_ANALYSIS_LIMIT',
          severity: 'error',
          message: 'Material exact scratch needs 1.3 MiB (1327776 bytes); the analysis limit is 64 KiB (65536 bytes).',
          details: { limit: 65_536, required: 1_327_776, unit: 'bytes', limitClass: 'analysis' },
        }),
      );
      expect(typed.limit).toMatchObject({ name: 'materialExactScratchBytes', operation: 'connectedComponents' });
      const unnamed = projected(
        refused({
          code: 'GEOSPEC_ANALYSIS_LIMIT',
          severity: 'error',
          message: '',
          details: { unit: 'bytes', limitClass: 7 },
        }),
      );
      expect(unnamed.limit).toMatchObject({ name: 'engineBytes' });
      expect(unnamed.suggestion).toMatch(/^Not decided: connectedComponents needs more than engineBytes\. /u);
    });

    it.each([
      {
        budget: 'below the host maximum',
        details: { limit: 8_000_000, used: 8_000_001, maximumLimit: 512_000_000 },
        retry: { parameter: 'workUnitLimit', value: 512_000_000 },
        next: 'Raise workUnitLimit to 512000000 where this claim',
      },
      {
        budget: 'at the host maximum',
        details: { limit: 512_000_000, maximumLimit: 512_000_000 },
        retry: null,
        next: 'needs more work units than this host allows (512000000 work units).',
      },
      {
        budget: 'used beyond the host maximum',
        details: { limit: 8_000_000, used: 600_000_000, maximumLimit: 512_000_000 },
        retry: null,
        next: 'needs more work units than this host allows (8000000 work units; used 600000000).',
      },
    ])('should type a work-budget refusal $budget with its one honest retry', ({ details, retry, next }) => {
      const failure = projected(
        claimRefusal(
          { code: 'MATCHER_TIMEOUT', severity: 'error', message: 'The claim exhausted its work budget.', details },
          'toHaveConnectedComponents',
        ),
      );
      expect(failure).toMatchObject({
        category: 'work-budget',
        limit: {
          kind: 'budget',
          name: 'workUnitLimit',
          declared: details.limit,
          unit: 'work-units',
          operation: 'toHaveConnectedComponents',
          subject: 'load-1',
          retry,
          source: 'engine',
        },
      });
      expect(failure.limit?.measured).toBe(details.used);
      expect(failure.suggestion).toContain(next);
      expect(failure.suggestion.includes('Raise workUnitLimit')).toBe(retry !== null);
    });

    it.each([undefined, { limit: 8_000_000 }, { maximumLimit: 512_000_000 }])(
      'should keep the generic budget advice when the refusal does not report its budget and maximum (%o)',
      (details) => {
        const failure = projected(
          refused({
            code: 'MATCHER_TIMEOUT',
            severity: 'error',
            message: 'Exhausted.',
            ...(details === undefined ? {} : { details }),
          }),
        );
        expect(failure).not.toHaveProperty('limit');
        expect(failure.suggestion).toContain('test_model workUnitLimit');
      },
    );

    it('should type only the limit rows, from the first diagnostic of their category', () => {
      const geometry = projected(
        refused(
          {
            code: 'GEOSPEC_CONNECTED_COMPONENTS_MISMATCH',
            severity: 'error',
            message: 'Expected 1 component, found 3.',
            details: { limit: 1, unit: 'bytes' },
          },
          'failed',
        ),
      );
      expect(geometry).not.toHaveProperty('limit');
      const test = admissionRefusal({
        code: 'GEOSPEC_RESOURCE_LIMIT',
        severity: 'error',
        message: 'Untyped admission refusal.',
      });
      const failure = projected({
        ...test,
        diagnostics: [
          ...test.diagnostics,
          {
            code: 'limit-exceeded',
            severity: 'error',
            message: 'The decoded mesh has 9 vertices; the configured vertex limit is 8 vertices.',
            details: { limitClass: 'admission', unit: 'vertices', limit: 8, required: 9 },
          },
        ],
      });
      expect(failure.limit).toMatchObject({ name: 'maxVertices', declared: 8, measured: 9 });
    });

    it('should read an engine refusal inside a claim as an infrastructure failure, not a limit', () => {
      // The collector records a refusal thrown after admission like any exception inside a claim: on the claim and,
      // by the same diagnostic, on the test.
      const message = 'GeoSpec engine handles are exhausted.';
      const diagnostic: GeometryDiagnostic = {
        code: 'TEST_FAILED',
        severity: 'error',
        message,
        details: { name: 'ProtocolError', message },
      };
      const failure = projected({
        suite: ['knot'],
        name: 'is watertight',
        status: 'failed',
        assertions: [
          {
            kind: 'watertight',
            subject: {},
            expected: true,
            passed: false,
            loadId: 'load-1',
            diagnostics: [diagnostic],
          },
        ],
        diagnostics: [diagnostic],
      });
      expect(failure.category).toBe('infrastructure');
      expect(failure.reason).toContain(message);
      expect(failure).not.toHaveProperty('limit');
      expect(failure.suggestion).toMatch(/^This is not a geometry verdict\./u);
      expect(failure.suggestion).not.toMatch(/not decided/iu);
    });
  });

  it('should answer a whole-model claim on a region crop with its scope refusal, not a BRep or limit hint', () => {
    const suggestion =
      'Keep the claim and make it on a whole-model load (loadModel without region). If the whole model exceeds a host limit, report the claim as not decided at this capacity. A region load answers only bounding box, volume, surface area, mass and center of mass of that region.';
    const failure = failureOf(
      refused({
        code: 'GEOSPEC_REGION_WHOLE_MODEL_CLAIM',
        severity: 'error',
        message:
          "A 'connectedComponents' claim is about the whole model, and this subject is cropped to the region min [0, 0, 0] max [5, 5, 5] mm, so the claim cannot be decided on it.",
        suggestion,
      }),
    );
    expect(failure).toMatchObject({ category: 'unsupported-evidence', suggestion });
    expect(failure.suggestion).not.toMatch(/workUnitLimit|brep|step/iu);
  });

  it('should read the shared evidence code as an evidence gap even when its message names a limit', () => {
    const failure = failureOf(
      refused({
        code: 'GEOSPEC_UNSUPPORTED_EVIDENCE',
        severity: 'error',
        message: 'Material exact scratch exceeds the declared analysis byte limit.',
      }),
    );
    expect(failure.category).toBe('unsupported-evidence');
  });

  it('should read a typed admission refusal as a resource limit', () => {
    const failure = failureOf(
      refused({
        code: 'limit-exceeded',
        severity: 'error',
        message:
          'Primary geometry needs 80.0 MiB (83886080 bytes); the configured binary subject limit is 64.0 MiB (67108864 bytes).',
      }),
    );
    expect(failure.category).toBe('resource-limit');
  });

  it('should keep a decided geometry failure as geometry and its own repair suggestion', () => {
    const failure = failureOf(
      refused(
        {
          code: 'GEOSPEC_CONNECTED_COMPONENTS_MISMATCH',
          severity: 'error',
          message: 'Expected 1 component, found 3.',
          suggestion: "Join 'Canopy' to 'Socket' at the nearest gap.",
        },
        'failed',
      ),
    );
    expect(failure).toMatchObject({
      category: 'geometry',
      suggestion: "Join 'Canopy' to 'Socket' at the nearest gap.",
    });
  });

  it('should never pass through a suggestion that asks to weaken the assertion', () => {
    const failure = failureOf(
      refused(
        {
          code: 'GEOSPEC_CONNECTED_COMPONENTS_MISMATCH',
          severity: 'error',
          message: 'Expected 1 component, found 3.',
          suggestion: 'Inspect the GeoSpec diagnostics and update the model or expected geometry assertion.',
        },
        'failed',
      ),
    );
    expect(failure.suggestion).not.toMatch(weakening);
    expect(failure.suggestion).toContain('Keep the assertion');
  });

  describe('evidence refusals', () => {
    const brepRefusal = refused({
      code: 'GEOSPEC_UNSUPPORTED_EVIDENCE',
      severity: 'error',
      message: 'toHaveAssemblyOccurrences() needs exact BRep evidence; the subject is a mesh.',
      suggestion: "Load the model as STEP: loadModel({ file, format: 'step' }).",
    });

    it('should say the matcher is unsupported on a kernel without a STEP route and name the mesh matchers', () => {
      const failure = failureOf(brepRefusal, new Map([['main.ts', { kernelId: 'picovoxel', directBrepStep: false }]]));
      expect(failure.category).toBe('unsupported-evidence');
      expect(failure.suggestion).toContain("kernel 'picovoxel'");
      expect(failure.suggestion).toContain('unsupported on this kernel');
      expect(failure.suggestion).toContain('toHaveConnectedComponents');
      expect(failure.suggestion).not.toMatch(/format: 'step'|as step/iu);
    });

    it('should keep the STEP route for a kernel that has one', () => {
      const failure = failureOf(brepRefusal, new Map([['main.ts', { kernelId: 'replicad', directBrepStep: true }]]));
      expect(failure.suggestion).toBe("Load the model as STEP: loadModel({ file, format: 'step' }).");
    });

    it('should qualify the STEP route with the mesh-only alternative when the kernel is unknown', () => {
      const failure = failureOf(brepRefusal);
      expect(failure.suggestion).toContain("format: 'step'");
      expect(failure.suggestion).toContain('mesh-only kernel this matcher is unsupported');
    });
  });
});
