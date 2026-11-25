import { describe, expectTypeOf, it } from 'vitest';
import type { BuildReport, TessellationReport } from '@taucad/runtime/types';
import type { EvaluateModelOutput } from '#schemas/tools/evaluate-model.tool.schema.js';

/* The evaluate_model result is validated against this contract, so a report field
 * the runtime adds and the schema lacks is stripped before the agent reads it. */
describe('tessellation report contract', () => {
  it('should mirror every field the runtime tessellation report carries', () => {
    expectTypeOf<NonNullable<EvaluateModelOutput['tessellation']>>().toEqualTypeOf<{
      -readonly [Key in keyof TessellationReport]: TessellationReport[Key];
    }>();
  });
});

describe('build report contract', () => {
  it('should mirror every field the runtime build report carries and accept it as it is', () => {
    expectTypeOf<keyof NonNullable<EvaluateModelOutput['build']>>().toEqualTypeOf<keyof BuildReport>();
    expectTypeOf<BuildReport>().toExtend<NonNullable<EvaluateModelOutput['build']>>();
  });
});
