/* eslint-disable @typescript-eslint/naming-convention -- allowed to follow convention of quicktype. */
import { jsonSchemaFromJson } from '#utils/schema.js';

describe('jsonSchemaFromJson', () => {
  it('should return a valid JSON schema', async () => {
    const json = {
      name: 'John Doe',
      age: 30,
    };
    const schema = await jsonSchemaFromJson(json);
    expect(schema).toEqual({
      $ref: '#/definitions/Root',
      $schema: 'http://json-schema.org/draft-06/schema#',
      definitions: {
        Root: {
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
        },
      },
    });
  });

  it('should handle nested objects with keys having numeric endings', async () => {
    // Currently quicktype doesn't prevent merging objects with the same type into independent refs.
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
      $ref: '#/definitions/Root',
      $schema: 'http://json-schema.org/draft-06/schema#',
      definitions: {
        Deep: {
          additionalProperties: false,
          properties: {
            test1: {
              $ref: '#/definitions/Test',
            },
            test2: {
              $ref: '#/definitions/Test',
            },
          },
          required: ['test1', 'test2'],
          title: 'Deep',
          type: 'object',
        },
        Root: {
          additionalProperties: false,
          properties: {
            deep: {
              $ref: '#/definitions/Deep',
            },
            foo: {
              default: 'bar',
              type: 'string',
            },
          },
          required: ['deep', 'foo'],
          title: 'Root',
          type: 'object',
        },
        Test: {
          additionalProperties: false,
          properties: {
            deeper: {
              default: true,
              type: 'boolean',
            },
          },
          required: ['deeper'],
          title: 'Test',
          type: 'object',
        },
      },
    });
  });
});
