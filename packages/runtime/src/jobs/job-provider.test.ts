import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { z } from 'zod';

import { defineConfiguration } from '#configuration/index.js';
import { resolveRuntimePluginDefinition, runtimePluginDefinitionSymbol } from '#plugins/plugin-runtime-definition.js';

import type { JobProviderAttemptServices, JobProviderExecuteInput } from '#jobs/job-provider.js';
import { defineJobCommand, defineJobProvider, defineJobQuery } from '#jobs/job-provider.js';

type Configuration = { readonly iterations: number };
const configurationSchema: StandardSchemaV1<Configuration, Configuration> &
  StandardJSONSchemaV1<Configuration, Configuration> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof value === 'object' && value !== null && 'iterations' in value && typeof value.iterations === 'number'
        ? { value: { iterations: value.iterations } }
        : { issues: [{ message: 'Invalid configuration' }] },
    jsonSchema: {
      input: () => ({
        type: 'object',
        properties: { iterations: { type: 'number' } },
        required: ['iterations'],
        additionalProperties: false,
      }),
      output: () => ({
        type: 'object',
        properties: { iterations: { type: 'number' } },
        required: ['iterations'],
        additionalProperties: false,
      }),
    },
  },
};

const configuration = defineConfiguration({
  id: 'simulation.cfd.configuration',
  version: '1.0.0',
  schema: configurationSchema,
  ui: { version: 1, rjsf: {} },
});

type RawResult = { readonly raw: number };
type EffectiveResult = { readonly normalized: string };
const resultSchema: StandardSchemaV1<RawResult, EffectiveResult> & StandardJSONSchemaV1<RawResult, EffectiveResult> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: { normalized: String((value as RawResult).raw) } }),
    jsonSchema: {
      input: () => ({
        type: 'object',
        properties: { raw: { type: 'number' } },
        required: ['raw'],
        additionalProperties: false,
      }),
      output: () => ({
        type: 'object',
        properties: { normalized: { type: 'string' } },
        required: ['normalized'],
        additionalProperties: false,
      }),
    },
  },
};

