import { describe, expect, it } from 'vitest';
import { projectDraft7SchemaToParameterDeclaration } from '#json-schema-adapter.js';
import { ParameterAdmissionError } from '#manifest.js';

const identity = {
  schemaId: 'urn:test:producer:parameters:v1',
  schemaName: 'ProducerParameters',
} as const;

describe('Draft-7 parameter declaration adapter', () => {
  it('should omit empty schema maps so parameterless producers remain valid', () => {
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: {},
      schema: { type: 'object', properties: {}, definitions: {}, additionalProperties: false },
    });

    expect(declaration.defaults).toEqual({});
    expect(declaration.schema).not.toHaveProperty('properties');
    expect(declaration.schema).not.toHaveProperty('definitions');
  });

  it('should preserve admitted scalar, nested, array, reference, default, and quantity declarations', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        dimensions: {
          type: 'object',
          properties: {
            length: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              multipleOf: 0.5,
              default: 10,
              'x-tau-unit': 'mm',
              'x-tau-symbol': 'millimetres',
              'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
              'x-tau-space': 'linear',
            },
          },
        },
        samples: {
          type: 'array',
          minItems: 1,
          items: { type: 'number' },
        },
        duration: { type: 'number', 'x-ogc-unit': 's', 'x-ogc-unitLang': 'UCUM' },
        count: { $ref: '#/definitions/count' },
      },
      definitions: {
        count: { type: 'integer', minimum: 1, maximum: 10 },
      },
    } as const;
    const defaults = { dimensions: { length: 10 }, samples: [1], duration: 1, count: 2 };

    const declaration = projectDraft7SchemaToParameterDeclaration({ schema, defaults, ...identity });

    expect(declaration).toMatchObject({
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: identity.schemaId,
        $uses: ['JSONSchemaUnits'],
        name: identity.schemaName,
        type: 'object',
        properties: {
          dimensions: {
            properties: {
              length: {
                type: 'double',
                minimum: 0,
                maximum: 100,
                multipleOf: 0.5,
                default: 10,
                ucumUnit: 'mm',
                symbol: 'millimetres',
              },
            },
          },
          samples: { type: 'array', minItems: 1, items: { type: 'double' } },
          duration: { type: 'double', ucumUnit: 's' },
          count: { type: { $ref: '#/definitions/count' } },
        },
        definitions: { count: { type: 'integer', minimum: 1, maximum: 10 } },
      },
      defaults,
      bindings: {
        '/dimensions/length': {
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
        },
      },
    });
  });

  it('should preserve point reference bindings and equivalent Tau and OGC unit declarations', () => {
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: { temperature: 20 },
      schema: {
        type: 'object',
        properties: {
          temperature: {
            type: 'number',
            'x-tau-unit': 'Cel',
            'x-ogc-unit': 'Cel',
            'x-ogc-unitLang': 'UCUM',
            'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Temperature',
            'x-tau-space': 'point',
            'x-tau-reference': 'urn:taucad:reference:thermodynamic-absolute-zero',
          },
        },
      },
    });

    expect(declaration.schema['properties']).toMatchObject({ temperature: { ucumUnit: 'Cel' } });
    expect(declaration.bindings).toEqual({
      '/temperature': {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Temperature',
        space: 'point',
        reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
      },
    });
  });

  it('should retain referenced quantity semantics at the referencing instance pointer', () => {
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: { value: 2 },
      schema: {
        type: 'object',
        properties: { value: { $ref: '#/definitions/length' } },
        definitions: {
          length: {
            type: 'number',
            'x-tau-unit': 'mm',
            'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
            'x-tau-space': 'linear',
          },
        },
      },
    });

    expect(declaration.bindings).toEqual({
      '/value': { quantityKind: 'http://qudt.org/vocab/quantitykind/Length', space: 'linear' },
    });
  });

  it('should reject every reference sibling independent of key order or semantics', () => {
    const reference = '#/definitions/value';
    for (const value of [
      { $ref: reference, type: 'number' },
      { type: 'number', $ref: reference },
      { $ref: reference, type: 'number', 'x-tau-unit': 'cm' },
    ]) {
      expect(() =>
        projectDraft7SchemaToParameterDeclaration({
          ...identity,
          defaults: { value: 2 },
          schema: {
            type: 'object',
            properties: { value },
            definitions: { value: { type: 'number', 'x-tau-unit': 'mm' } },
          },
        }),
      ).toThrow('NATIVE_PROJECTION_UNSUPPORTED: reference siblings');
    }
  });

  it('should reject percent-encoded bundled references before native reference identity can change', () => {
    const temperature = {
      type: 'number',
      'x-tau-unit': 'Cel',
      'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/ThermodynamicTemperature',
      'x-tau-space': 'point',
      'x-tau-reference': 'urn:taucad:reference:thermodynamic-absolute-zero',
    } as const;
    for (const schema of [
      {
        type: 'object',
        properties: { value: { $ref: '#/definitions/temperature%20value' } },
        definitions: { 'temperature value': temperature },
      },
      {
        type: 'object',
        properties: {
          a: { $ref: '#/definitions/value' },
          b: { $ref: '#/definitions/val%75e' },
        },
        definitions: {
          value: temperature,
          'val%75e': {
            type: 'number',
            'x-tau-unit': 'mm',
            'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
            'x-tau-space': 'linear',
          },
        },
      },
    ]) {
      expect(() => projectDraft7SchemaToParameterDeclaration({ ...identity, defaults: {}, schema })).toThrow(
        'NATIVE_PROJECTION_UNSUPPORTED: percent-encoded bundled reference',
      );
    }
  });

  it('should project homogeneous array semantics to an exact binding template', () => {
    const length = {
      type: 'number',
      'x-tau-unit': 'mm',
      'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
      'x-tau-space': 'linear',
    } as const;
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: { values: [1, 2] },
      schema: { type: 'object', properties: { values: { type: 'array', items: length } } },
    });

    expect(declaration.schema).toMatchObject({
      properties: { values: { items: { type: 'double', ucumUnit: 'mm' } } },
    });
    expect(declaration.bindings).toEqual({
      '/values/*': {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        space: 'linear',
      },
    });
  });

  it('should preserve compatible semantics repeated across union branches', () => {
    const length = {
      type: 'number',
      minimum: 0,
      'x-tau-unit': 'mm',
      'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
      'x-tau-space': 'linear',
    } as const;
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: { mode: 'a', value: 1 },
      schema: {
        anyOf: [
          { type: 'object', properties: { mode: { type: 'string', const: 'a' }, value: length }, required: ['mode'] },
          { type: 'object', properties: { mode: { type: 'string', const: 'b' }, value: length }, required: ['mode'] },
        ],
      },
    });

    expect(declaration.bindings).toEqual({
      '/value': {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        space: 'linear',
      },
    });
  });

  it('should reject semantics without an exact native instance pointer', () => {
    const length = {
      type: 'number',
      'x-tau-unit': 'mm',
      'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
      'x-tau-space': 'linear',
    } as const;
    for (const schema of [{ type: 'object', definitions: { unused: length } }]) {
      expect(() => projectDraft7SchemaToParameterDeclaration({ ...identity, defaults: {}, schema })).toThrow(
        'NATIVE_PROJECTION_UNSUPPORTED',
      );
    }
  });

  it('should preserve object-valued schema payloads without interpreting their keys', () => {
    const literal = { type: 'number', 'x-tau-unit': 'literal', nested: { type: 'integer' } };
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: {},
      schema: {
        type: 'object',
        default: structuredClone(literal),
        enum: [structuredClone(literal)],
        const: structuredClone(literal),
        examples: [structuredClone(literal)],
      },
    });

    expect(declaration.schema).toMatchObject({
      default: literal,
      enum: [literal],
      const: literal,
      examples: [literal],
    });
  });

  it('should reject invalid, conflicting, and unsupported Draft-7 declarations', () => {
    expect(() =>
      projectDraft7SchemaToParameterDeclaration({
        ...identity,
        defaults: {},
        schema: { type: 'number', 'x-ogc-unit': 'mm', 'x-ogc-unitLang': 'ucum' },
      }),
    ).toThrow('INVALID_QUANTITY');
    expect(() =>
      projectDraft7SchemaToParameterDeclaration({
        ...identity,
        defaults: {},
        schema: {
          type: 'number',
          'x-tau-unit': 'mm',
          'x-ogc-unit': 'cm',
          'x-ogc-unitLang': 'UCUM',
        },
      }),
    ).toThrow(/^METADATA_CONFLICT at \/x-ogc-unit: conflicting Tau and OGC unit annotations/u);
    expect(() =>
      projectDraft7SchemaToParameterDeclaration({
        ...identity,
        defaults: {},
        schema: { type: 'object', dependencies: { mode: { properties: { value: { type: 'number' } } } } },
      }),
    ).toThrow('schema-valued Draft-7 dependencies');
    expect(() =>
      projectDraft7SchemaToParameterDeclaration({
        ...identity,
        defaults: {},
        schema: { type: 'object', if: { properties: { mode: { const: 'strict' } } } },
      }),
    ).toThrow('INVALID_SCHEMA');
  });

  it('should not mutate producer schema or defaults', () => {
    const schema = { type: 'object', properties: { length: { type: 'number', 'x-tau-unit': 'mm' } } } as const;
    const defaults = { length: 2 };
    const schemaBefore = structuredClone(schema);
    const defaultsBefore = structuredClone(defaults);

    const declaration = projectDraft7SchemaToParameterDeclaration({ schema, defaults, ...identity });

    expect(schema).toEqual(schemaBefore);
    expect(defaults).toEqual(defaultsBefore);
    expect(declaration.schema).not.toBe(schema);
    expect(declaration.defaults).not.toBe(defaults);
  });
});

