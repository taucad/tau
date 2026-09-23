import { describe, expect, it } from 'vitest';
import { admitJsonSchema } from '#schema-admission.js';

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
