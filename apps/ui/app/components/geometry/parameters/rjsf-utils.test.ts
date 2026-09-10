import type { RJSFSchema } from '@rjsf/utils';
import { describe, expect, it } from 'vitest';
import {
  getFieldDefaultValue,
  getDiscriminatedUnionInfo,
  isSchemaMatchingSearch,
  mergeFormDefaults,
  normalizeRjsfFormData,
  resetRjsfField,
} from '#components/geometry/parameters/rjsf-utils.js';

describe('resetRjsfField refusal', () => {
  it('should refuse a missing array-item default without changing the original JSON array', () => {
    const formData = { point: [9, 8, 7] };

    expect(resetRjsfField({ formData, fieldPath: ['point', '1'], defaultValue: undefined })).toBeUndefined();
    expect(formData).toEqual({ point: [9, 8, 7] });
    expect(Object.hasOwn(formData.point, '1')).toBe(true);
  });

  it('should refuse a root reset and stale missing ancestry', () => {
    const formData = { value: 2 };

    expect(resetRjsfField({ formData, fieldPath: [], defaultValue: 1 })).toBeUndefined();
    expect(resetRjsfField({ formData, fieldPath: ['missing', 'value'], defaultValue: 1 })).toBeUndefined();
    expect(formData).toEqual({ value: 2 });
  });
});

describe('getFieldDefaultValue', () => {
  it.each([
    ['boolean', ['includeEdges'], false],
    ['number', ['count'], 0],
    ['string', ['label'], ''],
    ['null', ['selection'], null],
    ['nested discriminator', ['camera', 'framing'], 'fit'],
    ['array object property', ['views', '0', 'camera', 'framing'], 'fixed'],
    ['tuple item', ['origin', '1'], 2],
  ] as const)('should prefer a present authoritative %s default', (_label, fieldPath, expected) => {
    const defaultParameters = {
      includeEdges: false,
      count: 0,
      label: '',
      selection: null,
      camera: { framing: 'fit' },
      views: [{ camera: { framing: 'fixed' } }],
      origin: [1, 2, 3],
    };

    expect(
      getFieldDefaultValue({
        fieldPath,
        formData: expected,
        schemaDefault: 'schema-default',
        defaultParameters,
      }),
    ).toBe(expected);
  });

  it('should preserve an explicitly undefined default and fall back only for an absent path', () => {
    const defaultParameters = { optional: undefined };

    expect(
      getFieldDefaultValue({
        fieldPath: ['optional'],
        formData: undefined,
        schemaDefault: 'schema-default',
        defaultParameters,
      }),
    ).toBeUndefined();
    expect(
      getFieldDefaultValue({
        fieldPath: ['missing'],
        formData: undefined,
        schemaDefault: 'schema-default',
        defaultParameters,
      }),
    ).toBe('schema-default');
  });
});

describe('mergeFormDefaults', () => {
  it('should replace edited arrays while preserving nested object defaults', () => {
    expect(
      mergeFormDefaults(
        {
          type: 'object',
          properties: { sections: { type: 'object', properties: { planes: { type: 'array' } } } },
        },
        { sections: { planes: [{ point: [0, 0, 0] }], clipLines: true } },
        { sections: { planes: [{ point: [1, 2, 3] }] } },
      ),
    ).toEqual({ sections: { planes: [{ point: [1, 2, 3] }], clipLines: true } });
  });

  it('should replace a changed discriminated branch instead of retaining fields from the old branch', () => {
    expect(
      mergeFormDefaults(
        {
          type: 'object',
          properties: {
            camera: {
              oneOf: [
                {
                  type: 'object',
                  properties: { framing: { const: 'fit' }, direction: { type: 'array' }, margin: { type: 'number' } },
                  required: ['framing'],
                },
                {
                  type: 'object',
                  properties: { framing: { const: 'fixed' }, position: { type: 'array' }, target: { type: 'array' } },
                  required: ['framing'],
                },
              ],
            },
          },
        },
        { camera: { framing: 'fit', direction: [1, 0, 0], margin: 0.1 } },
        { camera: { framing: 'fixed', position: [3, -3, 2], target: [0, 0, 0] } },
      ),
    ).toEqual({ camera: { framing: 'fixed', position: [3, -3, 2], target: [0, 0, 0] } });
  });

  it('should follow an arbitrary required discriminator and retain common and selected defaults', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        solver: {
          type: 'object',
          properties: { shared: { type: 'number' } },
          oneOf: [
            {
              properties: { algorithm: { const: 'steady' }, iterations: { type: 'number', default: 10 } },
              required: ['algorithm'],
            },
            {
              properties: { algorithm: { const: 'transient' }, duration: { type: 'number', default: 5 } },
              required: ['algorithm'],
            },
          ],
        },
      },
    };

    expect(
      mergeFormDefaults(
        schema,
        { solver: { algorithm: 'steady', iterations: 10, shared: 1, extension: true } },
        { solver: { algorithm: 'transient', duration: 2, shared: 1 } },
      ),
    ).toEqual({ solver: { algorithm: 'transient', duration: 2, shared: 1, extension: true } });
    expect(
      mergeFormDefaults(
        schema,
        { solver: { algorithm: 'steady', iterations: 10 } },
        { solver: { algorithm: 'transient' } },
      ),
    ).toEqual({
      solver: { algorithm: 'transient', duration: 5 },
    });
    expect(
      mergeFormDefaults(
        schema,
        { solver: { algorithm: 'steady', iterations: 10 } },
        { solver: { algorithm: 'future', payload: 3 } },
      ),
    ).toEqual({ solver: { algorithm: 'future', payload: 3 } });
  });
});

