import type { JSONSchema7 } from 'json-schema';
import { hasJsonSchemaObjectProperties, jsonSchemaFromJson } from '#utils/schema.utils.js';

describe('jsonSchemaFromJson', () => {
  it('should return a valid JSON schema', async () => {
    const json = {
      name: 'John Doe',
      age: 30,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        age: {
          default: 30,
          type: 'integer',
        },
        name: {
          default: 'John Doe',
          type: 'string',
        },
      },
      required: ['age', 'name'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle nested objects with keys having numeric endings', async () => {
    // To-json-schema handles each object independently without merging types
    const json = {
      foo: 'bar',
      deep: {
        test1: {
          deeper: true,
        },
        test2: {
          deeper: true,
        },
      },
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        deep: {
          additionalProperties: false,
          properties: {
            test1: {
              additionalProperties: false,
              properties: {
                deeper: {
                  default: true,
                  type: 'boolean',
                },
              },
              required: ['deeper'],
              title: 'Test1',
              type: 'object',
            },
            test2: {
              additionalProperties: false,
              properties: {
                deeper: {
                  default: true,
                  type: 'boolean',
                },
              },
              required: ['deeper'],
              title: 'Test2',
              type: 'object',
            },
          },
          required: ['test1', 'test2'],
          title: 'Deep',
          type: 'object',
        },
        foo: {
          default: 'bar',
          type: 'string',
        },
      },
      required: ['deep', 'foo'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle keys with shared prefixes', async () => {
    const json = {
      postDiameter: 5,
      postHole: 2.8,
      postHeight: 7,
      postInsetX: 4.5,
      lidLip: 1.2,
      lidClearance: 0.4,
      ventRows: 3,
      ventCols: 12,
      ventDiameter: 2.5,
      ventMargin: 5,
      ventPitch: 5,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        lidClearance: {
          default: 0.4,
          type: 'number',
        },
        lidLip: {
          default: 1.2,
          type: 'number',
        },
        postDiameter: {
          default: 5,
          type: 'integer',
        },
        postHeight: {
          default: 7,
          type: 'integer',
        },
        postHole: {
          default: 2.8,
          type: 'number',
        },
        postInsetX: {
          default: 4.5,
          type: 'number',
        },
        ventCols: {
          default: 12,
          type: 'integer',
        },
        ventRows: {
          default: 3,
          type: 'integer',
        },
        ventDiameter: {
          default: 2.5,
          type: 'number',
        },
        ventMargin: {
          default: 5,
          type: 'integer',
        },
        ventPitch: {
          default: 5,
          type: 'integer',
        },
      },
      required: [
        'lidClearance',
        'lidLip',
        'postDiameter',
        'postHeight',
        'postHole',
        'postInsetX',
        'ventCols',
        'ventDiameter',
        'ventMargin',
        'ventPitch',
        'ventRows',
      ],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle arrays of primitives', async () => {
    const json = {
      numbers: [1, 2, 3],
      strings: ['a', 'b', 'c'],
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        numbers: {
          items: {
            type: 'integer',
          },
          type: 'array',
        },
        strings: {
          items: {
            type: 'string',
          },
          type: 'array',
        },
      },
      required: ['numbers', 'strings'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle arrays of objects', async () => {
    const json = {
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ],
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        items: {
          items: {
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['items'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle empty arrays', async () => {
    const json = {
      emptyArray: [],
      value: 1,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        emptyArray: {
          type: 'array',
        },
        value: {
          default: 1,
          type: 'integer',
        },
      },
      required: ['emptyArray', 'value'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle nested arrays', async () => {
    const json = {
      matrix: [
        [1, 2],
        [3, 4],
      ],
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        matrix: {
          items: {
            items: {
              type: 'integer',
            },
            type: 'array',
          },
          type: 'array',
        },
      },
      required: ['matrix'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle negative numbers and zero', async () => {
    const json = {
      negative: -5,
      zero: 0,
      negativeFloat: -3.14,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        negative: {
          default: -5,
          type: 'integer',
        },
        negativeFloat: {
          default: -3.14,
          type: 'number',
        },
        zero: {
          default: 0,
          type: 'integer',
        },
      },
      required: ['negative', 'negativeFloat', 'zero'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle empty strings', async () => {
    const json = {
      empty: '',
      notEmpty: 'value',
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        empty: {
          default: '',
          type: 'string',
        },
        notEmpty: {
          default: 'value',
          type: 'string',
        },
      },
      required: ['empty', 'notEmpty'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle deeply nested structures', async () => {
    const json = {
      level1: {
        level2: {
          level3: {
            value: 42,
          },
        },
      },
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        level1: {
          additionalProperties: false,
          properties: {
            level2: {
              additionalProperties: false,
              properties: {
                level3: {
                  additionalProperties: false,
                  properties: {
                    value: {
                      default: 42,
                      type: 'integer',
                    },
                  },
                  required: ['value'],
                  title: 'Level3',
                  type: 'object',
                },
              },
              required: ['level3'],
              title: 'Level2',
              type: 'object',
            },
          },
          required: ['level2'],
          title: 'Level1',
          type: 'object',
        },
      },
      required: ['level1'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle different property naming conventions', async () => {
    const json = {
      camelCase: 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Test case
      snake_case: 2,
      'kebab-case': 3,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Test case
      PascalCase: 4,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test case
        PascalCase: {
          default: 4,
          type: 'integer',
        },
        camelCase: {
          default: 1,
          type: 'integer',
        },
        'kebab-case': {
          default: 3,
          type: 'integer',
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test case
        snake_case: {
          default: 2,
          type: 'integer',
        },
      },
      required: ['PascalCase', 'camelCase', 'kebab-case', 'snake_case'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle objects with single property', async () => {
    const json = {
      single: { value: 'test' },
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        single: {
          additionalProperties: false,
          properties: {
            value: {
              default: 'test',
              type: 'string',
            },
          },
          required: ['value'],
          title: 'Single',
          type: 'object',
        },
      },
      required: ['single'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle mixed types with all primitives', async () => {
    const json = {
      string: 'text',
      integer: 42,
      float: 3.14,
      boolean: true,
      negative: -10,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        boolean: {
          default: true,
          type: 'boolean',
        },
        float: {
          default: 3.14,
          type: 'number',
        },
        integer: {
          default: 42,
          type: 'integer',
        },
        negative: {
          default: -10,
          type: 'integer',
        },
        string: {
          default: 'text',
          type: 'string',
        },
      },
      required: ['boolean', 'float', 'integer', 'negative', 'string'],
      title: 'Root',
      type: 'object',
    });
  });

  it('should handle objects containing arrays and nested objects', async () => {
    const json = {
      metadata: {
        tags: ['a', 'b'],
        count: 2,
      },
      items: [{ id: 1 }],
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      properties: {
        items: {
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: {
                default: 1,
                type: 'integer',
              },
            },
            required: ['id'],
          },
          type: 'array',
        },
        metadata: {
          additionalProperties: false,
          properties: {
            count: {
              default: 2,
              type: 'integer',
            },
            tags: {
              items: {
                type: 'string',
              },
              type: 'array',
            },
          },
          required: ['count', 'tags'],
          title: 'Metadata',
          type: 'object',
        },
      },
      required: ['items', 'metadata'],
      title: 'Root',
      type: 'object',
    });
  });
});

describe('hasJsonSchemaObjectProperties', () => {
  it('should return true if the JSON schema has any object properties', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      type: 'object',
      properties: {
        foo: {
          type: 'object',
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return false if the JSON schema does not have any object properties', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(false);
  });

  it('should return true if the JSON schema has any object properties in an array', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      type: 'object',
      properties: {
        foo: {
          type: 'array',
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return false if the JSON schema only has primitive properties', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      additionalProperties: false,
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
        age: {
          type: 'number',
        },
        active: {
          type: 'boolean',
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(false);
  });

  it('should return true for nested object within object', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        outer: {
          type: 'object',
          properties: {
            inner: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true for nested array within object', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        outer: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true when array contains objects', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
              },
              name: {
                type: 'string',
              },
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true when array contains arrays (nested arrays)', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        matrix: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true for deeply nested object structures', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              properties: {
                level3: {
                  type: 'object',
                  properties: {
                    value: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true when mixing primitives with arrays', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        name: {
          type: 'string',
        },
        age: {
          type: 'number',
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true when mixing primitives with objects', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        name: {
          type: 'string',
        },
        age: {
          type: 'number',
        },
        address: {
          type: 'object',
          properties: {
            street: {
              type: 'string',
            },
            city: {
              type: 'string',
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true for schema with oneOf containing objects', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        value: {
          oneOf: [
            {
              type: 'object',
              properties: {
                foo: {
                  type: 'string',
                },
              },
            },
            {
              type: 'string',
            },
          ],
        },
      },
    } as const as JSONSchema7;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true for schema with anyOf containing arrays', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        value: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            {
              type: 'string',
            },
          ],
        },
      },
    } as const as JSONSchema7;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return false for schema with only primitive combinators', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        value: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'number',
            },
            {
              type: 'boolean',
            },
          ],
        },
      },
    } as const as JSONSchema7;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(false);
  });

  it('should return false for empty schema with no properties', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(false);
  });

  it('should return true when additionalProperties contains objects', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        dynamicFields: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
              },
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });

  it('should return true when additionalProperties contains arrays', () => {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      properties: {
        dynamicFields: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
    } as const;
    expect(hasJsonSchemaObjectProperties(jsonSchema)).toBe(true);
  });
});
