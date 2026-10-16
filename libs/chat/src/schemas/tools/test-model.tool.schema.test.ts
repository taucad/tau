import { describe, expect, it } from 'vitest';
import { geoSpecDefaultMaxRunBudget, geoSpecDefaultMaxWorkUnitLimit } from '#constants/rpc.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
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
  it('should tell the agent that only geometry failures are decided claims and how a timeout reads', () => {
    expect(toolDescriptions.test_model).toContain("category: 'geometry'");
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
});
