import { describe, expect, it } from 'vitest';
import { geoSpecDefaultMaxRunBudget, geoSpecDefaultMaxWorkUnitLimit } from '#constants/rpc.constants.js';
import { testModelStatusRule, toolDescriptions } from '#constants/tool-description.constants.js';
import {
  geoSpecFailureCategorySchema,
  geoSpecRunLineageSchema,
  geoSpecRunFilterInputSchema,
  testModelOutputSchema,
} from '#schemas/tools/test-model.tool.schema.js';

const timedOut = {
  failures: [
    {
      id: 'GEOSPEC_RUN_TIMEOUT',
      requirement: 'The GeoSpec run must finish within its run budget',
      reason: 'GeoSpec run exceeded its 180000 ms browser run budget.',
      suggestion: 'Re-run the unfinished requirements.',
      category: 'timeout',
      targetFile: 'main.geospec.ts',
    },
  ],
  passes: [{ id: 'main.geospec.ts:bounds', requirement: 'bounds', targetFile: 'main.geospec.ts' }],
  passed: 1,
  total: 2,
  runStatus: 'inconclusive',
  timeout: {
    errorCode: 'OPERATION_TIMEOUT',
    code: 'GEOSPEC_RUN_TIMEOUT',
    budget: 180_000,
    elapsed: 180_004,
    phase: 'running',
    file: 'main.geospec.ts',
    requirement: 'shade > is one piece',
  },
};

describe('testModelOutputSchema', () => {
  it('should carry a run timeout with its budget, elapsed time and the requirement in flight', () => {
    expect(testModelOutputSchema.parse(timedOut)).toStrictEqual(timedOut);
  });

  it('should name the absolute project root its files resolved against', () => {
    expect(testModelOutputSchema.parse({ ...timedOut, projectRoot: '/work/gear' })).toStrictEqual({
      ...timedOut,
      projectRoot: '/work/gear',
    });
    expect(testModelOutputSchema.safeParse({ ...timedOut, projectRoot: '' }).success).toBe(false);
  });

  it('should refuse a timeout that is not the operation-timeout code', () => {
    expect(
      testModelOutputSchema.safeParse({ ...timedOut, timeout: { ...timedOut.timeout, errorCode: 'UNKNOWN' } }).success,
    ).toBe(false);
  });

  it('should refuse a failure category outside the refusal vocabulary', () => {
    const [failure] = timedOut.failures;
    expect(
      testModelOutputSchema.safeParse({ ...timedOut, failures: [{ ...failure, category: 'weaken' }] }).success,
    ).toBe(false);
  });

  it.each(['analysis-limit', 'resource-limit', 'work-budget', 'unsupported-evidence'])(
    'should name the %s refusal cause',
    (category) => {
      expect(geoSpecFailureCategorySchema.parse(category)).toBe(category);
    },
  );
});

describe('testModelOutputSchema limit', () => {
  const limit = {
    kind: 'capacity',
    name: 'continuousEvidenceBytes',
    declared: 33_554_432,
    measured: 37_290_112,
    unit: 'bytes',
    operation: 'toHaveNoComponentInterference',
    subject: 'run:load:5',
    retry: null,
    source: 'engine',
  };
  const limited = {
    failures: [
      {
        id: 'main.geospec.ts:interference',
        requirement: 'interference',
        reason: 'Continuous evidence needs 35.6 MiB (37290112 bytes); the analysis limit is 32 MiB (33554432 bytes).',
        suggestion: 'Not decided: toHaveNoComponentInterference needs more than continuousEvidenceBytes.',
        category: 'analysis-limit',
        limit,
        targetFile: 'main.geospec.ts',
      },
    ],
    passes: [],
    passed: 0,
    total: 1,
    runStatus: 'inconclusive',
    tests: [
      {
        id: 'main.geospec.ts:0',
        requirement: 'interference',
        targetFile: 'main.geospec.ts',
        status: 'inconclusive',
        ordinal: 0,
        limit,
      },
    ],
  };
  const withLimit = (change: Record<string, unknown>) => ({
    ...limited,
    failures: [{ ...limited.failures[0], limit: { ...limit, ...change } }],
  });

  it('should carry a typed limit on the failure and test rows', () => {
    expect(testModelOutputSchema.parse(limited)).toStrictEqual(limited);
  });

  it('should carry a work budget with its retry and an admission limit without a subject', () => {
    const budget = withLimit({
      kind: 'budget',
      name: 'workUnitLimit',
      unit: 'work-units',
      retry: { parameter: 'workUnitLimit', value: 512_000_000 },
    });
    expect(testModelOutputSchema.parse(budget)).toStrictEqual(budget);
    const { subject: _subject, ...admission } = { ...limit, name: 'maxSubjectBytes', operation: 'ingestSubject' };
    const admitted = { ...limited, failures: [{ ...limited.failures[0], limit: { ...admission, source: 'host' } }] };
    expect(testModelOutputSchema.parse(admitted)).toStrictEqual(admitted);
  });

  it.each([
    { kind: 'unsupported' },
    { retry: { parameter: 'testTimeout', value: 1 } },
    { retry: { parameter: 'workUnitLimit', value: 0 } },
    { declared: -1 },
    { measured: 1.5 },
    { source: 'kernel' },
    { unit: undefined },
    { extra: true },
  ])('should refuse a limit outside its contract (%o)', (change) => {
    expect(testModelOutputSchema.safeParse(withLimit(change)).success).toBe(false);
  });
});

