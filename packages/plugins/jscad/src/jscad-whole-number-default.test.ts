import { describe, expect, it } from 'vitest';
import { convertParameterDefinitionsToJsonSchema } from '#jscad-json-schema.utils.js';

describe('convertParameterDefinitionsToJsonSchema', () => {
  it('should declare an untyped whole-number default as number', () => {
    const schema = convertParameterDefinitionsToJsonSchema([
      { name: 'clearance', initial: 0 },
      { name: 'teeth', initial: 10 },
    ]);

    expect(schema.properties).toMatchObject({
      clearance: { type: 'number', default: 0 },
      teeth: { type: 'number', default: 10 },
    });
  });

  it('should preserve an explicitly declared integer', () => {
    const schema = convertParameterDefinitionsToJsonSchema([{ name: 'teeth', type: 'int', initial: 10 }]);

    expect(schema.properties?.['teeth']).toMatchObject({ type: 'integer', default: 10 });
  });
});
