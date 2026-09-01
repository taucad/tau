import Form from '@rjsf/core';
import { createSchemaUtils } from '@rjsf/utils';
import type { RJSFSchema, ValidatorType } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { assimpEdgeSchemas } from '@taucad/assimp';
import { imageEdgeSchemas } from '@taucad/image';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { render, screen } from '@testing-library/react';
import { toJSONSchema } from 'zod';
import type { ZodType } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  rjsfDefaultFormStateBehavior,
  rjsfIdPrefix,
  rjsfIdSeparator,
} from '#components/geometry/parameters/rjsf-utils.js';
import { templates, uiSchema, widgets } from '#components/geometry/parameters/rjsf-theme.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const optionalSectionsSchema: RJSFSchema = {
  type: 'object',
  properties: {
    sections: {
      type: 'object',
      properties: {
        planes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              point: { type: 'array', items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }] },
              normal: { type: 'array', items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }] },
            },
            required: ['point', 'normal'],
          },
        },
      },
      required: ['planes'],
    },
  },
};

const formContext: RJSFContext = {
  idPrefix: rjsfIdPrefix,
  rootPresentation: 'catalog',
  searchTerm: '',
  allExpanded: true,
  resetSingleParameter: vi.fn(),
  shouldShowField: () => true,
  units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
};

const inputJsonSchema = (schema: unknown): RJSFSchema => {
  const jsonSchema = toJSONSchema(schema as ZodType, { target: 'draft-7', io: 'input' }) as RJSFSchema;
  const active = jsonSchema.anyOf?.[0] ?? jsonSchema.oneOf?.[0] ?? jsonSchema;
  if (typeof active !== 'object' || Array.isArray(active)) {
    throw new TypeError('Expected an object JSON Schema');
  }
  return active as RJSFSchema;
};

const schemaUtilsFor = (schema: RJSFSchema) =>
  createSchemaUtils<Record<string, unknown>, RJSFSchema, RJSFContext>(
    validator as unknown as ValidatorType<Record<string, unknown>, RJSFSchema, RJSFContext>,
    schema,
    rjsfDefaultFormStateBehavior,
  );

const requireRjsfSchema = (value: unknown, message: string): RJSFSchema => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(message);
  }
  return value as RJSFSchema;
};

describe('RJSF form-state policy', () => {
  it('should keep absent optional object and minItems branches absent on mount', () => {
    const schemaUtils = schemaUtilsFor(optionalSectionsSchema);
    const hydrated = schemaUtils.getDefaultFormState(optionalSectionsSchema, {});

    expect(hydrated).toEqual({});
    expect(validator.validateFormData(hydrated, optionalSectionsSchema).errors).toEqual([]);
  });

  it('should not emit invalid synthetic form data when a real form mounts', () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <Form
          schema={optionalSectionsSchema}
          formData={{}}
          validator={validator}
          templates={templates}
          widgets={widgets}
          uiSchema={uiSchema}
          idPrefix={rjsfIdPrefix}
          idSeparator={rjsfIdSeparator}
          formContext={formContext}
          experimental_defaultFormStateBehavior={rjsfDefaultFormStateBehavior}
          liveValidate
          onChange={onChange}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByText(/must be number/i)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should populate valid declared defaults for required objects and minItems arrays', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        sections: {
          type: 'object',
          properties: {
            planes: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  point: { type: 'array', default: [0, 0, 0], items: { type: 'number' } },
                  normal: { type: 'array', default: [0, 0, 1], items: { type: 'number' } },
                },
                required: ['point', 'normal'],
              },
            },
          },
          required: ['planes'],
        },
      },
      required: ['sections'],
    };
    const hydrated = schemaUtilsFor(schema).getDefaultFormState(schema, {});

    expect(hydrated).toEqual({ sections: { planes: [{ point: [0, 0, 0], normal: [0, 0, 1] }] } });
    expect(validator.validateFormData(hydrated, schema).errors.map((error) => error.stack)).toEqual([]);
  });

  it('should hydrate every production Assimp and image option schema without validation errors', () => {
    const corpus = [
      ...Object.entries(assimpEdgeSchemas).map(([name, schema]) => [`assimp:${name}`, schema] as const),
      ...Object.entries(imageEdgeSchemas).map(([name, schema]) => [`image:${name}`, schema] as const),
    ];

    expect(Object.keys(assimpEdgeSchemas)).toHaveLength(15);
    expect(Object.keys(imageEdgeSchemas)).toHaveLength(3);
    for (const [name, schema] of corpus) {
      const jsonSchema = inputJsonSchema(schema);
      const parsed: unknown = schema.parse({});
      const defaults = requireRjsfSchema(parsed, `Expected object defaults for ${name}`);
      const hydrated = schemaUtilsFor(jsonSchema).getDefaultFormState(jsonSchema, defaults);
      expect(validator.validateFormData(hydrated, jsonSchema).errors, name).toEqual([]);
      expect(JSON.stringify(jsonSchema), name).not.toContain('"readOnly":true');
    }
  });

  it('should derive a complete default for a newly added production object-array item', () => {
    const jsonSchema = inputJsonSchema(imageEdgeSchemas.png);
    const visiblePrimitives = requireRjsfSchema(
      jsonSchema.properties?.['visiblePrimitives'] as unknown,
      'Expected the visible-primitives schema',
    );
    const itemSchema = requireRjsfSchema(visiblePrimitives.items as unknown, 'Expected the visible-primitives item');

    const item = schemaUtilsFor(jsonSchema).getDefaultFormState(itemSchema);

    expect(item).toEqual({ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 });
    expect(validator.validateFormData(item, itemSchema).errors).toEqual([]);
  });

  it('should preserve representative inferred CAD parameter arrays and nested defaults', async () => {
    const defaults = {
      dimensions: { width: 12, height: 8 },
      origin: [1, 2, 3],
      label: 'front',
    };
    const schema = (await jsonSchemaFromJson(defaults)) as RJSFSchema;
    const hydrated = schemaUtilsFor(schema).getDefaultFormState(schema, defaults);

    expect(hydrated).toEqual(defaults);
    expect(validator.validateFormData(hydrated, schema).errors.map((error) => error.stack)).toEqual([]);
  });
});
