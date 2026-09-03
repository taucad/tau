import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';

describe('TAU_cad_topology schema', () => {
  it('ships a versioned JSON Schema and matching contract fixture', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../schema/tau-cad-topology.schema.json', import.meta.url), 'utf8'),
    ) as {
      readonly $schema: string;
      readonly properties: { readonly schemaVersion: { readonly const: number } };
      readonly required: readonly string[];
    };
    const fixture: unknown = JSON.parse(
      readFileSync(new URL('../../schema/tau-cad-topology.v1.fixture.json', import.meta.url), 'utf8'),
    );
    const invalid: unknown = JSON.parse(
      readFileSync(new URL('../../schema/tau-cad-topology.v1.invalid.fixture.json', import.meta.url), 'utf8'),
    );
    const validate = new Ajv2020({ strict: true }).compile(schema);

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties.schemaVersion.const).toBe(1);
    expect(schema.required).toEqual(['schemaVersion', 'components']);
    expect(validate(fixture)).toBe(true);
    expect(validate(invalid)).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ instancePath: '/components/0/faceGroups/0/count' })]),
    );
  });
});
