import { describe, it, expect } from 'vitest';
import type { JSONSchema7 } from 'json-schema';
import type { JscadParameterDefinition } from '#components/geometry/kernel/jscad/jscad.schema.js';
import {
  convertParameterDefinitionsToDefaults,
  convertParameterDefinitionsToJsonSchema,
} from '#components/geometry/kernel/jscad/jscad.schema.js';

describe('convertParameterDefinitionsToDefaults', () => {
  it('should extract default values from initial field', () => {
    const definitions: JscadParameterDefinition[] = [
      { name: 'width', type: 'float', initial: 10 },
      { name: 'height', type: 'int', initial: 20 },
      { name: 'label', type: 'text', initial: 'test' },
    ];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({
      width: 10,
      height: 20,
      label: 'test',
    });
  });

  it('should extract default values from default field', () => {
    const definitions: JscadParameterDefinition[] = [
      { name: 'width', type: 'float', default: 15 },
      { name: 'height', type: 'int', default: 25 },
    ];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({
      width: 15,
      height: 25,
    });
  });

  it('should prefer initial over default when both present', () => {
    const definitions: JscadParameterDefinition[] = [
      { name: 'width', type: 'float', initial: 10, default: 15 },
      { name: 'height', type: 'int', initial: 20, default: 25 },
    ];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({
      width: 10,
      height: 20,
    });
  });

  it('should skip parameters without initial or default values', () => {
    const definitions: JscadParameterDefinition[] = [
      { name: 'width', type: 'float', initial: 10 },
      { name: 'height', type: 'int' },
      { name: 'depth', type: 'float', initial: 30 },
    ];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({
      width: 10,
      depth: 30,
    });
  });

  it('should handle empty array', () => {
    const definitions: JscadParameterDefinition[] = [];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({});
  });

  it('should handle checkbox type with checked field', () => {
    const definitions: JscadParameterDefinition[] = [
      { name: 'enabled', type: 'checkbox', checked: true },
      { name: 'visible', type: 'checkbox', initial: false },
    ];

    const result = convertParameterDefinitionsToDefaults(definitions);

    expect(result).toEqual({
      visible: false,
    });
  });
});