describe('getDiscriminatedUnionInfo', () => {
  it('should require every branch to require the discriminator', () => {
    const optional: RJSFSchema = {
      anyOf: [
        { properties: { algorithm: { const: 'steady' } } },
        { properties: { algorithm: { const: 'transient' } } },
      ],
    };
    expect(getDiscriminatedUnionInfo(optional)).toBeUndefined();
    const required: RJSFSchema = {
      oneOf: [
        { properties: { algorithm: { const: 'steady' } }, required: ['algorithm'] },
        { properties: { algorithm: { const: 'transient' } }, required: ['algorithm'] },
      ],
    };
    expect(getDiscriminatedUnionInfo(required)?.discriminator).toBe('algorithm');
  });

  it('should preserve unknown discriminator data for validation instead of selecting branch zero', () => {
    const schema: RJSFSchema = {
      oneOf: [
        { properties: { algorithm: { const: 'steady' }, iterations: { type: 'number' } }, required: ['algorithm'] },
        { properties: { algorithm: { const: 'transient' }, duration: { type: 'number' } }, required: ['algorithm'] },
      ],
    };
    expect(normalizeRjsfFormData(schema, { algorithm: 'future', payload: 3 })).toEqual({
      algorithm: 'future',
      payload: 3,
    });
  });
});

describe('normalizeRjsfFormData', () => {
  it('should clean transient data created while switching a discriminated object branch', () => {
    const schema: RJSFSchema = {
      oneOf: [
        {
          type: 'object',
          properties: { kind: { const: 'fit' }, direction: { type: 'array', items: { type: 'number' } } },
          required: ['kind'],
        },
        {
          type: 'object',
          properties: {
            kind: { const: 'fixed' },
            position: { type: 'array', items: { type: 'number' } },
            clipping: {
              type: 'object',
              properties: { near: { type: 'number' }, far: { type: 'number' } },
              required: ['near', 'far'],
            },
          },
          required: ['kind'],
        },
      ],
    };

    expect(
      normalizeRjsfFormData(schema, {
        kind: 'fixed',
        direction: undefined,
        position: [3, -3, 2],
        clipping: {},
      }),
    ).toEqual({ kind: 'fixed', position: [3, -3, 2] });
  });

  it('should preserve valid empty objects and invalid required objects for validation', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        metadata: { type: 'object', properties: {} },
        requiredSettings: {
          type: 'object',
          properties: { value: { type: 'number' } },
          required: ['value'],
        },
      },
      required: ['requiredSettings'],
    };

    expect(normalizeRjsfFormData(schema, { metadata: {}, requiredSettings: {} })).toEqual({
      metadata: {},
      requiredSettings: {},
    });
  });
});