describe('testModelOutputSchema per-assertion rows', () => {
  const output = {
    passed: 0,
    total: 1,
    passes: [],
    failures: [
      {
        id: 'main.geospec.ts:gears',
        requirement: 'gears',
        reason: 'Continuous evidence needs 35.6 MiB; the analysis limit is 32 MiB.',
        suggestion: 'Not decided.',
        status: 'inconclusive',
        category: 'analysis-limit',
        targetFile: 'main.geospec.ts',
      },
    ],
    tests: [
      {
        id: 'main.geospec.ts:0',
        requirement: 'gears',
        targetFile: 'main.geospec.ts',
        status: 'inconclusive',
        assertions: [
          { ordinal: 0, status: 'passed', matcher: 'boundingBox' },
          {
            ordinal: 1,
            status: 'inconclusive',
            matcher: 'componentInterference',
            code: 'GEOSPEC_ANALYSIS_LIMIT',
            message: 'Continuous evidence needs 35.6 MiB; the analysis limit is 32 MiB.',
          },
        ],
      },
    ],
  };

  it('should carry the requirement status and one row per claim', () => {
    expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
  });

  it.each([{ status: 'skipped' }, { status: 'not-run' }, { extra: true }])(
    'should refuse an assertion row outside its contract (%o)',
    (change) => {
      const [test] = output.tests;
      const changed = { ...output, tests: [{ ...test, assertions: [{ ...test?.assertions[0], ...change }] }] };
      expect(testModelOutputSchema.safeParse(changed).success).toBe(false);
    },
  );
});

describe('geoSpecRunFilterInputSchema testTimeout', () => {
  it('should leave the maximum to host policy and keep only finite positive integers', () => {
    expect(geoSpecRunFilterInputSchema.safeParse({ testTimeout: geoSpecDefaultMaxRunBudget + 1 }).success).toBe(true);
    for (const testTimeout of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(geoSpecRunFilterInputSchema.safeParse({ testTimeout }).success).toBe(false);
    }
    expect(geoSpecRunFilterInputSchema.shape.testTimeout.description).toContain(String(geoSpecDefaultMaxRunBudget));
  });

  it('should describe the per-test timeout separately from the run budget', () => {
    const description = geoSpecRunFilterInputSchema.shape.testTimeout.description ?? '';
    expect(description).toContain('GEOSPEC_TEST_TIMEOUT');
    expect(description).toContain('does not shorten the run');
    expect(description).not.toContain('Equivalent to CLI');
  });
});

describe('geoSpecRunFilterInputSchema workUnitLimit', () => {
  it('should accept budgets above the default maximum for the host to judge, and refuse non-integers', () => {
    expect(geoSpecRunFilterInputSchema.safeParse({ workUnitLimit: geoSpecDefaultMaxWorkUnitLimit + 1 }).success).toBe(
      true,
    );
    for (const workUnitLimit of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(geoSpecRunFilterInputSchema.safeParse({ workUnitLimit }).success).toBe(false);
    }
  });

  it('should point a work-budget refusal at this option', () => {
    expect(geoSpecRunFilterInputSchema.shape.workUnitLimit.description).toContain('work-budget');
  });
});

describe('test_model description', () => {
  it('should tell the agent that only a failed geometry row is a decided claim and how a timeout reads', () => {
    expect(toolDescriptions.test_model).toContain(testModelStatusRule);
    expect(testModelStatusRule).toContain('only category geometry is a claim decided false');
    expect(toolDescriptions.test_model).toContain('OPERATION_TIMEOUT');
  });
});

describe('geoSpecRunLineageSchema load evidence', () => {
  it('should carry a load budget, reuse and region crop', () => {
    const lineage = {
      status: 'complete',
      modules: [],
      loads: [
        {
          loadId: 'run:load:1',
          status: 'complete',
          evidence: {
            loadId: 'run:load:1',
            status: 'complete',
            format: 'glb',
            parameters: {},
            ingestOptions: {},
            workUnitLimit: 16_000_000,
            reused: true,
            region: { min: [0, 0, 0], max: [1, 2, 3] },
            artifacts: [],
          },
        },
      ],
    };
    expect(geoSpecRunLineageSchema.parse(lineage)).toEqual(lineage);
  });

  it('should carry the folder a load resolved its paths in', () => {
    const lineage = {
      status: 'complete',
      modules: [],
      loads: [
        {
          loadId: 'run:load:1',
          status: 'complete',
          evidence: {
            loadId: 'run:load:1',
            status: 'complete',
            format: 'step',
            parameters: {},
            ingestOptions: {},
            sourcePath: 'parts/gear/main.ts',
            rootDir: 'parts/gear',
            artifacts: [],
          },
        },
      ],
    };

    expect(geoSpecRunLineageSchema.parse(lineage)).toEqual(lineage);
  });
});
