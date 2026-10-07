import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { GeoSpecTestCase } from 'geospec/runner';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
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
          reason: 'GeoSpec test failed.',
          suggestion: 'Inspect the GeoSpec diagnostics and update the model or expected geometry assertion.',
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
        },
      ],
    });
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