// Conformance corpus for the OGC profile of JSON Schema 2020-12. The fixtures are Tau's own; each test names the
// requirement or recommendation of OGC 23-058r2 it exercises.
const draft07 = 'http://json-schema.org/draft-07/schema#';
const draft202012 = 'https://json-schema.org/draft/2020-12/schema';
const lengthKind = 'http://qudt.org/vocab/quantitykind/Length';

// The refusal text: an admission message, followed by carrier diagnostics when the carrier refused.
const refusal = (schema: Readonly<Record<string, unknown>>, defaults: Readonly<Record<string, unknown>> = {}) => {
  try {
    projectDraft7SchemaToParameterDeclaration({ ...identity, defaults, schema });
  } catch (error) {
    const details = error instanceof ParameterAdmissionError ? error.diagnostics.map((item) => item.message) : [];
    return [error instanceof Error ? error.message : String(error), ...details].join('; ');
  }
  return 'admitted';
};

describe('JSON Schema dialects', () => {
  const bracket = (dialect: string, definitions: 'definitions' | '$defs') => ({
    $schema: dialect,
    type: 'object',
    properties: {
      width: { $ref: `#/${definitions}/length` },
      count: { type: 'integer', minimum: 1 },
    },
    required: ['width'],
    [definitions]: {
      length: {
        type: 'number',
        minimum: 0,
        'x-tau-unit': 'mm',
        'x-tau-quantity-kind': lengthKind,
        'x-tau-space': 'linear',
      },
    },
  });

  it('should admit a 2020-12 document into the same declaration as its Draft-07 twin (Requirement 1)', () => {
    const defaults = { width: 2, count: 1 };
    const fromDraft07 = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults,
      schema: bracket(draft07, 'definitions'),
    });
    // Requirement 1 B: an HTTP $id and an object root; the caller-owned schemaId still names the carrier.
    const from202012 = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults,
      schema: { ...bracket(draft202012, '$defs'), $id: 'https://parameters.tau.test/bracket' },
    });

    expect(from202012).toEqual(fromDraft07);
    expect(from202012.schema).toMatchObject({
      $id: identity.schemaId,
      definitions: { length: { type: 'double', ucumUnit: 'mm' } },
      properties: { width: { type: { $ref: '#/definitions/length' } } },
    });
    expect(from202012.bindings).toEqual({ '/width': { quantityKind: lengthKind, space: 'linear' } });
  });

  it('should keep an unlabelled document on Draft-07 and refuse every other dialect', () => {
    expect(refusal({ type: 'object', $defs: { length: { type: 'number' } } })).toMatch(
      /^UNSUPPORTED_KEYWORD at \/\$defs/u,
    );
    expect(refusal({ $schema: 'https://json-schema.org/draft/2019-09/schema', type: 'object' })).toMatch(
      /^UNSUPPORTED_DIALECT at \/\$schema/u,
    );
    expect(
      refusal({ $schema: draft202012, type: 'object', properties: { value: { $schema: draft07, type: 'number' } } }),
    ).toMatch(/^UNSUPPORTED_DIALECT at \/properties\/value\/\$schema: every \$schema must match the root dialect/u);
  });

  // Recommendation 1 U discourages $ref; Tau admits only local references into the dialect's own definitions keyword.
  it('should confine references to the definitions keyword of the declared dialect (Recommendation 1 U)', () => {
    expect(refusal({ ...bracket(draft202012, 'definitions') })).toMatch(/^UNSUPPORTED_KEYWORD at \/definitions/u);
    expect(
      refusal({ $schema: draft202012, type: 'object', properties: { width: { $ref: '#/definitions/length' } } }),
    ).toMatch(/^UNSUPPORTED_REFERENCE at \/properties\/width\/\$ref: only bundled #\/\$defs\/ references/u);
    expect(refusal({ type: 'object', properties: { width: { $ref: '#/$defs/length' } } })).toMatch(
      /^UNSUPPORTED_REFERENCE at \/properties\/width\/\$ref: only bundled #\/definitions\/ references/u,
    );
    expect(
      refusal({
        $schema: draft202012,
        type: 'object',
        properties: { width: { $ref: 'https://parameters.tau.test/length' } },
      }),
    ).toMatch(/^UNSUPPORTED_REFERENCE/u);
  });

  // Recommendation 1 T constrains the keyword set; 2020-12 renames or retires the Draft-07 array and dependency forms.
  it('should refuse keywords outside the admitted 2020-12 subset (Recommendation 1 T)', () => {
    for (const [property, code] of [
      [{ type: 'object', dependencies: { a: ['b'] } }, 'UNSUPPORTED_KEYWORD'],
      [{ type: 'array', additionalItems: false }, 'UNSUPPORTED_KEYWORD'],
      [{ type: 'array', prefixItems: [{ type: 'number' }] }, 'UNSUPPORTED_KEYWORD'],
      [{ type: 'object', unevaluatedProperties: false }, 'UNSUPPORTED_KEYWORD'],
      [{ type: 'array', items: [{ type: 'number' }, { type: 'number' }] }, 'INVALID_SCHEMA'],
    ] as const) {
      expect(refusal({ $schema: draft202012, type: 'object', properties: { value: property } })).toMatch(
        new RegExp(`^${code} at /properties/value/`, 'u'),
      );
    }
  });

  it('should carry 2020-12 dependentRequired into the carrier', () => {
    const declaration = projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: {},
      schema: {
        $schema: draft202012,
        type: 'object',
        properties: { depth: { type: 'number' }, width: { type: 'number' } },
        dependentRequired: { depth: ['width'] },
      },
    });

    expect(declaration.schema).toMatchObject({ dependentRequired: { depth: ['width'] } });
    expect(refusal({ $schema: draft202012, type: 'object', dependentRequired: { depth: 'width' } })).toMatch(
      /^INVALID_SCHEMA at \/dependentRequired\/depth/u,
    );
  });
});