describe('defineJobProvider', () => {
  it('returns a callable capability with plain serializable metadata', () => {
    const provider = defineJobProvider({
      id: 'openfoam.case',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      async execute(input: JobProviderExecuteInput<Configuration>, _services: JobProviderAttemptServices) {
        expectTypeOf(input.configuration).toEqualTypeOf<Configuration>();
        return { raw: input.configuration.iterations };
      },
    });

    expect(provider()).toMatchObject({
      id: 'openfoam.case',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
    });
    expect(structuredClone(provider())).toMatchObject({ id: 'openfoam.case', kind: 'simulation.cfd' });
  });

  it('retains trusted schemas and execution behind the shared non-enumerable ABI slot', async () => {
    const definition = {
      id: 'openfoam.case',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      async execute(input: JobProviderExecuteInput<Configuration>, _services: JobProviderAttemptServices) {
        return { raw: input.configuration.iterations };
      },
    } as const;
    const registration = defineJobProvider(definition)();

    expect(registration[runtimePluginDefinitionSymbol]?.()).toBe(definition);
    expect(Reflect.ownKeys(registration)).toContain(runtimePluginDefinitionSymbol);
  });

  it('allows two providers to implement the same kind without implicit resolution', () => {
    const create = (id: 'slicer-a' | 'slicer-b') =>
      defineJobProvider({
        id,
        kind: 'manufacturing.slice',
        version: '1.0.0',
        kindVersion: 1,
        configuration,
        resultSchema,
        recovery: { type: 'restart-from-input' },
        async execute(input, _services) {
          return { raw: input.configuration.iterations };
        },
      })();

    expect([create('slicer-a').id, create('slicer-b').id]).toEqual(['slicer-a', 'slicer-b']);
  });

  it.each([
    ['an empty id', { id: '', kind: 'simulation.cfd', version: '1.0.0', kindVersion: 1 }],
    ['an empty kind', { id: 'provider', kind: '', version: '1.0.0', kindVersion: 1 }],
    ['an empty version', { id: 'provider', kind: 'simulation.cfd', version: '', kindVersion: 1 }],
    ['a zero kind version', { id: 'provider', kind: 'simulation.cfd', version: '1.0.0', kindVersion: 0 }],
  ])('rejects %s', (_name, identity) => {
    expect(() =>
      defineJobProvider({
        ...identity,
        configuration,
        resultSchema,
        recovery: { type: 'restart-from-input' },
        async execute(input, _services) {
          return { raw: input.configuration.iterations };
        },
      }),
    ).toThrow(TypeError);
  });

  it('requires provider execution to publish raw result-schema input', () => {
    defineJobProvider({
      id: 'typed-result',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      // @ts-expect-error Effective output is produced by authoritative result validation, not by execute.
      async execute(_input, _services): Promise<EffectiveResult> {
        return { normalized: 'already-transformed' };
      },
    });
  });

  it('infers transformed Zod configuration output and raw result input', () => {
    const zodConfiguration = defineConfiguration({
      id: 'zod.configuration',
      version: '1.0.0',
      schema: z.object({ iterations: z.string().transform(Number) }),
      jsonSchema: {
        '~standard': {
          version: 1,
          vendor: 'fixture-json-schema',
          jsonSchema: {
            input: () => ({
              type: 'object',
              properties: { iterations: { type: 'string' } },
              required: ['iterations'],
              additionalProperties: false,
            }),
            output: () => ({
              type: 'object',
              properties: { iterations: { type: 'number' } },
              required: ['iterations'],
              additionalProperties: false,
            }),
          },
        },
      },
      ui: { version: 1, rjsf: {} },
    });
    const provider = defineJobProvider({
      id: 'zod-provider',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration: zodConfiguration,
      resultSchema: z.object({ raw: z.number() }),
      recovery: { type: 'restart-from-input' },
      async execute(input, services) {
        expectTypeOf(input.configuration).toEqualTypeOf<{ iterations: number }>();
        expectTypeOf(services.workspace.readFile).toBeFunction();
        return { raw: input.configuration.iterations };
      },
    });

    expect(provider().configuration.source.id).toBe('zod.configuration');
  });

  it('projects bounded recovery, placement, artifact, query, and command descriptors', () => {
    const provider = defineJobProvider({
      id: 'checkpoint-provider',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: {
        type: 'checkpoint',
        format: 'openfoam-time-directory',
        formatVersion: 1,
        metadataSchema: resultSchema,
        compatible: (metadata) => metadata.normalized.length > 0,
      },
      requirements: [{ key: 'process.native', condition: 'equals', value: true }],
      artifacts: [{ role: 'solver-log', mediaTypes: ['text/plain'], minimum: 0, maximum: 1 }],
      queries: [
        defineJobQuery({
          name: 'catalog',
          inputSchema: resultSchema,
          resultSchema,
          async query(input) {
            expectTypeOf(input).toEqualTypeOf<EffectiveResult>();
            return { raw: Number(input.normalized) };
          },
        }),
      ],
      commands: [
        defineJobCommand({
          name: 'write-now',
          inputSchema: resultSchema,
          resultSchema,
          replayPolicy: 'reconcile-required',
          async command(input, services) {
            expectTypeOf(input.value).toEqualTypeOf<EffectiveResult>();
            expectTypeOf(input.commandId).toBeString();
            expectTypeOf(services.publishCheckpoint).toBeUndefined();
            return { raw: Number(input.value.normalized) };
          },
        }),
      ],
      async execute(input, services) {
        expectTypeOf(services.publishCheckpoint).toBeFunction();
        expectTypeOf(input.resume?.metadata).toEqualTypeOf<EffectiveResult | undefined>();
        return { raw: input.configuration.iterations };
      },
    });
    const descriptor = provider();

    expect(descriptor).toMatchObject({
      resultSchema: { properties: { normalized: { type: 'string' } } },
      recovery: {
        type: 'checkpoint',
        format: 'openfoam-time-directory',
        formatVersion: 1,
        metadataSchema: { properties: { normalized: { type: 'string' } } },
      },
      requirements: [{ key: 'process.native', condition: 'equals', value: true }],
      artifacts: [{ role: 'solver-log', maximum: 1 }],
      queries: [
        {
          name: 'catalog',
          inputSchema: { properties: { raw: { type: 'number' } } },
          resultSchema: { properties: { normalized: { type: 'string' } } },
        },
      ],
      commands: [
        {
          name: 'write-now',
          replayPolicy: 'reconcile-required',
          inputSchema: { properties: { raw: { type: 'number' } } },
          resultSchema: { properties: { normalized: { type: 'string' } } },
        },
      ],
    });
    expectTypeOf(descriptor.queries[0]!.name).toEqualTypeOf<'catalog'>();
    expectTypeOf(descriptor.commands[0]!.name).toEqualTypeOf<'write-now'>();
    expect(Object.isFrozen(descriptor.recovery)).toBe(true);
    expect(structuredClone(descriptor)).toMatchObject({ id: 'checkpoint-provider', kind: 'simulation.cfd' });
  });

  it('preserves heterogeneous extension names, schemas, and trusted handlers', async () => {
    const provider = defineJobProvider({
      id: 'heterogeneous-provider',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      queries: [
        defineJobQuery({
          name: 'by-name',
          inputSchema: z.object({ name: z.string() }),
          resultSchema: z.object({ count: z.number() }),
          async query(input) {
            return { count: input.name.length };
          },
        }),
        defineJobQuery({
          name: 'by-index',
          inputSchema: z.object({ index: z.number() }),
          resultSchema: z.object({ label: z.string() }),
          async query(input) {
            return { label: input.index.toFixed(0) };
          },
        }),
      ],
      commands: [
        defineJobCommand({
          name: 'rename',
          inputSchema: z.object({ name: z.string() }),
          resultSchema: z.object({ revision: z.number() }),
          replayPolicy: 'replay-safe',
          async command(input) {
            return { revision: input.value.name.length };
          },
        }),
        defineJobCommand({
          name: 'resize',
          inputSchema: z.object({ size: z.number() }),
          resultSchema: z.object({ accepted: z.boolean() }),
          replayPolicy: 'reconcile-required',
          async command(input) {
            return { accepted: input.value.size > 0 };
          },
        }),
      ],
      async execute(input) {
        return { raw: input.configuration.iterations };
      },
    });

    const registration = provider();
    expect(registration.queries.map(({ name }) => name)).toEqual(['by-name', 'by-index']);
    expect(registration.commands.map(({ name }) => name)).toEqual(['rename', 'resize']);
    const definition = await resolveRuntimePluginDefinition('job', registration);
    await expect(definition.queries?.[0]?.query({ name: 'tau' })).resolves.toEqual({ count: 3 });
    await expect(definition.queries?.[1]?.query({ index: 7 })).resolves.toEqual({ label: '7' });
    await expect(
      definition.commands?.[1]?.command(
        { commandId: 'command-1', expectedRevision: 1, value: { size: 2 } },
        mock<JobProviderAttemptServices>(),
      ),
    ).resolves.toEqual({ accepted: true });
  });

  it.each([
    ['non-finite requirement', { requirements: [{ key: 'ram', condition: 'at-least', value: Number.NaN }] }],
    [
      'duplicate artifact media type',
      { artifacts: [{ role: 'result', mediaTypes: ['text/plain', 'text/plain'], minimum: 0, maximum: 1 }] },
    ],
  ] as const)('rejects unsafe descriptor declaration: %s', (_name, override) => {
    expect(() =>
      defineJobProvider({
        id: 'invalid-provider',
        kind: 'simulation.cfd',
        version: '1.0.0',
        kindVersion: 1,
        configuration,
        resultSchema,
        recovery: { type: 'restart-from-input' },
        async execute(input, _services) {
          return { raw: input.configuration.iterations };
        },
        ...override,
      }),
    ).toThrow(TypeError);
  });

  it('rejects an invalid checkpoint version', () => {
    expect(() =>
      defineJobProvider({
        id: 'invalid-checkpoint',
        kind: 'simulation.cfd',
        version: '1.0.0',
        kindVersion: 1,
        configuration,
        resultSchema,
        recovery: {
          type: 'checkpoint',
          format: 'checkpoint',
          formatVersion: 0,
          metadataSchema: resultSchema,
          compatible: () => true,
        },
        async execute(input, _services) {
          return { raw: input.configuration.iterations };
        },
      }),
    ).toThrow(TypeError);
  });

  it('rejects declaration values outside the closed JavaScript domain', () => {
    const base = {
      id: 'javascript-boundary',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      async execute(input: JobProviderExecuteInput<Configuration>) {
        return { raw: input.configuration.iterations };
      },
    };
    const invalid = [
      { requirements: [{ key: 'executor', condition: 'equals', value: { nested: true } }] },
      { requirements: [{ key: 'executor', condition: 'one-of', values: ['native', null] }] },
      { requirements: [{ key: 'executor', condition: 'approximately', value: true }] },
      { requirements: [{ key: 42, condition: 'equals', value: true }] },
      {
        commands: [
          {
            name: 'write',
            inputSchema: resultSchema,
            resultSchema,
            replayPolicy: 'sometimes',
            async command() {
              return { raw: 1 };
            },
          },
        ],
      },
      { recovery: { type: 'resume-magically' } },
      {
        recovery: {
          type: 'checkpoint',
          format: 42,
          formatVersion: 1,
          metadataSchema: resultSchema,
          compatible: () => true,
        },
      },
      {
        queries: [
          {
            name: 42,
            inputSchema: resultSchema,
            resultSchema,
            async query() {
              return { raw: 1 };
            },
          },
        ],
      },
      { artifacts: [{ role: {}, mediaTypes: ['text/plain'], minimum: 0, maximum: 1 }] },
    ];
    for (const override of invalid) {
      expect(() => {
        Reflect.apply(defineJobProvider, undefined, [{ ...base, ...override }]);
      }).toThrow(TypeError);
    }
  });

  it('retains false, zero, and empty-string capability scalars', () => {
    const provider = defineJobProvider({
      id: 'scalar-provider',
      kind: 'simulation.cfd',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema,
      recovery: { type: 'restart-from-input' },
      requirements: [
        { key: 'enabled', condition: 'equals', value: false },
        { key: 'minimum', condition: 'equals', value: 0 },
        { key: 'mode', condition: 'equals', value: '' },
      ],
      async execute(input) {
        return { raw: input.configuration.iterations };
      },
    });
    expect(provider().requirements.map(({ condition }) => condition)).toEqual(['equals', 'equals', 'equals']);
  });
});
