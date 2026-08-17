import { describe, it, expect } from 'vitest';
import { toJsonSchema } from '#to-json-schema/to-json-schema.js';

describe('toJsonSchema', () => {
  it('should return a valid JSON schema', () => {
    const schema = toJsonSchema({ name: 'John', age: 30 });
    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    });
  });
});
