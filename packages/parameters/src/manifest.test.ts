import { contentDigest } from '@taucad/cache-core';
import { describe, expect, it } from 'vitest';
import {
  ParameterAdmissionError,
  admitParameterDeclaration,
  admitParameterManifest,
  admitParameterValues,
  compileParameterManifest,
  parameterManifestProfile,
  projectParameterSchemaToDraft7,
  resolveParameterBinding,
} from '@taucad/parameters';
import type { ParameterDeclaration, ParameterProvenance } from '@taucad/parameters';

const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const middlewareDigest = contentDigest({ value: `sha256:${'2'.repeat(64)}` });

const declaration = (): ParameterDeclaration => ({
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'TestParameters',
    type: 'object',
    definitions: {
      nullableLength: { type: 'double', ucumUnit: 'mm' },
    },
    properties: {
      length: {
        type: 'double',
        unit: 'mm',
        ucumUnit: 'mm',
        symbols: { default: 'mm', 'lang:en-NZ': 'millimetres' },
        minimum: 0,
        maximum: 100,
        multipleOf: 0.5,
        enum: [0.5, 2.5, 100],
      },
      copies: { type: 'int32', ucumUnit: '1' },
      optionalLength: {
        type: [{ $ref: '#/definitions/nullableLength' }, 'null'],
      },
      precise: { type: 'decimal', ucumUnit: 'm' },
    },
    required: ['length', 'copies'],
  },
  defaults: { length: 2.5, copies: 2, precise: '0.1' },
  bindings: {
    '/length': {
      parameterId: 'fixture:length',
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      space: 'linear',
      sourceUnitCapability: 'change-source-unit:preserve-size:v1',
    },
  },
});

const semanticProducerDeclaration = (): ParameterDeclaration => ({
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:semantic-producer',
    $uses: ['JSONSchemaUnits'],
    name: 'SemanticProducer',
    type: 'object',
    properties: { length: { type: 'double', ucumUnit: 'mm' } },
  },
  defaults: { length: 2 },
});
const semanticFields = ['quantityKind', 'space', 'reference'] as const;
const semanticOrigins = ['inferred', 'project'] as const;
const semanticAttributionFailures = semanticFields.flatMap((field) =>
  semanticOrigins.flatMap((origin) => ['missing', 'blank'].map((mode) => [field, origin, mode] as const)),
);
const semanticAttributionPositives = semanticFields.flatMap((field) =>
  semanticOrigins.map((origin) => [field, origin] as const),
);

const compile = async (
  value = declaration(),
  resolution = {},
  sourceFiles: Readonly<Record<string, typeof digest | 'missing'>> = {},
) =>
  compileParameterManifest({
    declaration: value,
    scope: {
      kind: 'source',
      authority: 'filesystem',
      root: '/project',
      entry: '/project/model.ts',
    },
    source: {
      id: 'fixture-kernel',
      version: '1.0.0',
      revision: digest,
      capability: 'json-structure',
    },
    dependency: digest,
    middleware: middlewareDigest,
    resolution,
    sourceFiles,
  });

it('admits nested partial values without requiring untouched siblings', async () => {
  const manifest = await compile({
    ...declaration(),
    schema: {
      ...declaration().schema,
      properties: {
        dimensions: {
          type: 'object',
          properties: {
            width: { type: 'double', ucumUnit: 'mm' },
            height: { type: 'double', ucumUnit: 'mm' },
          },
          required: ['width', 'height'],
        },
      },
      required: ['dimensions'],
    },
    defaults: { dimensions: { width: 20, height: 14 } },
    bindings: {},
  });

  expect(() => {
    admitParameterValues(manifest, { dimensions: { width: 21 } });
  }).not.toThrow();
});

