import { contentDigest } from '@taucad/cache-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParameterAdmissionError, admitParameterValues, compileParameterManifest } from '@taucad/parameters';
import { validateJsonSchemaValue } from '#schema-admission.js';
import type * as JsonSchemaModule from '@cfworker/json-schema';
import type * as JsonStructureModule from '@json-structure/sdk';

const constructed = vi.hoisted(() => ({ jsonSchema: 0, jsonStructure: 0 }));

vi.mock('@cfworker/json-schema', async (importOriginal) => {
  const original = await importOriginal<typeof JsonSchemaModule>();
  class Validator extends original.Validator {
    public constructor(...parameters: ConstructorParameters<typeof original.Validator>) {
      super(...parameters);
      constructed.jsonSchema += 1;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the library's exported class.
  return { ...original, Validator };
});

vi.mock('@json-structure/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof JsonStructureModule>();
  class InstanceValidator extends original.InstanceValidator {
    public constructor(...parameters: ConstructorParameters<typeof original.InstanceValidator>) {
      super(...parameters);
      constructed.jsonStructure += 1;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the library's exported class.
  return { ...original, InstanceValidator };
});

const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });

beforeEach(() => {
  constructed.jsonSchema = 0;
  constructed.jsonStructure = 0;
});

describe('validateJsonSchemaValue', () => {
  it('should compile a frozen schema once across calls', () => {
    const schema = Object.freeze({ type: 'number', maximum: 5 });

    expect(validateJsonSchemaValue(schema, 4)).toBe(true);
    expect(validateJsonSchemaValue(schema, 6)).toBe(false);
    expect(constructed.jsonSchema).toBe(1);
  });

  it('should compile a mutable schema on every call so later edits are honoured', () => {
    const schema: Record<string, unknown> = { type: 'number', maximum: 5 };

    expect(validateJsonSchemaValue(schema, 6)).toBe(false);
    schema['maximum'] = 10;

    expect(validateJsonSchemaValue(schema, 6)).toBe(true);
    expect(constructed.jsonSchema).toBe(2);
  });
});

describe('admitParameterValues', () => {
  it('should prepare default validation once per admitted manifest', async () => {
    const manifest = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:validator-reuse',
          $uses: ['JSONSchemaUnits'],
          name: 'ValidatorReuse',
          type: 'object',
          properties: { length: { type: 'double', ucumUnit: 'mm', minimum: 0, maximum: 100 } },
          required: ['length'],
        },
        defaults: { length: 2 },
      },
      scope: { kind: 'source', authority: 'filesystem', root: '/project', entry: '/project/model.ts' },
      source: { id: 'fixture-kernel', version: '1.0.0', revision: digest, capability: 'json-structure' },
      dependency: digest,
      middleware: digest,
      resolution: {},
      sourceFiles: {},
    });
    constructed.jsonStructure = 0;

    admitParameterValues(manifest, { length: 3 });
    admitParameterValues(manifest, { length: 4 });

    expect(() => {
      admitParameterValues(manifest, { length: 101 });
    }).toThrow(ParameterAdmissionError);
    expect(constructed.jsonStructure).toBe(1);
  });
});
