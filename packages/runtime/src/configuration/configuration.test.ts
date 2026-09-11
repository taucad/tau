import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { quantity } from '#configuration/zod.js';
import {
  admitJsonSchema,
  defineConfiguration,
  validateConfiguration,
  admitConfigurationManifest,
} from '#configuration/index.js';

type Input = { readonly millimeters: number; readonly profile: string };
type Output = { readonly meters: number; readonly profile: string };

const inputSchema = {
  type: 'object',
  properties: {
    millimeters: { type: 'number', minimum: 0, 'x-tau-quantity': 'length' },
    profile: { type: 'string' },
  },
  required: ['millimeters', 'profile'],
  additionalProperties: false,
};
const outputSchema = {
  type: 'object',
  properties: {
    meters: { type: 'number', minimum: 0 },
    profile: { type: 'string' },
  },
  required: ['meters', 'profile'],
  additionalProperties: false,
};

const schema: StandardSchemaV1<Input, Output> & StandardJSONSchemaV1<Input, Output> = {
  '~standard': {
    version: 1,
    vendor: 'fixture',
    validate: async (value) => {
      const input = value as Input;
      return typeof input.millimeters === 'number' && typeof input.profile === 'string'
        ? {
            value: { meters: input.millimeters / 1000, profile: input.profile },
          }
        : { issues: [{ message: 'Invalid input' }] };
    },
    jsonSchema: { input: () => inputSchema, output: () => outputSchema },
  },
};

const createDefinitionSource = () =>
  ({
    id: 'fixture.fff',
    version: '1.0.0',
    schema,
    ui: { version: 1, rjsf: { profile: { 'ui:widget': 'select' } } },
  }) as const;

const createDefinition = () =>
  defineConfiguration({
    ...createDefinitionSource(),
    defaults: { millimeters: 0.2, profile: 'balanced' },
  });