describe('native parameter manifest', () => {
  it('binds unknown numeric and array leaves while preserving unsupported decimal execution', async () => {
    const producer = declaration();
    const manifest = await compile({
      ...producer,
      schema: {
        ...producer.schema,
        properties: {
          opaque: { type: 'double' },
          exact: { type: 'decimal' },
          samples: { type: 'array', items: { type: 'double', ucumUnit: 'mm' } },
        },
        required: [],
      },
      defaults: { opaque: 2, exact: '0.1234567890123456789', samples: [1, 2] },
      bindings: {},
    });

    expect(manifest.bindings['/opaque']).toMatchObject({ representation: 'binary64' });
    expect(manifest.bindings['/opaque']).not.toHaveProperty('unit');
    expect(manifest.bindings['/exact']).toMatchObject({ representation: 'decimal' });
    expect(manifest.bindings['/samples/*']).toMatchObject({ unit: 'mm', representation: 'binary64' });
    expect(resolveParameterBinding(manifest, '/samples/1')).toMatchObject({
      unit: 'mm',
      schema: { pointer: '/properties/samples/items' },
      parameter: { stability: 'revision-scoped' },
    });
  });

  it('rejects an invalid explicit unit on an array item', async () => {
    const producer = declaration();
    await expect(
      compile({
        ...producer,
        schema: {
          ...producer.schema,
          properties: { samples: { type: 'array', items: { type: 'double', ucumUnit: 'not-a-unit' } } },
          required: [],
        },
        defaults: { samples: [1] },
        bindings: {},
      }),
    ).rejects.toThrow(ParameterAdmissionError);
  });

  it('admits the public draft token, derives stable bindings, and preserves native values', async () => {
    expect(parameterManifestProfile).toBe('tau-json-structure-units-03-v1');
    expect(() => admitParameterDeclaration(declaration())).not.toThrow();

    const manifest = await compile();
    expect(manifest.defaults).toEqual({
      length: 2.5,
      copies: 2,
      precise: '0.1',
    });
    expect(manifest.dialect).toEqual({
      core: '-04',
      units: '-03',
      activation: 'JSONSchemaUnits',
    });
    expect(manifest.bindings['/length']).toMatchObject({
      parameter: { value: 'fixture:length', stability: 'stable' },
      representation: 'binary64',
      sourceUnitCapability: 'change-source-unit:preserve-size:v1',
      optional: false,
      nullable: false,
      unit: 'mm',
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
    });
    expect(manifest.bindings['/optionalLength']).toMatchObject({
      nullable: true,
      unit: 'mm',
    });
    expect(manifest.bindings['/precise']).toMatchObject({
      representation: 'decimal',
      unit: 'm',
    });
    expect(manifest.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'REPRESENTATION_UNSUPPORTED',
        instancePointer: '/precise',
        severity: 'warning',
      }),
    );
    await expect(admitParameterManifest(structuredClone(manifest))).resolves.toEqual(manifest);
    expect(Object.isFrozen(manifest.bindings['/length'])).toBe(true);
  });

  it('re-admits binding schema locations inside union arrays', async () => {
    const producer = declaration();
    const { properties: _properties, required: _required, ...unionRoot } = producer.schema;
    const branch = {
      type: 'object',
      properties: { value: { type: 'double', ucumUnit: 'mm' } },
      required: ['value'],
    } as const;
    const manifest = await compile({
      ...producer,
      schema: {
        ...unionRoot,
        anyOf: [branch, structuredClone(branch)],
      },
      defaults: { value: 2 },
      bindings: {},
    });

    expect(manifest.bindings['/value']?.schema.pointer).toMatch(/^\/anyOf\/[01]\/properties\/value$/u);
    await expect(admitParameterManifest(structuredClone(manifest))).resolves.toEqual(manifest);
  });

  it('keeps each semantic provenance claim independent', async () => {
    const manifest = await compile();
    const records = Object.values(manifest.provenance);
    expect(records).toContainEqual(expect.objectContaining({ field: 'unit', origin: 'declared' }));
    expect(records).toContainEqual(expect.objectContaining({ field: 'quantity-kind', origin: 'declared' }));
    expect(records).toContainEqual(expect.objectContaining({ field: 'producer' }));
    expect(records).toContainEqual(expect.objectContaining({ field: 'source-revision' }));
  });

  it('retains producer attribution when deriving UCUM from a producer-authored symbol', async () => {
    const symbolDeclaration = structuredClone(declaration()) as {
      schema: { properties: { length: Record<string, unknown> } };
    } & ParameterDeclaration;
    delete symbolDeclaration.schema.properties.length['ucumUnit'];

    const manifest = await compile(symbolDeclaration);

    expect(manifest.bindings['/length']).toMatchObject({ unit: 'mm' });
    expect(Object.values(manifest.provenance)).toContainEqual({
      field: 'unit',
      origin: 'derived',
      producer: 'fixture-kernel',
      sourceRevision: digest,
      profile: parameterManifestProfile,
      rule: 'bipm-symbol-to-ucum',
    });
  });

  it('includes resolution settings in manifest identity and revision', async () => {
    const first = await compile(declaration(), {
      mode: 'default',
      inferenceLanguage: 'en-NZ',
    });
    const second = await compile(declaration(), {
      mode: 'declared-only',
      inferenceLanguage: 'en-NZ',
    });
    const absent = await compile(declaration(), { inferenceLanguage: 'en-NZ' });
    // `mode: 'default'` is the absent mode, so both spellings share one identity.
    expect(first.identity.resolution).toEqual({ inferenceLanguage: 'en-NZ' });
    expect(absent.revision).toBe(first.revision);
    expect(second.identity.resolution).toEqual({ mode: 'declared-only', inferenceLanguage: 'en-NZ' });
    expect(first.revision).not.toBe(second.revision);
  });

  it('binds source and dependency file snapshots into identity and admission', async () => {
    const manifest = await compile(declaration(), {}, { 'main.ts': digest, 'optional.ts': 'missing' });
    expect(manifest.identity.sourceFiles).toEqual({ 'main.ts': digest, 'optional.ts': 'missing' });
    await expect(admitParameterManifest(structuredClone(manifest))).resolves.toEqual(manifest);

    const changed = {
      ...manifest,
      identity: {
        ...manifest.identity,
        sourceFiles: { ...manifest.identity.sourceFiles, 'main.ts': middlewareDigest },
      },
    };
    await expect(admitParameterManifest(changed)).rejects.toThrow(ParameterAdmissionError);
  });

  it.each([
    ['private SDK activation spelling', { $uses: ['JSONStructureUnits'] }, 'INVALID_SCHEMA'],
    [
      'conflicting unit declarations',
      {
        properties: { length: { type: 'double', unit: 'mm', ucumUnit: 'cm' } },
      },
      'METADATA_CONFLICT',
    ],
    [
      'unknown explicit UCUM',
      {
        properties: {
          length: { type: 'double', ucumUnit: 'definitely-not-a-unit' },
        },
      },
      'INVALID_ANNOTATION',
    ],
    [
      'invalid display symbol',
      {
        properties: { length: { type: 'double', ucumUnit: 'mm', symbol: 42 } },
      },
      'INVALID_ANNOTATION',
    ],
    [
      'invalid language tag',
      {
        properties: {
          length: {
            type: 'double',
            ucumUnit: 'mm',
            symbols: { 'lang:not_a_tag': 'x' },
          },
        },
      },
      'INVALID_ANNOTATION',
    ],
    [
      'unknown required semantics',
      {
        properties: {
          length: {
            type: 'double',
            ucumUnit: 'mm',
            unimplementedRequiredSemantics: true,
          },
        },
      },
      'INVALID_SCHEMA',
    ],
  ] as const)('rejects %s', (_name, replacement, code) => {
    const candidate = structuredClone(declaration()) as {
      schema: Record<string, unknown>;
      defaults: Record<string, unknown>;
    };
    Object.assign(candidate.schema, replacement);
    expect(() => admitParameterDeclaration(candidate)).toThrow(ParameterAdmissionError);
    try {
      admitParameterDeclaration(candidate);
    } catch (error) {
      expect((error as ParameterAdmissionError).diagnostics[0]?.code).toBe(code);
    }
  });

  it('rejects direct nullable unit annotations and accepts the qualified reference form', () => {
    const direct = structuredClone(declaration()) as {
      schema: Record<string, unknown>;
      defaults: Record<string, unknown>;
    };
    direct.schema['properties'] = {
      value: { type: ['double', 'null'], ucumUnit: 'mm' },
    };
    expect(() => admitParameterDeclaration(direct)).toThrow(ParameterAdmissionError);
    expect(() => admitParameterDeclaration(declaration())).not.toThrow();
  });

  it.each([
    ['range', { length: -0.5, copies: 2, precise: '0.1' }],
    ['integer lattice', { length: 2.5, copies: 2.5, precise: '0.1' }],
    ['integer width', { length: 2.5, copies: 2 ** 31, precise: '0.1' }],
    ['decimal representation', { length: 2.5, copies: 2, precise: 0.1 }],
    ['decimal lexical shape', { length: 2.5, copies: 2, precise: '1.0oops' }],
  ])('rejects defaults outside the native %s contract', (_name, defaults) => {
    expect(() => admitParameterDeclaration({ ...declaration(), defaults })).toThrow(ParameterAdmissionError);
  });

  it('derives a valid nullable Draft-7 OGC projection with fixed integer bounds', () => {
    const projectable = structuredClone(declaration().schema) as {
      properties: Record<string, unknown>;
    };
    delete projectable.properties['precise'];
    const projected = projectParameterSchemaToDraft7(projectable);
    expect(projected.status).toBe('usable');
    if (projected.status !== 'usable') {
      throw new Error('expected usable projection');
    }
    expect(projected.schema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        length: {
          type: 'number',
          'x-ogc-unit': 'mm',
          'x-ogc-unitLang': 'UCUM',
        },
        copies: {
          type: 'integer',
          minimum: -2_147_483_648,
          maximum: 2_147_483_647,
          'x-ogc-unit': '1',
          'x-ogc-unitLang': 'UCUM',
        },
        optionalLength: {
          anyOf: [{ $ref: '#/definitions/nullableLength' }, { type: 'null' }],
        },
      },
    });
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({ code: 'LEGACY_PROJECTION_LOSS' }));
  });

  it('bounds generic integers to the safe executable range', () => {
    const schema = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:safe-integer',
      $uses: ['JSONSchemaUnits'],
      name: 'SafeInteger',
      type: 'object',
      properties: {
        count: {
          type: 'integer',
          ucumUnit: '1',
          minimum: -10_000_000_000_000_000,
        },
      },
    };
    const projected = projectParameterSchemaToDraft7(schema);

    expect(projected).toMatchObject({
      status: 'usable',
      schema: {
        properties: {
          count: {
            type: 'integer',
            minimum: Number.MIN_SAFE_INTEGER,
            maximum: Number.MAX_SAFE_INTEGER,
          },
        },
      },
    });
    expect(() => admitParameterDeclaration({ schema, defaults: { count: 2 ** 53 } })).toThrow(ParameterAdmissionError);
  });

  it('marks decimal and wide-integer Draft-7 execution as unsupported', () => {
    const projected = projectParameterSchemaToDraft7({
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:unsupported-projection',
      $uses: ['JSONSchemaUnits'],
      name: 'UnsupportedProjection',
      type: 'object',
      properties: {
        precise: { type: 'decimal', ucumUnit: 'm' },
        count: { type: 'int64', ucumUnit: '1' },
      },
    });
    expect(projected.status).toBe('unsupported');
    expect(projected.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REPRESENTATION_UNSUPPORTED',
          schemaPointer: '/properties/precise/type',
        }),
        expect.objectContaining({
          code: 'LEGACY_PROJECTION_LOSS',
          schemaPointer: '/properties/count/type',
        }),
      ]),
    );
  });

  it('resolves supplied resources offline and diagnoses cycles and missing resources', async () => {
    const external = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:external',
      $uses: ['JSONSchemaUnits'],
      name: 'ExternalParameters',
      type: 'double',
      ucumUnit: 'cm',
    };
    const withResource: ParameterDeclaration = {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:taucad:test:resource-root',
        $uses: ['JSONSchemaUnits'],
        name: 'ResourceRoot',
        type: 'object',
        properties: { offset: { type: { $ref: 'urn:taucad:test:external' } } },
      },
      resources: { 'urn:taucad:test:external': external },
      defaults: { offset: 2 },
    };
    const manifest = await compile(withResource);
    expect(manifest.bindings['/offset']).toMatchObject({
      unit: 'cm',
      schema: { resource: 'urn:taucad:test:external', pointer: '' },
    });

    const missing = structuredClone(withResource) as {
      schema: Record<string, unknown>;
      defaults: Record<string, unknown>;
      resources?: unknown;
    };
    delete missing.resources;
    expect(() => admitParameterDeclaration(missing)).toThrow(ParameterAdmissionError);

    const cyclic = structuredClone(declaration()) as {
      schema: Record<string, unknown>;
      defaults: Record<string, unknown>;
    };
    cyclic.schema['definitions'] = {
      loop: { type: { $ref: '#/definitions/loop' } },
    };
    cyclic.schema['properties'] = {
      loop: { type: { $ref: '#/definitions/loop' } },
    };
    expect(() => admitParameterDeclaration(cyclic)).toThrow(ParameterAdmissionError);
  });

  it('canonically re-admits tables and rejects forged authority with stale revisions', async () => {
    const manifest = await compile();
    const changedUnit = {
      ...manifest,
      bindings: {
        ...manifest.bindings,
        '/length': { ...manifest.bindings['/length']!, unit: 'cm' },
      },
    };
    await expect(admitParameterManifest(changedUnit)).rejects.toThrow(ParameterAdmissionError);

    const changedSource = {
      ...manifest,
      source: { ...manifest.source, id: 'forged-kernel' },
    };
    await expect(admitParameterManifest(changedSource)).rejects.toThrow(ParameterAdmissionError);

    await expect(
      admitParameterManifest({
        ...manifest,
        source: { ...manifest.source, unsupportedAuthority: 'forged' },
      }),
    ).rejects.toThrow(ParameterAdmissionError);

    const deletedProvenance = { ...manifest, provenance: {} };
    await expect(admitParameterManifest(deletedProvenance)).rejects.toThrow(ParameterAdmissionError);

    const changedIdentity = {
      ...manifest,
      bindings: {
        ...manifest.bindings,
        '/length': {
          ...manifest.bindings['/length']!,
          parameter: {
            ...manifest.bindings['/length']!.parameter,
            value: 'forged:parameter',
          },
          quantityKind: 'http://qudt.org/vocab/quantitykind/Time',
        },
      },
    };
    await expect(admitParameterManifest(changedIdentity)).rejects.toThrow(ParameterAdmissionError);

    const extraBinding = {
      ...manifest,
      bindings: {
        ...manifest.bindings,
        '/alias': {
          ...manifest.bindings['/length']!,
          parameter: { value: 'forged:alias', stability: 'stable' } as const,
        },
      },
    };
    await expect(admitParameterManifest(extraBinding)).rejects.toThrow(ParameterAdmissionError);

    const invalidDefaults = {
      ...manifest,
      defaults: { length: -5, copies: 1000, precise: 4 },
    };
    await expect(admitParameterManifest(invalidDefaults)).rejects.toThrow(ParameterAdmissionError);
    expect(() =>
      admitParameterDeclaration({
        ...declaration(),
        defaults: invalidDefaults.defaults,
      }),
    ).toThrow(ParameterAdmissionError);

    const projectable = structuredClone(declaration()) as unknown as {
      schema: { properties: Record<string, unknown> };
      defaults: Record<string, unknown>;
    };
    delete projectable.schema.properties['precise'];
    delete projectable.defaults['precise'];
    const projectedManifest = await compile(projectable);
    const changedProjection = structuredClone(projectedManifest) as unknown as {
      legacyProjection: {
        schema: { properties: { length: Record<string, unknown> } };
      };
    };
    changedProjection.legacyProjection.schema.properties.length['x-ogc-unit'] = 'cm';
    await expect(admitParameterManifest(changedProjection)).rejects.toThrow(ParameterAdmissionError);
  });

  it('requires exact producer resource structure while allowing attributed binding enrichment', async () => {
    const producerDeclaration = declaration();
    const producer = await compile(producerDeclaration);
    const addedResource: ParameterDeclaration = {
      ...producerDeclaration,
      resources: {
        'urn:taucad:test:unused': {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:unused',
          $uses: ['JSONSchemaUnits'],
          name: 'Unused',
          type: 'double',
        },
      },
    };
    const candidate = await compile(addedResource);

    await expect(
      admitParameterManifest(candidate, {
        scope: producer.scope,
        source: producer.source,
        identity: producer.identity,
        producerDeclaration,
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'METADATA_CONFLICT',
          schemaPointer: '/resources',
        }),
      ],
    });
  });

  it('rejects a source-unit capability added outside the declaration owner', async () => {
    const producerDeclaration = structuredClone(declaration());
    Reflect.deleteProperty(producerDeclaration.bindings?.['/length'] ?? {}, 'sourceUnitCapability');
    const producer = await compile(producerDeclaration);
    const candidate = await compile({
      ...producerDeclaration,
      bindings: {
        ...producerDeclaration.bindings,
        '/length': {
          ...producerDeclaration.bindings?.['/length'],
          sourceUnitCapability: 'change-source-unit:preserve-size:v1',
        },
      },
    });

    await expect(
      admitParameterManifest(candidate, {
        scope: producer.scope,
        source: producer.source,
        identity: producer.identity,
        producerDeclaration,
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'METADATA_CONFLICT',
          schemaPointer: '/bindingDeclarations/~1length/sourceUnitCapability',
        }),
      ],
    });
  });

  it('rejects derived-only unit backfill without project or inference authority', async () => {
    const producerDeclaration = structuredClone(declaration()) as {
      schema: { properties: { length: Record<string, unknown> } };
      bindings?: ParameterDeclaration['bindings'];
    } & ParameterDeclaration;
    delete producerDeclaration.schema.properties.length['unit'];
    delete producerDeclaration.schema.properties.length['ucumUnit'];
    delete producerDeclaration.bindings;
    const producer = await compile(producerDeclaration);
    const candidate = await compile({
      ...producerDeclaration,
      bindings: {
        '/length': {
          unit: 'mm',
          provenance: {
            unit: {
              origin: 'derived',
              producer: 'symbol-only-rule',
              sourceRevision: producer.source.revision,
              profile: producer.profile,
              rule: 'bipm-symbol-to-ucum',
            },
          },
        },
      },
    });

    await expect(
      admitParameterManifest(candidate, {
        scope: producer.scope,
        source: producer.source,
        identity: producer.identity,
        producerDeclaration,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'METADATA_CONFLICT' })],
    });
  });

  it.each([
    [
      'missing inferred profile',
      {
        origin: 'inferred',
        producer: 'rule',
        sourceRevision: digest,
        rule: 'length',
        evidence: 'length',
      },
    ],
    [
      'missing inferred rule',
      {
        origin: 'inferred',
        producer: 'rule',
        sourceRevision: digest,
        profile: parameterManifestProfile,
        evidence: 'length',
      },
    ],
    [
      'missing inferred evidence',
      {
        origin: 'inferred',
        producer: 'rule',
        sourceRevision: digest,
        profile: parameterManifestProfile,
        rule: 'length',
      },
    ],
    [
      'empty inferred producer',
      {
        origin: 'inferred',
        producer: '',
        sourceRevision: digest,
        profile: parameterManifestProfile,
        rule: 'length',
        evidence: 'length',
      },
    ],
    [
      'empty inferred source revision',
      {
        origin: 'inferred',
        producer: 'rule',
        sourceRevision: '',
        profile: parameterManifestProfile,
        rule: 'length',
        evidence: 'length',
      },
    ],
    [
      'empty project evidence',
      {
        origin: 'project',
        producer: 'project.json',
        sourceRevision: digest,
        evidence: '',
      },
    ],
  ])('rejects a unit claim with %s', async (_label, provenance) => {
    const producerDeclaration = structuredClone(declaration()) as {
      schema: { properties: { length: Record<string, unknown> } };
      bindings?: ParameterDeclaration['bindings'];
    } & ParameterDeclaration;
    delete producerDeclaration.schema.properties.length['unit'];
    delete producerDeclaration.schema.properties.length['ucumUnit'];
    delete producerDeclaration.bindings;

    await expect(
      compile({
        ...producerDeclaration,
        bindings: {
          '/length': { unit: 'mm', provenance: { unit: provenance } },
        },
      } as unknown as ParameterDeclaration),
    ).rejects.toThrow(ParameterAdmissionError);
  });

  it.each([
    {
      origin: 'inferred',
      producer: 'unit-rule',
      sourceRevision: digest,
      profile: parameterManifestProfile,
      rule: 'identifier-length',
      evidence: 'model.ts#/length',
    },
    {
      origin: 'project',
      producer: 'project.json',
      sourceRevision: digest,
      evidence: 'project.json#/bindings/length',
    },
  ] as const)('preserves a complete $origin unit claim', async (provenance) => {
    const producerDeclaration = structuredClone(declaration()) as {
      schema: { properties: { length: Record<string, unknown> } };
      bindings?: ParameterDeclaration['bindings'];
    } & ParameterDeclaration;
    delete producerDeclaration.schema.properties.length['unit'];
    delete producerDeclaration.schema.properties.length['ucumUnit'];
    delete producerDeclaration.bindings;
    const producer = await compile(producerDeclaration);
    const candidate = await compile({
      ...producerDeclaration,
      bindings: { '/length': { unit: 'mm', provenance: { unit: provenance } } },
    });

    const admitted = await admitParameterManifest(candidate, {
      scope: producer.scope,
      source: producer.source,
      identity: producer.identity,
      producerDeclaration,
    });

    expect(Object.values(admitted.provenance)).toContainEqual({
      field: 'unit',
      ...provenance,
    });
  });

  it.each(semanticAttributionFailures)(
    'rejects %s %s attribution when required values are %s',
    async (field, origin, mode) => {
      const producerDeclaration = semanticProducerDeclaration();
      const values = {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        space: 'linear',
        reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
      } as const;
      const provenance =
        origin === 'inferred'
          ? mode === 'missing'
            ? { origin, producer: 'semantic-rule', sourceRevision: digest }
            : {
                origin,
                producer: 'semantic-rule',
                sourceRevision: digest,
                profile: ' ',
                rule: ' ',
                evidence: ' ',
              }
          : mode === 'missing'
            ? { origin, producer: 'project.json', sourceRevision: digest }
            : { origin, producer: ' ', sourceRevision: ' ', evidence: ' ' };
      const binding = {
        [field]: values[field],
        ...(field === 'reference' ? { space: 'point' } : {}),
        provenance: {
          ...(field === 'reference'
            ? {
                space: {
                  origin: 'project',
                  producer: 'project.json',
                  sourceRevision: digest,
                  evidence: 'project.json#/bindings/length/space',
                },
              }
            : {}),
          [field]: provenance,
        },
      };

      await expect(
        compile({
          ...producerDeclaration,
          bindings: { '/length': binding },
        } as unknown as ParameterDeclaration),
      ).rejects.toThrow(ParameterAdmissionError);
    },
  );

  it.each(semanticAttributionPositives)('preserves complete %s %s attribution', async (field, origin) => {
    const producerDeclaration = semanticProducerDeclaration();
    const producer = await compile(producerDeclaration);
    const values = {
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      space: 'linear',
      reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
    } as const;
    const provenance: Omit<ParameterProvenance, 'field'> =
      origin === 'inferred'
        ? {
            origin,
            producer: 'semantic-rule',
            sourceRevision: digest,
            profile: parameterManifestProfile,
            rule: `${field}-rule`,
            evidence: `model.ts#/length/${field}`,
          }
        : {
            origin,
            producer: 'project.json',
            sourceRevision: digest,
            evidence: `project.json#/bindings/length/${field}`,
          };
    const binding = {
      [field]: values[field],
      ...(field === 'reference' ? { space: 'point' } : {}),
      provenance: {
        ...(field === 'reference'
          ? {
              space: {
                origin: 'project',
                producer: 'project.json',
                sourceRevision: digest,
                evidence: 'project.json#/bindings/length/space',
              },
            }
          : {}),
        [field]: provenance,
      },
    };
    const candidate = await compile({
      ...producerDeclaration,
      bindings: { '/length': binding },
    } as unknown as ParameterDeclaration);

    const admitted = await admitParameterManifest(candidate, {
      scope: producer.scope,
      source: producer.source,
      identity: producer.identity,
      producerDeclaration,
    });

    expect(Object.values(admitted.provenance)).toContainEqual({
      field: field === 'quantityKind' ? 'quantity-kind' : field,
      ...provenance,
    });
  });

  it.each([
    ['internal', false],
    ['internal', true],
    ['external', false],
    ['external', true],
  ] as const)('retains per-instance provenance for %s shared references in reverse order %s', async (kind, reverse) => {
    const shared = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:shared-number',
      $uses: ['JSONSchemaUnits'],
      name: 'SharedNumber',
      type: 'double',
    };
    const reference = kind === 'internal' ? '#/definitions/shared' : shared.$id;
    const entries = [
      ['length', { type: { $ref: reference } }],
      ['width', { type: { $ref: reference } }],
    ] as const;
    const producerDeclaration: ParameterDeclaration = {
      schema: {
        ...shared,
        $id: 'urn:taucad:test:shared-root',
        name: 'SharedRoot',
        type: 'object',
        ...(kind === 'internal' ? { definitions: { shared } } : {}),
        properties: Object.fromEntries(reverse ? entries.toReversed() : entries),
      },
      ...(kind === 'external' ? { resources: { [shared.$id]: shared } } : {}),
      defaults: { length: 2, width: 3 },
    };
    const provenance = (name: string, field: string): Omit<ParameterProvenance, 'field'> => ({
      origin: 'inferred',
      producer: `${name}-${field}`,
      sourceRevision: digest,
      profile: parameterManifestProfile,
      rule: `${name}-${field}`,
      evidence: `model.ts#/${name}`,
    });
    const binding = (name: string, unit: string): NonNullable<ParameterDeclaration['bindings']>[string] => ({
      unit,
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      space: 'point',
      reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
      provenance: {
        unit: provenance(name, 'unit'),
        quantityKind: provenance(name, 'kind'),
        space: provenance(name, 'space'),
        reference: provenance(name, 'reference'),
      },
    });
    const bindings: NonNullable<ParameterDeclaration['bindings']> = reverse
      ? {
          '/width': binding('width', 'cm'),
          '/length': binding('length', 'mm'),
        }
      : {
          '/length': binding('length', 'mm'),
          '/width': binding('width', 'cm'),
        };
    const producer = await compile(producerDeclaration);
    const candidate = await compile({ ...producerDeclaration, bindings });

    const admitted = await admitParameterManifest(candidate, {
      scope: producer.scope,
      source: producer.source,
      identity: producer.identity,
      producerDeclaration,
    });

    expect(admitted.bindings['/length']).toMatchObject({
      unit: 'mm',
      space: 'point',
    });
    expect(admitted.bindings['/width']).toMatchObject({
      unit: 'cm',
      space: 'point',
    });
    for (const field of ['unit', 'quantity-kind', 'space', 'reference']) {
      expect(Object.values(admitted.provenance).filter((record) => record.field === field)).toHaveLength(2);
    }
    expect(Object.keys(admitted.provenance)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/@binding/~1length/@unit'),
        expect.stringContaining('/@binding/~1width/@unit'),
      ]),
    );
  });

  it.each(['internal', 'external'] as const)('keeps %s producer-schema provenance shared', async (kind) => {
    const shared = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:shared-declared-number',
      $uses: ['JSONSchemaUnits'],
      name: 'SharedDeclaredNumber',
      type: 'double',
      ucumUnit: 'mm',
    };
    const reference = kind === 'internal' ? '#/definitions/shared' : shared.$id;
    const manifest = await compile({
      schema: {
        $schema: shared.$schema,
        $id: 'urn:taucad:test:shared-declared-root',
        $uses: shared.$uses,
        name: 'SharedDeclaredRoot',
        type: 'object',
        ...(kind === 'internal' ? { definitions: { shared } } : {}),
        properties: {
          length: { type: { $ref: reference } },
          width: { type: { $ref: reference } },
        },
      },
      ...(kind === 'external' ? { resources: { [shared.$id]: shared } } : {}),
      defaults: { length: 2, width: 3 },
    });

    expect(manifest.bindings['/length']?.unit).toBe('mm');
    expect(manifest.bindings['/width']?.unit).toBe('mm');
    expect(Object.values(manifest.provenance).filter((record) => record.field === 'unit')).toHaveLength(1);
    expect(Object.keys(manifest.provenance)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('/@binding/')]),
    );
  });

  it.each([
    ['internal', false],
    ['internal', true],
    ['external', false],
    ['external', true],
  ] as const)('rejects an unattributed %s shared-reference sibling in reverse order %s', async (kind, reverse) => {
    const shared = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:shared-number',
      $uses: ['JSONSchemaUnits'],
      name: 'SharedNumber',
      type: 'double',
    };
    const reference = kind === 'internal' ? '#/definitions/shared' : shared.$id;
    const entries = [
      ['length', { type: { $ref: reference } }],
      ['width', { type: { $ref: reference } }],
    ] as const;
    const producerDeclaration: ParameterDeclaration = {
      schema: {
        ...shared,
        $id: 'urn:taucad:test:shared-root',
        name: 'SharedRoot',
        type: 'object',
        ...(kind === 'internal' ? { definitions: { shared } } : {}),
        properties: Object.fromEntries(reverse ? entries.toReversed() : entries),
      },
      ...(kind === 'external' ? { resources: { [shared.$id]: shared } } : {}),
      defaults: { length: 2, width: 3 },
    };
    const attributed: Omit<ParameterProvenance, 'field'> = {
      origin: 'inferred',
      producer: 'length-unit',
      sourceRevision: digest,
      profile: parameterManifestProfile,
      rule: 'length-unit',
      evidence: 'model.ts#/length',
    };
    const bindings: NonNullable<ParameterDeclaration['bindings']> = reverse
      ? {
          '/width': { unit: 'cm' },
          '/length': { unit: 'mm', provenance: { unit: attributed } },
        }
      : {
          '/length': { unit: 'mm', provenance: { unit: attributed } },
          '/width': { unit: 'cm' },
        };
    const producer = await compile(producerDeclaration);
    const candidate = await compile({ ...producerDeclaration, bindings });

    await expect(
      admitParameterManifest(candidate, {
        scope: producer.scope,
        source: producer.source,
        identity: producer.identity,
        producerDeclaration,
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'METADATA_CONFLICT',
          schemaPointer: '/bindingDeclarations/~1width/unit',
        }),
      ],
    });
  });

  it('bounds hostile schemas and rejects malformed post-boundary tables', async () => {
    let nested: Record<string, unknown> = { type: 'double' };
    for (let index = 0; index < 70; index += 1) {
      nested = { properties: { child: nested }, type: 'object' };
    }
    const oversized = declaration();
    expect(() =>
      admitParameterDeclaration({
        ...oversized,
        schema: { ...oversized.schema, properties: { nested } },
      }),
    ).toThrow('PARAMETER_MANIFEST_LIMIT');

    const manifest = await compile();
    await expect(
      admitParameterManifest({
        ...manifest,
        bindings: { '/length': { unit: 'mm' } },
      }),
    ).rejects.toThrow(ParameterAdmissionError);
    await expect(
      admitParameterManifest({
        ...manifest,
        identity: { ...manifest.identity, resolution: { mode: 'invented' } },
      }),
    ).rejects.toThrow(ParameterAdmissionError);
  });
});
