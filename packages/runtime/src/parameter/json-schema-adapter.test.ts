import { describe, expect, it } from 'vitest';
import { projectDraft7SchemaToParameterDeclaration } from '#parameter/json-schema-adapter.js';

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

  it('should reject every Draft-7 reference sibling independent of key order or semantics', () => {
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
      ).toThrow('NATIVE_PROJECTION_UNSUPPORTED: Draft-7 reference siblings');
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

  it('should reject semantics without an exact native instance pointer', () => {
    const length = {
      type: 'number',
      'x-tau-unit': 'mm',
      'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Length',
      'x-tau-space': 'linear',
    } as const;
    for (const schema of [
      { type: 'object', properties: { values: { type: 'array', items: length } } },
      { type: 'object', allOf: [{ type: 'object', properties: { value: length } }] },
      { type: 'object', definitions: { unused: length } },
    ]) {
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
    ).toThrow('conflicting Tau and OGC unit annotations');
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