describe('OGC numeric format widths (Recommendation 1 G–L)', () => {
  const widths = (dialect: string) =>
    projectDraft7SchemaToParameterDeclaration({
      ...identity,
      defaults: {},
      schema: {
        $schema: dialect,
        type: 'object',
        properties: {
          ratio: { type: 'number', format: 'float' },
          offset: { type: 'number', format: 'double' },
          count: { type: 'integer', format: 'int32' },
          teeth: { type: ['integer', 'null'], format: 'uint32' },
          stamp: { type: 'string', format: 'date-time' },
        },
      },
    }).schema['properties'];

  it('should carry float, double, int32 and uint32 as carrier widths in 2020-12', () => {
    expect(widths(draft202012)).toEqual({
      ratio: { type: 'float' },
      offset: { type: 'double' },
      count: { type: 'int32' },
      teeth: { type: ['uint32', 'null'] },
      stamp: { type: 'string', format: 'date-time' },
    });
  });

  it('should keep Draft-07 formats inert annotations', () => {
    expect(widths(draft07)).toEqual({
      ratio: { type: 'double', format: 'float' },
      offset: { type: 'double', format: 'double' },
      count: { type: 'integer', format: 'int32' },
      teeth: { type: ['integer', 'null'], format: 'uint32' },
      stamp: { type: 'string', format: 'date-time' },
    });
    expect(refusal({ type: 'object', properties: { value: { type: 'integer', format: 'int64' } } })).toBe('admitted');
  });

  it('should enforce the declared width on defaults', () => {
    const schema = {
      $schema: draft202012,
      type: 'object',
      properties: { count: { type: 'integer', format: 'int32' } },
    };

    expect(refusal(schema, { count: 2 ** 31 })).toContain('int32 value out of range');
    expect(refusal(schema, { count: 2 ** 31 - 1 })).toBe('admitted');
  });

  it('should refuse widths the carrier cannot represent and formats on the wrong type', () => {
    for (const property of [
      { type: 'integer', format: 'int64' },
      { type: 'integer', format: 'uint64' },
      { type: 'integer', format: 'float' },
      { type: 'number', format: 'int32' },
      { type: 'integer', format: 'int8' },
      { type: ['number', 'integer'], format: 'double' },
      { format: 'uint32' },
    ]) {
      expect(refusal({ $schema: draft202012, type: 'object', properties: { value: property } })).toMatch(
        /^UNSUPPORTED_FORMAT at \/properties\/value\/format/u,
      );
    }
  });
});

