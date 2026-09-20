import { describe, expect, it } from 'vitest';
import { jsonSchemaFromJson } from '#schema.utils.js';

describe('jsonSchemaFromJson', () => {
  it('should declare a whole-number default as number', async () => {
    const schema = await jsonSchemaFromJson({ clearance: 0, teeth: 10 });

    expect(schema.properties).toMatchObject({
      clearance: { type: 'number', default: 0 },
      teeth: { type: 'number', default: 10 },
    });
  });
});
