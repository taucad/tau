import { describe, expectTypeOf, it } from 'vitest';
import type { JSONSchema7, JSONSchema7Definition, JSONSchema7Type, JSONSchema7TypeName } from '@taucad/json-schema';

describe('@taucad/json-schema public surface', () => {
  it('should re-export JSONSchema7 with object structure', () => {
    expectTypeOf<JSONSchema7>().toExtend<{ type?: unknown }>();
  });

  it('should re-export JSONSchema7Definition that includes JSONSchema7', () => {
    expectTypeOf<JSONSchema7>().toExtend<JSONSchema7Definition>();
  });

  it('should re-export JSONSchema7Type as a non-trivial type', () => {
    expectTypeOf<string>().toExtend<JSONSchema7Type>();
  });

  it('should re-export JSONSchema7TypeName as a string-literal union', () => {
    expectTypeOf<JSONSchema7TypeName>().toExtend<string>();
  });
});
