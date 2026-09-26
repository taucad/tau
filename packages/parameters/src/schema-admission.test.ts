import { describe, expect, it } from 'vitest';
import { admitJsonSchema, validateJsonSchemaValue } from '#schema-admission.js';

describe('admitJsonSchema', () => {
  it('should name the offending key when a schema is not canonical JSON', () => {
    expect(() => {
      admitJsonSchema({ type: 'object', properties: {}, required: undefined });
    }).toThrow(/^INVALID_SCHEMA at \/: .*\$\.required: undefined values are not supported/u);
  });

  it('should refuse a non-enumerable own key rather than silently ignoring it', () => {
    const schema = Object.defineProperty({ type: 'object' }, '~standard', { value: {}, enumerable: false });

    expect(() => {
      admitJsonSchema(schema);
    }).toThrow(/^INVALID_SCHEMA at \/: .*enumerable string properties/u);
  });
});

describe('validateJsonSchemaValue', () => {
  it('should validate in the dialect the document declares', () => {
    const capped = (dialect: string, definitions: '$defs' | 'definitions') => ({
      $schema: dialect,
      $ref: `#/${definitions}/count`,
      maximum: 5,
      [definitions]: { count: { type: 'number' } },
    });

    // 2020-12 applies keywords beside $ref; Draft-07 ignores them.
    expect(validateJsonSchemaValue(capped('https://json-schema.org/draft/2020-12/schema', '$defs'), 10)).toBe(false);
    expect(validateJsonSchemaValue(capped('http://json-schema.org/draft-07/schema#', 'definitions'), 10)).toBe(true);
  });
});