describe('convertParameterDefinitionsToJsonSchema', () => {
  describe('integer type', () => {
    it('should convert int type to JSON Schema integer', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'numTeeth',
          caption: 'Number of teeth:',
          type: 'int',
          initial: 10,
          min: 5,
          max: 20,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result).toEqual({
        type: 'object',
        properties: {
          numTeeth: {
            type: 'integer',
            description: 'Number of teeth:',
            default: 10,
            minimum: 5,
            maximum: 20,
          },
        },
      });
    });

    it('should handle int type without min/max', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'count', type: 'int', initial: 5 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['count']).toEqual({
        type: 'integer',
        default: 5,
      });
    });
  });

  describe('float/number type', () => {
    it('should convert float type to JSON Schema number', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'thickness',
          caption: 'Thickness:',
          type: 'float',
          initial: 5.5,
          min: 0,
          max: 10,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['thickness']).toEqual({
        type: 'number',
        description: 'Thickness:',
        default: 5.5,
        minimum: 0,
        maximum: 10,
      });
    });

    it('should convert number type to JSON Schema number', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'value', type: 'number', initial: 3.14 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['value']).toEqual({
        type: 'number',
        default: 3.14,
      });
    });

    it('should handle step as multipleOf', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'clearance',
          type: 'float',
          initial: 0.5,
          step: 0.1,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['clearance']).toEqual({
        type: 'number',
        default: 0.5,
        multipleOf: 0.1,
      });
    });

    it('should convert slider type to number', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'opacity',
          type: 'slider',
          initial: 0.75,
          min: 0,
          max: 1,
          step: 0.05,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['opacity']).toEqual({
        type: 'number',
        default: 0.75,
        minimum: 0,
        maximum: 1,
        multipleOf: 0.05,
      });
    });
  });

  describe('text/string type', () => {
    it('should convert text type to JSON Schema string', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'label',
          caption: 'Label:',
          type: 'text',
          initial: 'Hello',
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['label']).toEqual({
        type: 'string',
        description: 'Label:',
        default: 'Hello',
      });
    });
  });

  describe('checkbox/boolean type', () => {
    it('should convert checkbox type to JSON Schema boolean', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'enabled',
          caption: 'Enable feature:',
          type: 'checkbox',
          checked: true,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['enabled']).toEqual({
        type: 'boolean',
        description: 'Enable feature:',
        default: true,
      });
    });

    it('should use checked value for checkbox when no initial specified', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'enabled',
          type: 'checkbox',
          checked: true,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['enabled']).toEqual({
        type: 'boolean',
        default: true,
      });
    });
  });

  describe('choice/enum type', () => {
    it('should convert choice type to JSON Schema enum', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'material',
          caption: 'Material:',
          type: 'choice',
          values: ['wood', 'metal', 'plastic'],
          initial: 'wood',
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['material']).toEqual({
        description: 'Material:',
        default: 'wood',
        enum: ['wood', 'metal', 'plastic'],
      });
    });

    it('should handle numeric enum values', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'quality',
          type: 'choice',
          values: [1, 2, 3, 4, 5],
          initial: 3,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['quality']).toEqual({
        default: 3,
        enum: [1, 2, 3, 4, 5],
      });
    });
  });

  describe('group type', () => {
    it('should skip group entries', () => {
      const definitions: JscadParameterDefinition[] = [
        { name: 'dimensions', type: 'group' },
        { name: 'width', type: 'float', initial: 10 },
        { name: 'settings', type: 'group' },
        { name: 'height', type: 'float', initial: 20 },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result).toEqual({
        type: 'object',
        properties: {
          width: {
            type: 'number',
            default: 10,
          },
          height: {
            type: 'number',
            default: 20,
          },
        },
      });
    });
  });

  describe('type inference from default value', () => {
    it('should infer integer type from integer default', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'count', initial: 42 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['count']).toEqual({
        type: 'integer',
        default: 42,
      });
    });

    it('should infer number type from float default', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'ratio', initial: 3.14 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['ratio']).toEqual({
        type: 'number',
        default: 3.14,
      });
    });

    it('should infer string type from string default', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'name', initial: 'test' }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['name']).toEqual({
        type: 'string',
        default: 'test',
      });
    });

    it('should infer boolean type from boolean default', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'enabled', initial: true }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['enabled']).toEqual({
        type: 'boolean',
        default: true,
      });
    });
  });

  describe('complex real-world example', () => {
    it('should convert involute gear parameters correctly', () => {
      const definitions: JscadParameterDefinition[] = [
        {
          name: 'numTeeth',
          caption: 'Number of teeth:',
          type: 'int',
          initial: 10,
          min: 5,
          max: 20,
        },
        {
          name: 'circularPitch',
          caption: 'Circular pitch:',
          type: 'float',
          initial: 5,
        },
        {
          name: 'pressureAngle',
          caption: 'Pressure angle:',
          type: 'float',
          initial: 20,
        },
        {
          name: 'clearance',
          caption: 'Clearance:',
          type: 'float',
          initial: 0,
          step: 0.1,
        },
        {
          name: 'thickness',
          caption: 'Thickness:',
          type: 'float',
          initial: 5,
          min: 0,
        },
        {
          name: 'centerHoleRadius',
          caption: 'Center hole:',
          type: 'float',
          initial: 2,
          min: 0,
        },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result).toEqual({
        type: 'object',
        properties: {
          numTeeth: {
            type: 'integer',
            description: 'Number of teeth:',
            default: 10,
            minimum: 5,
            maximum: 20,
          },
          circularPitch: {
            type: 'number',
            description: 'Circular pitch:',
            default: 5,
          },
          pressureAngle: {
            type: 'number',
            description: 'Pressure angle:',
            default: 20,
          },
          clearance: {
            type: 'number',
            description: 'Clearance:',
            default: 0,
            multipleOf: 0.1,
          },
          thickness: {
            type: 'number',
            description: 'Thickness:',
            default: 5,
            minimum: 0,
          },
          centerHoleRadius: {
            type: 'number',
            description: 'Center hole:',
            default: 2,
            minimum: 0,
          },
        },
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty definitions array', () => {
      const definitions: JscadParameterDefinition[] = [];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result).toEqual({
        type: 'object',
        properties: {},
      });
    });

    it('should handle definitions without caption', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'value', type: 'float', initial: 10 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['value']).toEqual({
        type: 'number',
        default: 10,
      });
    });

    it('should handle definitions without default value', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'value', type: 'float', min: 0, max: 100 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['value']).toEqual({
        type: 'number',
        minimum: 0,
        maximum: 100,
      });
    });

    it('should handle choice without values', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'option', type: 'choice', initial: 'default' }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.properties?.['option']).toEqual({
        default: 'default',
      });
    });

    it('should handle null values correctly', () => {
      const definitions: JscadParameterDefinition[] = [
        { name: 'nullable', type: 'text', initial: null as unknown as string },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      // Should not include default when value is null
      expect(result.properties?.['nullable']).toEqual({
        type: 'string',
      });
    });
  });

  describe('JSON Schema structure', () => {
    it('should always return object type with properties', () => {
      const definitions: JscadParameterDefinition[] = [
        { name: 'a', initial: 1 },
        { name: 'b', initial: 2 },
      ];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      expect(Object.keys(result.properties ?? {})).toHaveLength(2);
    });

    it('should create valid JSON Schema v7', () => {
      const definitions: JscadParameterDefinition[] = [{ name: 'test', type: 'int', initial: 1, min: 0, max: 10 }];

      const result = convertParameterDefinitionsToJsonSchema(definitions);

      // Verify it matches JSONSchema7 structure
      const schema: JSONSchema7 = result;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });
  });
});