describe('isSchemaMatchingSearch', () => {
  describe('Empty search term', () => {
    it('should return true when search term is empty string', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Test Field',
      };
      expect(isSchemaMatchingSearch(schema, '')).toBe(true);
    });

    it('should return true when search term is empty with property name', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Test Field',
      };
      expect(isSchemaMatchingSearch(schema, '', 'propertyName')).toBe(true);
    });
  });

  describe('Property name matching', () => {
    it('should match exact property name', () => {
      const schema: RJSFSchema = {
        type: 'string',
      };
      expect(isSchemaMatchingSearch(schema, 'username', 'username')).toBe(true);
    });

    it('should match partial property name', () => {
      const schema: RJSFSchema = {
        type: 'string',
      };
      expect(isSchemaMatchingSearch(schema, 'user', 'username')).toBe(true);
    });

    it('should match property name case-insensitively', () => {
      const schema: RJSFSchema = {
        type: 'string',
      };
      expect(isSchemaMatchingSearch(schema, 'USER', 'username')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'UserName', 'username')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'name', 'UserName')).toBe(true);
    });

    it('should match the displayed form of an identifier', () => {
      const schema: RJSFSchema = {
        type: 'number',
      };
      expect(isSchemaMatchingSearch(schema, 'corner radius', 'cornerRadius')).toBe(true);
    });

    it('should not match when property name does not contain search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
      };
      expect(isSchemaMatchingSearch(schema, 'email', 'username')).toBe(false);
    });
  });

  describe('Title matching', () => {
    it('should match exact title', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Name',
      };
      expect(isSchemaMatchingSearch(schema, 'User Name')).toBe(true);
    });

    it('should match partial title', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Name',
      };
      expect(isSchemaMatchingSearch(schema, 'User')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'Name')).toBe(true);
    });

    it('should match title case-insensitively', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Name',
      };
      expect(isSchemaMatchingSearch(schema, 'user name')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'USER')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'name')).toBe(true);
    });

    it('should not match when title does not contain search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Name',
      };
      expect(isSchemaMatchingSearch(schema, 'email')).toBe(false);
    });

    it('should handle non-string title gracefully', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'string',
        title: 123,
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, '123')).toBe(false);
    });
  });

  describe('Description matching', () => {
    it('should match exact description', () => {
      const schema: RJSFSchema = {
        type: 'string',
        description: 'Enter your username',
      };
      expect(isSchemaMatchingSearch(schema, 'Enter your username')).toBe(true);
    });

    it('should match partial description', () => {
      const schema: RJSFSchema = {
        type: 'string',
        description: 'Enter your username',
      };
      expect(isSchemaMatchingSearch(schema, 'username')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'Enter')).toBe(true);
    });

    it('should match description case-insensitively', () => {
      const schema: RJSFSchema = {
        type: 'string',
        description: 'Enter your username',
      };
      expect(isSchemaMatchingSearch(schema, 'USERNAME')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'enter')).toBe(true);
    });

    it('should not match when description does not contain search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
        description: 'Enter your username',
      };
      expect(isSchemaMatchingSearch(schema, 'password')).toBe(false);
    });

    it('should handle non-string description gracefully', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'string',
        description: 123,
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, '123')).toBe(false);
    });
  });

  describe('Multiple field matching', () => {
    it('should match when property name matches even if title does not', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Full Name',
      };
      expect(isSchemaMatchingSearch(schema, 'username', 'username')).toBe(true);
    });

    it('should match when title matches even if property name does not', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Name',
      };
      expect(isSchemaMatchingSearch(schema, 'User', 'email')).toBe(true);
    });

    it('should match when description matches even if others do not', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Full Name',
        description: 'Enter your username',
      };
      expect(isSchemaMatchingSearch(schema, 'username', 'email')).toBe(true);
    });

    it('should not match when none of the fields match', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Full Name',
        description: 'Enter your name',
      };
      expect(isSchemaMatchingSearch(schema, 'email', 'username')).toBe(false);
    });
  });

  describe('Nested properties matching', () => {
    it('should match fields inside oneOf and anyOf branches', () => {
      const schema: RJSFSchema = {
        oneOf: [
          { type: 'object', properties: { direction: { type: 'array', title: 'Direction vector' } } },
          {
            type: 'object',
            properties: {
              projection: {
                anyOf: [
                  { type: 'object', properties: { verticalSpan: { type: 'number', title: 'Vertical span' } } },
                  { type: 'object', properties: { zoom: { type: 'number', title: 'Zoom' } } },
                ],
              },
            },
          },
        ],
      };

      expect(isSchemaMatchingSearch(schema, 'direction vector')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'vertical span')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'missing')).toBe(false);
    });

    it('should match nested property name', () => {
      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                title: 'Email Address',
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'email')).toBe(true);
    });

    it('should match nested property title', () => {
      const schema: RJSFSchema = {
        type: 'object',
        title: 'Config',
        properties: {
          database: {
            type: 'object',
            properties: {
              host: {
                type: 'string',
                title: 'Database Host',
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'Database Host')).toBe(true);
    });

    it('should match nested property description', () => {
      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              timeout: {
                type: 'number',
                description: 'Connection timeout in milliseconds',
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'timeout')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'milliseconds')).toBe(true);
    });

    it('should match deeply nested properties', () => {
      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'string',
                    title: 'Deep Field',
                  },
                },
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'Deep Field')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'level3')).toBe(true);
    });

    it('should not match when nested properties do not contain search term', () => {
      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              host: {
                type: 'string',
                title: 'Host',
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'email')).toBe(false);
    });

    it('should handle non-object nested properties', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'object',
        properties: {
          invalidProperty: 'not an object',
        },
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'invalid')).toBe(false);
    });

    it('should handle array in properties', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'object',
        properties: {
          items: ['item1', 'item2'],
        },
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'item1')).toBe(false);
    });
  });

  describe('Array schema matching', () => {
    it('should match array by property name', () => {
      const schema: RJSFSchema = {
        type: 'array',
        items: {
          type: 'number',
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo', 'foo')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'FOO', 'foo')).toBe(true);
    });

    it('should match array by title', () => {
      const schema: RJSFSchema = {
        type: 'array',
        title: 'Foo Items',
        items: {
          type: 'number',
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'FOO')).toBe(true);
    });

    it('should match array when item schema has matching properties', () => {
      const schema: RJSFSchema = {
        type: 'array',
        title: 'Items',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              title: 'Foo Name',
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(true);
    });

    it('should match array when item schema property name matches', () => {
      const schema: RJSFSchema = {
        type: 'array',
        title: 'Items',
        items: {
          type: 'object',
          properties: {
            fooField: {
              type: 'string',
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(true);
    });

    it('should not match array when nothing matches', () => {
      const schema: RJSFSchema = {
        type: 'array',
        title: 'Items',
        items: {
          type: 'number',
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(false);
    });

    it('should handle array with primitive items', () => {
      const schema: RJSFSchema = {
        type: 'array',
        title: 'Numbers',
        items: {
          type: 'number',
        },
      };
      expect(isSchemaMatchingSearch(schema, 'numbers')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(false);
    });

    it('should handle array with nested object items', () => {
      const schema: RJSFSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  title: 'Foo Value',
                },
              },
            },
          },
        },
      };
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(true);
    });

    it('should handle array with invalid items schema', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'array',
        items: 'invalid',
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(false);
    });

    it('should handle array with array items', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'array',
        items: ['item1', 'item2'],
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'foo')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle schema with no title or description', () => {
      const schema: RJSFSchema = {
        type: 'string',
      };
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should handle schema with empty properties object', () => {
      const schema: RJSFSchema = {
        type: 'object',
        properties: {},
      };
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should handle schema with undefined properties', () => {
      const schema: RJSFSchema = {
        type: 'object',
      };
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should handle schema with null nested property', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'object',
        properties: {
          nullProperty: null,
        },
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should handle schema with undefined nested property', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'object',
        properties: {
          undefinedProperty: undefined,
        },
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should match with special characters in search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User@Email',
      };
      expect(isSchemaMatchingSearch(schema, 'User@Email')).toBe(true);
      expect(isSchemaMatchingSearch(schema, '@')).toBe(true);
    });

    it('should match with numbers in search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'Version 2.0',
      };
      expect(isSchemaMatchingSearch(schema, '2.0')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'Version 2')).toBe(true);
    });

    it('should match with spaces in search term', () => {
      const schema: RJSFSchema = {
        type: 'string',
        title: 'User Full Name',
      };
      expect(isSchemaMatchingSearch(schema, 'Full Name')).toBe(true);
      expect(isSchemaMatchingSearch(schema, 'User Full')).toBe(true);
    });

    it('should handle non-object properties value', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid schema for edge-case test
      const schema = {
        type: 'object',
        properties: 'not an object',
      } as unknown as RJSFSchema;
      expect(isSchemaMatchingSearch(schema, 'test')).toBe(false);
    });

    it('should return true for parent schema when nested property matches', () => {
      const schema: RJSFSchema = {
        type: 'object',
        title: 'User Settings',
        properties: {
          notifications: {
            type: 'object',
            title: 'Notification Preferences',
            properties: {
              email: {
                type: 'boolean',
                title: 'Email Notifications',
              },
            },
          },
        },
      };
      // Should match parent when child matches
      expect(isSchemaMatchingSearch(schema, 'Email Notifications')).toBe(true);
    });
  });
});