describe('configuration admission', () => {
  it('should admit bounded local Draft-7 schemas and reject unsafe declarations', () => {
    admitJsonSchema({
      $ref: '#/definitions/voltage',
      definitions: { voltage: { type: 'number', minimum: 0 } },
      properties: { pattern: { type: 'string' } },
    });
    expect(() => {
      admitJsonSchema({
        $ref: '#/definitions/enabled',
        definitions: { enabled: true },
      });
    }).not.toThrow();
    expect(() => {
      admitJsonSchema({ type: 'number', minimum: 'zero' });
    }).toThrow('INVALID_SCHEMA');
    expect(() => {
      admitJsonSchema({ type: 'string', pattern: '(a+)+$' });
    }).toThrow('UNSUPPORTED_KEYWORD');
    expect(() => {
      admitJsonSchema({ $ref: 'https://example.invalid/schema' });
    }).toThrow('UNSUPPORTED_REFERENCE');
    expect(() => {
      admitJsonSchema({ $ref: '#/definitions/missing' });
    }).toThrow('UNRESOLVED_REFERENCE');
    expect(() => {
      admitJsonSchema({
        $ref: '#/definitions/node',
        definitions: { node: { $ref: '#/definitions/node' } },
      });
    }).toThrow('CYCLIC_REFERENCE');
    expect(() => {
      admitJsonSchema({ type: 'string', 'x-tau-quantity': 'length' });
    }).toThrow('INVALID_QUANTITY');
    expect(() => {
      admitJsonSchema({ type: 'number', 'x-tau-quantity': 'not-a-quantity' });
    }).toThrow('INVALID_QUANTITY');
    expect(() => {
      admitJsonSchema({
        enum: Array.from({ length: 2049 }, (_, index) => index),
      });
    }).toThrow('SCHEMA_LIMIT');
  });

  it('should enforce Draft-7 keyword shapes and closed quantity types', () => {
    for (const invalid of [
      { type: 'number', multipleOf: 0 },
      { type: 'array', maxItems: 1.5 },
      { type: 'string', minLength: -1 },
      { type: 'object', required: ['value', 'value'] },
      { type: 'object', properties: [] },
      { definitions: { invalid: 1 } },
      { type: 'string', examples: 'example' },
      { type: ['number', 'number'] },
      { enum: [{ value: 1 }, { value: 1 }] },
      { dependencies: { first: ['second', 'second'] } },
    ]) {
      expect(() => {
        admitJsonSchema(invalid);
      }).toThrow('INVALID_SCHEMA');
    }
    expect(() => {
      admitJsonSchema({
        type: ['number', 'string'],
        'x-tau-quantity': 'length',
      });
    }).toThrow('INVALID_QUANTITY');
    expect(() => {
      admitJsonSchema({
        type: ['number', 'null'],
        'x-tau-quantity': 'length',
      });
    }).not.toThrow();
  });

  it('should materialize a frozen manifest and reject invalid defaults or UI metadata', async () => {
    const source = createDefinitionSource();
    const definition = defineConfiguration({
      ...source,
      defaults: { millimeters: 0.2, profile: 'balanced' },
    });
    expect(Object.isFrozen(definition.manifest)).toBe(true);
    expect(Object.isFrozen(definition.manifest.inputSchema)).toBe(true);
    expect(definition.manifest.source).toEqual({
      id: 'fixture.fff',
      version: '1.0.0',
    });
    expect(Object.isFrozen(source.ui)).toBe(false);
    await expect(definition.manifestDigest()).resolves.toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(() =>
      defineConfiguration({
        ...createDefinitionSource(),
        defaults: { millimeters: -1, profile: 'x' },
      }),
    ).toThrow('Defaults');
    expect(() =>
      defineConfiguration({
        ...createDefinitionSource(),
        ui: { version: 1, rjsf: { profile: { 'ui:widget': 'made-up' } } },
      }),
    ).toThrow('UNSUPPORTED_WIDGET');
  });

  it('should admit untrusted manifests through a closed boundary', () => {
    const definition = createDefinition();
    expect(admitConfigurationManifest(definition.manifest).manifest).toEqual(definition.manifest);
    expect(() => admitConfigurationManifest({ ...definition.manifest, extra: true })).toThrow(
      'UNSUPPORTED_MANIFEST_KEY',
    );
    expect(() =>
      admitConfigurationManifest({
        ...definition.manifest,
        source: { ...definition.manifest.source, extra: true },
      }),
    ).toThrow('UNSUPPORTED_MANIFEST_KEY');
    expect(() =>
      admitConfigurationManifest({
        ...definition.manifest,
        defaults: { millimeters: -1, profile: 'balanced' },
      }),
    ).toThrow('Defaults');
  });

  it('should resolve local references before admitting nested UI paths', () => {
    const referencedInputSchema = {
      type: 'object',
      definitions: {
        settings: {
          type: 'object',
          properties: { profile: { type: 'string' } },
        },
      },
      properties: { settings: { $ref: '#/definitions/settings' } },
    };
    const referencedSchema = {
      ...schema,
      '~standard': {
        ...schema['~standard'],
        jsonSchema: {
          input: () => referencedInputSchema,
          output: () => outputSchema,
        },
      },
    };
    expect(() =>
      defineConfiguration({
        id: 'fixture.ref',
        version: '1.0.0',
        schema: referencedSchema,
        ui: {
          version: 1,
          rjsf: { settings: { profile: { 'ui:widget': 'select' } } },
        },
      }),
    ).not.toThrow();
  });

  it('should bound converter output without executing accessors', () => {
    let getterReads = 0;
    const accessorSchema = Object.defineProperty({ type: 'object' }, 'title', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'unsafe';
      },
    });
    const converterSchema = {
      ...schema,
      '~standard': {
        ...schema['~standard'],
        jsonSchema: {
          input: () => accessorSchema,
          output: () => outputSchema,
        },
      },
    };

    expect(() =>
      defineConfiguration({
        id: 'fixture.accessor',
        version: '1.0.0',
        schema: converterSchema,
        ui: { version: 1, rjsf: {} },
      }),
    ).toThrow();
    expect(getterReads).toBe(0);

    const oversizedSchema = {
      ...converterSchema,
      '~standard': {
        ...converterSchema['~standard'],
        jsonSchema: {
          input: () => ({ type: 'object', title: 'x'.repeat(65_537) }),
          output: () => outputSchema,
        },
      },
    };
    expect(() =>
      defineConfiguration({
        id: 'fixture.oversized',
        version: '1.0.0',
        schema: oversizedSchema,
        ui: { version: 1, rjsf: {} },
      }),
    ).toThrow('CONFIGURATION_STRING_LIMIT');
  });

  it('should materialize scalar and object quantity schemas through defineConfiguration', () => {
    const scalar = defineConfiguration({
      id: 'fixture.quantity.scalar',
      version: '1.0.0',
      schema: quantity('length').positive(),
      ui: { version: 1, rjsf: { 'ui:widget': 'slider' } },
    });
    expect(scalar.manifest.inputSchema).toMatchObject({
      type: 'number',
      exclusiveMinimum: 0,
      'x-tau-quantity': 'length',
    });
    expect(Reflect.ownKeys(scalar.manifest.inputSchema)).not.toContain('~standard');

    const object = defineConfiguration({
      id: 'fixture.quantity.object',
      version: '1.0.0',
      schema: z.object({ speed: quantity('speed').nonnegative() }),
      ui: { version: 1, rjsf: { speed: { 'ui:widget': 'slider' } } },
    });
    expect(object.manifest.inputSchema).toMatchObject({
      properties: {
        speed: { type: 'number', minimum: 0, 'x-tau-quantity': 'speed' },
      },
    });
  });

  it('should admit branch-local UI fields and reject incompatible overlaps', () => {
    const branchInputSchema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['speed', 'force'] } },
      oneOf: [{ properties: { speed: { type: 'number' } } }, { properties: { force: { type: 'number' } } }],
      allOf: [{ properties: { label: { type: 'string' } } }],
      if: { properties: { mode: { const: 'speed' } } },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` is the normative Draft-7 conditional keyword.
      then: { properties: { acceleration: { type: 'number' } } },
      else: { properties: { duration: { type: 'number' } } },
      dependencies: {
        mode: { properties: { notes: { type: 'string' } } },
      },
    };
    const branchSchema = {
      ...schema,
      '~standard': {
        ...schema['~standard'],
        jsonSchema: {
          input: () => branchInputSchema,
          output: () => outputSchema,
        },
      },
    };
    expect(() =>
      defineConfiguration({
        id: 'fixture.branches',
        version: '1.0.0',
        schema: branchSchema,
        ui: {
          version: 1,
          rjsf: {
            speed: { 'ui:widget': 'slider' },
            force: { 'ui:widget': 'slider' },
            label: { 'ui:widget': 'textarea' },
            acceleration: { 'ui:widget': 'slider' },
            duration: { 'ui:widget': 'slider' },
            notes: { 'ui:widget': 'textarea' },
          },
        },
      }),
    ).not.toThrow();

    const ambiguousSchema = {
      ...branchInputSchema,
      oneOf: [{ properties: { value: { type: 'number' } } }, { properties: { value: { type: 'string' } } }],
    };
    expect(() =>
      defineConfiguration({
        id: 'fixture.ambiguous',
        version: '1.0.0',
        schema: {
          ...branchSchema,
          '~standard': {
            ...branchSchema['~standard'],
            jsonSchema: { input: () => ambiguousSchema, output: () => outputSchema },
          },
        },
        ui: { version: 1, rjsf: { value: { 'ui:widget': 'select' } } },
      }),
    ).toThrow('AMBIGUOUS_UI_SCHEMA');
  });

  it('should admit an if-only conditional discriminator', () => {
    const conditionalInputSchema = {
      type: 'object',
      if: { properties: { mode: { type: 'string', enum: ['speed', 'force'] } } },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` is the normative Draft-7 conditional keyword.
      then: { properties: { value: { type: 'number' } } },
    };
    expect(() =>
      defineConfiguration({
        id: 'fixture.if-discriminator',
        version: '1.0.0',
        schema: {
          ...schema,
          '~standard': {
            ...schema['~standard'],
            jsonSchema: { input: () => conditionalInputSchema, output: () => outputSchema },
          },
        },
        ui: { version: 1, rjsf: { mode: { 'ui:widget': 'select' } } },
      }),
    ).not.toThrow();
  });

  it('should budget nested UI strings and diagnose unknown cosmetic icons', () => {
    expect(() =>
      defineConfiguration({
        ...createDefinitionSource(),
        ui: {
          version: 1,
          rjsf: {
            profile: {
              'ui:options': { help: 'x'.repeat(65_537) },
            },
          },
        },
      }),
    ).toThrow('UI_STRING_LIMIT');
    expect(() =>
      defineConfiguration({
        ...createDefinitionSource(),
        ui: {
          version: 1,
          rjsf: { 'ui:order': ['x'.repeat(65_537)] },
        },
      }),
    ).toThrow('UI_STRING_LIMIT');
    const unknownIcon = defineConfiguration({
      ...createDefinitionSource(),
      ui: {
        version: 1,
        rjsf: {
          profile: { 'ui:options': { icon: 'signed-unknown-icon' } },
        },
      },
    });
    expect(unknownIcon.manifest.ui.rjsf['profile']).toEqual({
      'ui:options': { icon: 'signed-unknown-icon' },
    });
    expect(unknownIcon.diagnostics).toEqual([
      {
        code: 'UNSUPPORTED_UI_ICON',
        pointer: '/ui/rjsf/profile/ui:options/icon',
        id: 'signed-unknown-icon',
      },
    ]);
    expect(Object.isFrozen(unknownIcon.diagnostics)).toBe(true);
    expect(Object.isFrozen(unknownIcon.diagnostics[0])).toBe(true);
    const knownIcon = defineConfiguration({
      ...createDefinitionSource(),
      ui: {
        version: 1,
        rjsf: { profile: { 'ui:options': { icon: 'box' } } },
      },
    });
    expect(knownIcon.diagnostics).toEqual([]);
  });
});

