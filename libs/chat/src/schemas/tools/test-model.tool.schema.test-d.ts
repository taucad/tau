import { describe, it, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { TestModelInput, testModelInputSchema } from '#schemas/tools/test-model.tool.schema.js';

describe('TestModelInput public type', () => {
  it('should equal the schema input (wire) type, not the parsed output', () => {
    expectTypeOf<TestModelInput>().toEqualTypeOf<z.input<typeof testModelInputSchema>>();
  });

  it('should accept a minimal wire object', () => {
    expectTypeOf<{ files: ['main.geospec.ts'] }>().toExtend<TestModelInput>();
  });
});