describe('OGC quantity keywords (Requirements 3, 7 and 8)', () => {
  const angleKind = 'http://qudt.org/vocab/quantitykind/PlaneAngle';
  const lengthProperty = (claims: Readonly<Record<string, unknown>>) => ({
    $schema: draft202012,
    type: 'object',
    properties: { depth: { type: 'number', ...claims } },
  });
  const project = (schema: Readonly<Record<string, unknown>>) =>
    projectDraft7SchemaToParameterDeclaration({ ...identity, defaults: {}, schema });

  // Requirement 7: UCUM is the unit language when x-ogc-unitLang is absent.
  it('should read x-ogc-unit alone as UCUM (Requirement 7)', () => {
    const alone = project(lengthProperty({ 'x-ogc-unit': 'mm' }));
    const labelled = project(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-unitLang': 'UCUM' }));

    expect(alone.schema['properties']).toEqual({ depth: { type: 'double', ucumUnit: 'mm' } });
    expect(labelled).toEqual(alone);
  });

  it('should refuse unit languages and units the Tau profile cannot map (Requirement 7)', () => {
    expect(
      refusal(lengthProperty({ 'x-ogc-unit': 'http://qudt.org/vocab/unit/MilliM', 'x-ogc-unitLang': 'QUDT' })),
    ).toMatch(/^UNSUPPORTED_UNIT_LANGUAGE at \/properties\/depth\/x-ogc-unitLang/u);
    expect(refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-unitLang': 'SI' }))).toMatch(
      /^INVALID_QUANTITY at \/properties\/depth\/x-ogc-unitLang: OGC unit language must be UCUM or QUDT/u,
    );
    expect(refusal(lengthProperty({ 'x-ogc-unitLang': 'UCUM' }))).toMatch(
      /^INVALID_QUANTITY at \/properties\/depth\/x-ogc-unitLang: OGC unit language requires an OGC unit/u,
    );
    expect(refusal(lengthProperty({ 'x-ogc-unit': 'millimetre' }))).toMatch(
      /^INVALID_QUANTITY at \/properties\/depth\/x-ogc-unit/u,
    );
  });

  // Requirement 8 names the semantic definition of a property; ruling P5 reads it as the QUDT quantity kind.
  it('should lift x-ogc-definition beside x-ogc-unit into the binding quantity kind (Requirement 8)', () => {
    const declaration = project(
      lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-definition': lengthKind, 'x-tau-space': 'linear' }),
    );

    expect(declaration.schema['properties']).toEqual({ depth: { type: 'double', ucumUnit: 'mm' } });
    expect(declaration.bindings).toEqual({ '/depth': { quantityKind: lengthKind, space: 'linear' } });
  });

  it('should accept x-tau-quantity-kind as an inbound alias and refuse a disagreeing alias', () => {
    const canonical = project(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-definition': lengthKind }));

    expect(project(lengthProperty({ 'x-tau-unit': 'mm', 'x-tau-quantity-kind': lengthKind }))).toEqual(canonical);
    expect(
      project(
        lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-definition': lengthKind, 'x-tau-quantity-kind': lengthKind }),
      ),
    ).toEqual(canonical);
    expect(
      refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-definition': lengthKind, 'x-tau-quantity-kind': angleKind })),
    ).toMatch(/^METADATA_CONFLICT at \/properties\/depth\/x-ogc-definition/u);
  });

  it('should refuse definitions that are not reviewed quantity kinds and claims without a unit (Requirement 8)', () => {
    expect(
      refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-definition': 'https://parameters.tau.test/def/depth' })),
    ).toMatch(/^UNSUPPORTED_DEFINITION at \/properties\/depth\/x-ogc-definition/u);
    expect(refusal(lengthProperty({ 'x-ogc-definition': lengthKind }))).toMatch(
      /^INVALID_QUANTITY at \/properties\/depth\/x-ogc-definition: semantic quantity fields require an admitted unit/u,
    );
  });

  // Requirement 3 reserves the x-ogc- prefix; Tau carries the unit and definition keywords and refuses the rest.
  it('should refuse x-ogc- and vendor keywords it cannot carry rather than drop them (Requirement 3)', () => {
    expect(refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-ogc-sequence': 2 }))).toMatch(
      /^UNSUPPORTED_KEYWORD at \/properties\/depth\/x-ogc-sequence/u,
    );
    expect(refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-acme-unit': 'mm' }))).toMatch(
      /^UNSUPPORTED_KEYWORD at \/properties\/depth\/x-acme-unit/u,
    );
  });

  it('should carry locale symbols into the carrier', () => {
    const symbols = { default: 'mm', 'lang:de': 'Millimeter' };

    expect(project(lengthProperty({ 'x-ogc-unit': 'mm', 'x-tau-symbols': symbols })).schema['properties']).toEqual({
      depth: { type: 'double', ucumUnit: 'mm', symbols },
    });
    expect(refusal(lengthProperty({ 'x-ogc-unit': 'mm', 'x-tau-symbols': { de: 'Millimeter' } }))).toMatch(
      /^INVALID_QUANTITY at \/properties\/depth\/x-tau-symbols/u,
    );
  });
});