describe('authoritative configuration validation', () => {
  it('should fence identity and transform only strict input into valid output', async () => {
    const definition = createDefinition();
    const manifestDigest = await definition.manifestDigest();
    const request = {
      definition,
      manifestDigest,
      formRevision: 4,
      value: { millimeters: 0.2, profile: 'balanced' },
      explicitPointers: ['/millimeters', '/profile'],
    };
    const result = await validateConfiguration(request);
    expect(result.type).toBe('valid');
    if (result.type === 'valid') {
      expect(result.value).toEqual({ meters: 0.0002, profile: 'balanced' });
    }
    await expect(validateConfiguration({ ...request, manifestDigest: 'sha256:stale' })).rejects.toThrow(
      'MANIFEST_CHANGED',
    );
    await expect(validateConfiguration({ ...request, formRevision: -1 })).rejects.toThrow('INVALID_REVISION');
    const invalidInput = await validateConfiguration({
      ...request,
      value: { millimeters: 0.2, profile: 'balanced', extra: true },
    });
    expect(invalidInput.type).toBe('invalid');
    if (invalidInput.type === 'invalid') {
      expect(invalidInput.issues).toContainEqual(expect.objectContaining({ code: 'JSON_SCHEMA', pointer: '/extra' }));
    }
    await expect(validateConfiguration({ ...request, explicitPointers: ['/missing'] })).rejects.toThrow(
      'ABSENT_POINTER',
    );
  });

  it('should preserve pointer presence and expose abort as an authority boundary', async () => {
    const definition = createDefinition();
    const manifestDigest = await definition.manifestDigest();
    const value = { zero: 0, false: false, nil: null, 'a/b~c': 1 };
    const request = {
      definition,
      manifestDigest,
      formRevision: 1,
      value,
      explicitPointers: ['/zero', '/false', '/nil', '/a~1b~0c'],
    };
    await expect(validateConfiguration(request)).resolves.toMatchObject({
      type: 'invalid',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(validateConfiguration({ ...request, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(validateConfiguration({ ...request, value: { value: Number.NaN } })).rejects.toThrow('finite');
  });

  it('should snapshot caller input across awaits and freeze returned output', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delayedSchema = {
      ...schema,
      '~standard': {
        ...schema['~standard'],
        validate: async (value: unknown) => {
          await gate;
          const delayedInput = value as Input;
          return {
            value: {
              meters: delayedInput.millimeters / 1000,
              profile: delayedInput.profile,
            },
          };
        },
      },
    };
    const definition = defineConfiguration({
      ...createDefinitionSource(),
      schema: delayedSchema,
    });
    const manifestDigest = await definition.manifestDigest();
    const submitted = { millimeters: 0.2, profile: 'balanced' };
    const pending = validateConfiguration({
      definition,
      manifestDigest,
      formRevision: 1,
      value: submitted,
      explicitPointers: ['/millimeters', '/profile'],
    });
    submitted.millimeters = 900;
    submitted.profile = 'mutated';
    release();
    const result = await pending;
    expect(result).toMatchObject({
      type: 'valid',
      value: { meters: 0.0002, profile: 'balanced' },
    });
    if (result.type === 'valid') {
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });
});

describe('@taucad/runtime/configuration', () => {
  it('should keep a lightweight non-plugin browser root', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
    const offenders = readdirSync(sourceDirectory, {
      encoding: 'utf8',
      recursive: true,
    })
      .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
      .flatMap((name) => {
        const source = readFileSync(join(sourceDirectory, name), 'utf8')
          .replaceAll(/\/\*[\S\s]*?\*\//g, '')
          .replaceAll(/^\s*\/\/.*$/gm, '')
          .replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '');
        return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)]
          .map((match) => match[1]!)
          .filter((specifier) => nodeBuiltins.has(specifier));
      });
    expect(offenders).toEqual([]);
  });
});
