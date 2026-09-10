import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { admitJsonSchema, defineConfiguration, validateConfiguration } from '#index.js';

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

const createDefinitionSource = () => ({
  id: 'fixture.fff',
  version: '1.0.0',
  schema,
  ui: { version: 1, rjsf: { profile: { 'ui:widget': 'select' } } },
});

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
    await expect(
      validateConfiguration({
        ...request,
        value: { millimeters: 0.2, profile: 'balanced', extra: true },
      }),
    ).rejects.toThrow('INPUT_INVALID');
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
    await expect(validateConfiguration(request)).rejects.toThrow('INPUT_INVALID');
    const controller = new AbortController();
    controller.abort();
    await expect(validateConfiguration({ ...request, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(validateConfiguration({ ...request, value: { value: Number.NaN } })).rejects.toThrow('finite');
  });
});

describe('@taucad/configuration-core', () => {
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
