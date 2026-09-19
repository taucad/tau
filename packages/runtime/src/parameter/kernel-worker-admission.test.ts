/* oxlint-disable no-restricted-imports, import/extensions -- focused runtime-private pipeline fixture */
import { describe, expect, it, vi } from 'vitest';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterDeclaration, ParameterProvenance } from '@taucad/parameters';
import type { OnWorkerLog } from '@taucad/types';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import { _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { KernelRuntime, GetParametersInput } from '#types/runtime-kernel.types.js';
import type { GetParameterDeclarationsResult, GetParametersResult } from '#types/runtime.types.js';
import type { ComputeStore } from '#types/runtime-compute.types.js';
import {
  MockKernelWorker,
  createGeometryFile,
  createMockFileSystem,
  createParameterDeclaration,
} from '../../test/support/kernel-worker.fixture.js';
import type { MockKernelWorkerOptions } from '../../test/support/kernel-worker.fixture.js';

class CountingParameterWorker extends MockKernelWorker {
  public calls = 0;
  public declaration: GetParameterDeclarationsResult = createParameterDeclaration(
    { length: 2.5 },
    { properties: { length: { type: 'double', ucumUnit: 'mm' } }, required: ['length'] },
  );

  protected override async onGetParameters(
    _input: GetParametersInput,
    _runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult> {
    this.calls += 1;
    return this.declaration;
  }
}

const createWorker = (
  middleware: MockKernelWorkerOptions['middleware'] = [],
  middlewareConfigs?: MockKernelWorkerOptions['middlewareConfigs'],
  onLog: OnWorkerLog = () => undefined,
) => {
  const filesystem = Object.assign(createMockFileSystem(), {
    watch: vi.fn(() => vi.fn()),
  });
  filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, new TextEncoder().encode(`source:${path}`)])),
  );
  const worker = new CountingParameterWorker({ middleware, middlewareConfigs, onLog, filesystem });
  // @ts-expect-error -- white-box fixture installs the same watch-capable filesystem on the runtime seam.
  worker.fileSystem = filesystem;
  return worker;
};
const parameterCacheUrl = new URL('../../../plugins/middleware/src/parameter-cache.middleware.ts', import.meta.url)
  .href;
const parameterUnitsUrl = new URL('../../../plugins/middleware/src/parameter-units.middleware.ts', import.meta.url)
  .href;
const loadExternalMiddleware = async (
  moduleUrl: string,
  exportName: string,
): Promise<MockKernelWorkerOptions['middleware'][number]> => {
  const loaded: unknown = await import(/* @vite-ignore */ moduleUrl);
  if (loaded === null || typeof loaded !== 'object' || !(exportName in loaded)) {
    throw new Error(`External middleware module is missing '${exportName}'.`);
  }
  return (loaded as Record<string, MockKernelWorkerOptions['middleware'][number]>)[exportName]!;
};
const semanticFields = ['quantityKind', 'space', 'reference'] as const;
const semanticOrigins = ['inferred', 'project'] as const;
const semanticAttributionFailures = semanticFields.flatMap((field) =>
  semanticOrigins.flatMap((origin) => ['missing', 'blank'].map((mode) => [field, origin, mode] as const)),
);
const semanticAttributionPositives = semanticFields.flatMap((field) =>
  semanticOrigins.map((origin) => [field, origin] as const),
);

describe('parameter admission in the kernel worker', () => {
  it('admits the producer declaration before returning it through middleware', async () => {
    const observedProfiles: unknown[] = [];
    const middleware = defineMiddleware({
      id: 'observe-manifest',
      name: 'observe-manifest',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        observedProfiles.push(result.success ? result.data.profile : undefined);
        return result;
      },
    });
    const worker = createWorker([middleware()]);
    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    expect(observedProfiles).toEqual(['tau-json-structure-units-03-v1']);
    if (result.success) {
      expect(result.data.bindings['/length']).toMatchObject({ unit: 'mm', representation: 'binary64' });
    }
  });

  it('fails closed before middleware can receive an invalid declaration', async () => {
    let receivedSuccess = false;
    const middleware = defineMiddleware({
      id: 'observe-invalid',
      name: 'observe-invalid',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        receivedSuccess = result.success;
        return result;
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      {},
      {
        properties: { length: { type: 'double', ucumUnit: 'not-a-unit' } },
      },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));
    expect(result.success).toBe(false);
    expect(receivedSuccess).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'RUNTIME', type: 'kernel' });
  });

  it('re-admits middleware output before caching it', async () => {
    const middleware = defineMiddleware({
      id: 'break-manifest',
      name: 'break-manifest',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        return {
          ...result,
          data: { ...result.data, bindings: { '/length': { unit: 'mm' } } },
        } as unknown as GetParametersResult;
      },
    });
    const worker = createWorker([middleware()]);

    const first = await worker.getParameters(createGeometryFile('main.ts'));
    const second = await worker.getParameters(createGeometryFile('main.ts'));
    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(worker.calls).toBe(2);
  });

  it('rejects a canonical manifest whose source identity differs from trusted execution context', async () => {
    const middleware = defineMiddleware({
      id: 'forge-source',
      name: 'forge-source',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: manifest.bindingDeclarations,
            },
            scope: manifest.scope,
            source: { ...manifest.source, id: 'forged-kernel' },
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'RUNTIME',
        type: 'kernel',
        details: [expect.objectContaining({ code: 'METADATA_CONFLICT', schemaPointer: '/identity' })],
      }),
    );
  });

  it('rejects self-consistent middleware replacement of the producer declaration', async () => {
    const middleware = defineMiddleware({
      id: 'replace-producer-declaration',
      name: 'replace-producer-declaration',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: {
                ...manifest.schema,
                properties: { length: { type: 'double', ucumUnit: 'cm' } },
              },
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  parameterId: 'forged:length',
                  quantityKind: 'http://qudt.org/vocab/quantitykind/Time',
                  space: 'linear',
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          details: [
            expect.objectContaining({
              code: 'METADATA_CONFLICT',
              schemaPointer: '/schema',
            }),
          ],
        },
      ],
    });
  });

  it('rejects numeric constraints added by middleware', async () => {
    const middleware = defineMiddleware({
      id: 'add-constraint',
      name: 'add-constraint',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: {
                ...manifest.schema,
                properties: { length: { type: 'double', ucumUnit: 'mm', maximum: 3 } },
              },
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: manifest.bindingDeclarations,
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result).toMatchObject({
      success: false,
      issues: [{ details: [expect.objectContaining({ code: 'METADATA_CONFLICT', schemaPointer: '/schema' })] }],
    });
  });

  it('rejects requiredness added by middleware', async () => {
    const middleware = defineMiddleware({
      id: 'add-required',
      name: 'add-required',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: { ...manifest.schema, required: ['length'] },
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: manifest.bindingDeclarations,
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double', ucumUnit: 'mm' } } },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result).toMatchObject({
      success: false,
      issues: [{ details: [expect.objectContaining({ code: 'METADATA_CONFLICT', schemaPointer: '/schema' })] }],
    });
  });

  it.each(['unit', 'ucumUnit'] as const)('rejects an unattributed %s schema addition', async (field) => {
    const middleware = defineMiddleware({
      id: `add-schema-${field}`,
      name: `add-schema-${field}`,
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: {
                ...manifest.schema,
                properties: { length: { type: 'double', [field]: 'mm' } },
              },
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: manifest.bindingDeclarations,
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double' } }, required: ['length'] },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result).toMatchObject({
      success: false,
      issues: [{ details: [expect.objectContaining({ code: 'METADATA_CONFLICT', schemaPointer: '/schema' })] }],
    });
  });

  it('rejects an added binding unit without independent provenance', async () => {
    const middleware = defineMiddleware({
      id: 'add-unattributed-unit',
      name: 'add-unattributed-unit',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: { '/length': { unit: 'mm' } },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double' } }, required: ['length'] },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
    expect(result.issues[0]?.code).toBe('RUNTIME');
    expect(result.issues[0]?.message).toContain('METADATA_CONFLICT at /bindingDeclarations/~1length/unit');
  });

  it('admits an independently attributed inferred binding unit', async () => {
    const middleware = defineMiddleware({
      id: 'infer-binding-unit',
      name: 'infer-binding-unit',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  unit: 'mm',
                  provenance: {
                    unit: {
                      origin: 'inferred',
                      producer: 'infer-binding-unit',
                      sourceRevision: manifest.source.revision,
                      profile: manifest.profile,
                      rule: 'identifier-suffix-mm',
                      evidence: 'main.ts#/length',
                    },
                  },
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double' } }, required: ['length'] },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bindings['/length']).toMatchObject({
        parameter: { value: `${result.data.source.revision}:/length`, stability: 'revision-scoped' },
        unit: 'mm',
        constraints: {},
      });
      expect(Object.values(result.data.provenance)).toContainEqual({
        field: 'unit',
        origin: 'inferred',
        producer: 'infer-binding-unit',
        sourceRevision: result.data.source.revision,
        profile: result.data.profile,
        rule: 'identifier-suffix-mm',
        evidence: 'main.ts#/length',
      });
    }
  });

  it.each([
    [
      'inferred unit without rule',
      {
        origin: 'inferred',
        producer: 'incomplete-rule',
        sourceRevision: `sha256:${'1'.repeat(64)}`,
        profile: 'tau-json-structure-units-03-v1',
        evidence: 'main.ts#/length',
      },
    ],
    [
      'inferred unit with empty evidence',
      {
        origin: 'inferred',
        producer: 'incomplete-rule',
        sourceRevision: `sha256:${'1'.repeat(64)}`,
        profile: 'tau-json-structure-units-03-v1',
        rule: 'identifier-suffix-mm',
        evidence: '',
      },
    ],
    [
      'project unit with empty attribution',
      {
        origin: 'project',
        producer: '',
        sourceRevision: `sha256:${'1'.repeat(64)}`,
        evidence: '',
      },
    ],
  ])('rejects an %s through real worker admission', async (_label, provenance) => {
    const middleware = defineMiddleware({
      id: 'incomplete-unit-provenance',
      name: 'incomplete-unit-provenance',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  unit: 'mm',
                  provenance: { unit: provenance as Omit<ParameterProvenance, 'field'> },
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double' } }, required: ['length'] },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
  });

  it('admits a completely attributed project unit through real worker admission', async () => {
    const middleware = defineMiddleware({
      id: 'project-binding-unit',
      name: 'project-binding-unit',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  unit: 'mm',
                  provenance: {
                    unit: {
                      origin: 'project',
                      producer: 'project.json',
                      sourceRevision: manifest.source.revision,
                      evidence: 'project.json#/bindings/length',
                    },
                  },
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);
    worker.declaration = createParameterDeclaration(
      { length: 2.5 },
      { properties: { length: { type: 'double' } }, required: ['length'] },
    );

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.values(result.data.provenance)).toContainEqual({
        field: 'unit',
        origin: 'project',
        producer: 'project.json',
        sourceRevision: result.data.source.revision,
        evidence: 'project.json#/bindings/length',
      });
    }
  });

  it.each([
    ['internal', false],
    ['internal', true],
    ['external', false],
    ['external', true],
  ] as const)('rejects an unattributed %s shared-reference sibling in reverse order %s', async (kind, reverse) => {
    const middleware = defineMiddleware({
      id: `shared-reference-${kind}-${String(reverse)}`,
      name: `shared-reference-${kind}-${String(reverse)}`,
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        const attributed: Omit<ParameterProvenance, 'field'> = {
          origin: 'inferred',
          producer: 'length-unit',
          sourceRevision: manifest.source.revision,
          profile: manifest.profile,
          rule: 'length-unit',
          evidence: 'main.ts#/length',
        };
        const bindings: NonNullable<ParameterDeclaration['bindings']> = reverse
          ? { '/width': { unit: 'cm' }, '/length': { unit: 'mm', provenance: { unit: attributed } } }
          : { '/length': { unit: 'mm', provenance: { unit: attributed } }, '/width': { unit: 'cm' } };
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings,
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const shared = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:worker-shared',
      $uses: ['JSONSchemaUnits'],
      name: 'WorkerShared',
      type: 'double',
    };
    const reference = kind === 'internal' ? '#/definitions/shared' : shared.$id;
    const entries = [
      ['length', { type: { $ref: reference } }],
      ['width', { type: { $ref: reference } }],
    ] as const;
    const worker = createWorker([middleware()]);
    worker.declaration = {
      success: true,
      data: {
        schema: {
          ...shared,
          $id: 'urn:taucad:test:worker-root',
          name: 'WorkerRoot',
          type: 'object',
          ...(kind === 'internal' ? { definitions: { shared } } : {}),
          properties: Object.fromEntries(reverse ? entries.toReversed() : entries),
        },
        ...(kind === 'external' ? { resources: { [shared.$id]: shared } } : {}),
        defaults: { length: 2, width: 3 },
      },
      issues: [],
    };

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
  });

  it.each([
    ['internal', false],
    ['internal', true],
    ['external', false],
    ['external', true],
  ] as const)('retains real-worker %s shared-reference claims in reverse order %s', async (kind, reverse) => {
    const middleware = defineMiddleware({
      id: `valid-shared-reference-${kind}-${String(reverse)}`,
      name: `valid-shared-reference-${kind}-${String(reverse)}`,
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        const provenance = (name: string, field: string): Omit<ParameterProvenance, 'field'> => ({
          origin: 'inferred',
          producer: `${name}-${field}`,
          sourceRevision: manifest.source.revision,
          profile: manifest.profile,
          rule: `${name}-${field}`,
          evidence: `main.ts#/${name}`,
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
          ? { '/width': binding('width', 'cm'), '/length': binding('length', 'mm') }
          : { '/length': binding('length', 'mm'), '/width': binding('width', 'cm') };
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings,
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const shared = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:worker-shared',
      $uses: ['JSONSchemaUnits'],
      name: 'WorkerShared',
      type: 'double',
    };
    const reference = kind === 'internal' ? '#/definitions/shared' : shared.$id;
    const entries = [
      ['length', { type: { $ref: reference } }],
      ['width', { type: { $ref: reference } }],
    ] as const;
    const worker = createWorker([middleware()]);
    worker.declaration = {
      success: true,
      data: {
        schema: {
          ...shared,
          $id: 'urn:taucad:test:worker-root',
          name: 'WorkerRoot',
          type: 'object',
          ...(kind === 'internal' ? { definitions: { shared } } : {}),
          properties: Object.fromEntries(reverse ? entries.toReversed() : entries),
        },
        ...(kind === 'external' ? { resources: { [shared.$id]: shared } } : {}),
        defaults: { length: 2, width: 3 },
      },
      issues: [],
    };

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    if (result.success) {
      for (const field of ['unit', 'quantity-kind', 'space', 'reference']) {
        expect(Object.values(result.data.provenance).filter((record) => record.field === field)).toHaveLength(2);
      }
    }
  });

  it('rejects enrichment provenance that relabels an explicit schema unit', async () => {
    const middleware = defineMiddleware({
      id: 'relabel-schema-unit',
      name: 'relabel-schema-unit',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  unit: 'mm',
                  provenance: {
                    unit: {
                      origin: 'project',
                      producer: 'test-project',
                      sourceRevision: manifest.source.revision,
                      evidence: 'project.json#/units/length',
                    },
                  },
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
    expect(result.issues[0]?.code).toBe('MIDDLEWARE_FAILED');
    expect(result.issues[0]?.message).toContain('METADATA_CONFLICT at /properties/length');
  });

  it.each(semanticAttributionFailures)(
    'rejects %s %s attribution when required values are %s through real worker admission',
    async (field, origin, mode) => {
      const values = {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        space: 'linear',
        reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
      } as const;
      const middleware = defineMiddleware({
        id: `incomplete-${field}-${origin}-${mode}`,
        name: `incomplete-${field}-${origin}-${mode}`,
        async wrapGetParameters(input, handler) {
          const result = await handler(input);
          if (!result.success) {
            return result;
          }
          const manifest = result.data;
          const provenance =
            origin === 'inferred'
              ? mode === 'missing'
                ? { origin, producer: 'semantic-rule', sourceRevision: manifest.source.revision }
                : {
                    origin,
                    producer: 'semantic-rule',
                    sourceRevision: manifest.source.revision,
                    profile: ' ',
                    rule: ' ',
                    evidence: ' ',
                  }
              : mode === 'missing'
                ? { origin, producer: 'project.json', sourceRevision: manifest.source.revision }
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
                      sourceRevision: manifest.source.revision,
                      evidence: 'project.json#/bindings/length/space',
                    },
                  }
                : {}),
              [field]: provenance,
            },
          };
          return {
            ...result,
            data: await compileParameterManifest({
              declaration: {
                schema: manifest.schema,
                resources: manifest.resources,
                defaults: manifest.defaults,
                bindings: { '/length': binding },
              } as unknown as ParameterDeclaration,
              scope: manifest.scope,
              source: manifest.source,
              dependency: manifest.identity.dependency,
              middleware: manifest.identity.middleware,
              resolution: manifest.identity.resolution,
              sourceFiles: manifest.identity.sourceFiles,
            }),
          };
        },
      });
      const worker = createWorker([middleware()]);
      try {
        const result = await worker.getParameters(createGeometryFile('main.ts'));
        expect(result.success).toBe(false);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it.each(semanticAttributionPositives)(
    'admits complete %s %s attribution through real worker admission',
    async (field, origin) => {
      const values = {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        space: 'linear',
        reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
      } as const;
      const middleware = defineMiddleware({
        id: `complete-${field}-${origin}`,
        name: `complete-${field}-${origin}`,
        async wrapGetParameters(input, handler) {
          const result = await handler(input);
          if (!result.success) {
            return result;
          }
          const manifest = result.data;
          const provenance: Omit<ParameterProvenance, 'field'> =
            origin === 'inferred'
              ? {
                  origin,
                  producer: 'semantic-rule',
                  sourceRevision: manifest.source.revision,
                  profile: manifest.profile,
                  rule: `${field}-rule`,
                  evidence: `main.ts#/length/${field}`,
                }
              : {
                  origin,
                  producer: 'project.json',
                  sourceRevision: manifest.source.revision,
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
                      sourceRevision: manifest.source.revision,
                      evidence: 'project.json#/bindings/length/space',
                    },
                  }
                : {}),
              [field]: provenance,
            },
          };
          return {
            ...result,
            data: await compileParameterManifest({
              declaration: {
                schema: manifest.schema,
                resources: manifest.resources,
                defaults: manifest.defaults,
                bindings: { '/length': binding },
              } as unknown as ParameterDeclaration,
              scope: manifest.scope,
              source: manifest.source,
              dependency: manifest.identity.dependency,
              middleware: manifest.identity.middleware,
              resolution: manifest.identity.resolution,
              sourceFiles: manifest.identity.sourceFiles,
            }),
          };
        },
      });
      const worker = createWorker([middleware()]);
      try {
        const result = await worker.getParameters(createGeometryFile('main.ts'));
        expect(result.success).toBe(true);
        if (result.success) {
          expect(Object.values(result.data.provenance)).toContainEqual(
            expect.objectContaining({
              field: field === 'quantityKind' ? 'quantity-kind' : field,
              origin,
              producer: origin === 'inferred' ? 'semantic-rule' : 'project.json',
              sourceRevision: result.data.source.revision,
              evidence: origin === 'inferred' ? `main.ts#/length/${field}` : `project.json#/bindings/length/${field}`,
            }),
          );
        }
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('admits independently attributed semantic enrichment', async () => {
    const middleware = defineMiddleware({
      id: 'enrich-semantics',
      name: 'enrich-semantics',
      async wrapGetParameters(input, handler) {
        const result = await handler(input);
        if (!result.success) {
          return result;
        }
        const manifest = result.data;
        return {
          ...result,
          data: await compileParameterManifest({
            declaration: {
              schema: manifest.schema,
              resources: manifest.resources,
              defaults: manifest.defaults,
              bindings: {
                '/length': {
                  quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
                  space: 'linear',
                  provenance: {
                    quantityKind: {
                      origin: 'inferred',
                      producer: 'enrich-semantics',
                      sourceRevision: manifest.source.revision,
                      profile: manifest.profile,
                      rule: 'test-length',
                      evidence: 'main.ts#/length',
                    },
                    space: {
                      origin: 'project',
                      producer: 'test-project',
                      sourceRevision: manifest.source.revision,
                      evidence: 'project.json#/bindings/length/space',
                    },
                  },
                },
              },
            },
            scope: manifest.scope,
            source: manifest.source,
            dependency: manifest.identity.dependency,
            middleware: manifest.identity.middleware,
            resolution: manifest.identity.resolution,
            sourceFiles: manifest.identity.sourceFiles,
          }),
        };
      },
    });
    const worker = createWorker([middleware()]);

    const result = await worker.getParameters(createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.values(result.data.provenance)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'quantity-kind', origin: 'inferred' }),
          expect.objectContaining({ field: 'space', origin: 'project' }),
        ]),
      );
    }
  });

  it('rejects unsafe generic integers before native kernel execution', async () => {
    const worker = createWorker();
    worker.declaration = createParameterDeclaration(
      { count: 1 },
      { properties: { count: { type: 'integer', ucumUnit: '1' } }, required: ['count'] },
    );

    const result = await worker.evaluateModel({
      file: createGeometryFile('main.ts'),
      parameters: { count: 2 ** 53 },
    });

    expect(result).toMatchObject({
      success: false,
      issues: [{ message: 'Parameters do not satisfy the admitted execution schema', code: 'RUNTIME' }],
    });
    expect(worker.createGeometryCalls).toBe(0);
  });

  it('keys the real worker cache by resolution and clears it for source changes', async () => {
    const worker = createWorker();
    const file = createGeometryFile('main.ts');
    const first = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
    const cached = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
    const differentResolution = await worker.getParameters(file, { mode: 'declared-only', inferenceLanguage: 'en-NZ' });

    expect(worker.calls).toBe(2);
    expect(cached).toEqual(first);
    expect(differentResolution.success && first.success && differentResolution.data.revision).not.toBe(
      first.success ? first.data.revision : undefined,
    );

    await worker.notifyFileChanged(['main.ts']);
    await worker.getParameters(file, { mode: 'declared-only', inferenceLanguage: 'en-NZ' });
    expect(worker.calls).toBe(3);
    await worker.cleanup();
  });

  it('runs the actual parameter-units middleware through final admission and semantic caching', async () => {
    const [parameterCache, parameterUnits] = await Promise.all([
      loadExternalMiddleware(parameterCacheUrl, 'parameterCache'),
      loadExternalMiddleware(parameterUnitsUrl, 'parameterUnits'),
    ]);
    const cacheLogs = vi.fn<OnWorkerLog>();
    const worker = createWorker([parameterCache, parameterUnits], [{}, { angleDefault: 'deg' }], cacheLogs);
    const defaults = {
      cameraAngle: 38,
      rotationRadians: 0.5,
      width: 20,
      partHeight: 14,
      modelDepth: 4,
      cellSize: 3,
      wallThickness: 1,
      triangleCount: 3,
      strainAngle: 0.01,
      hexColor: 0xff_00_ff,
      mystery: 7,
    };
    const schema = {
      properties: {
        cameraAngle: { type: 'double', default: 38, minimum: 0, maximum: 90, multipleOf: 0.5 },
        rotationRadians: { type: 'double', ucumUnit: 'rad' },
        width: { type: 'double' },
        partHeight: { type: 'double' },
        modelDepth: { type: 'double' },
        cellSize: { type: 'double' },
        wallThickness: { type: 'double' },
        triangleCount: { type: 'int32' },
        strainAngle: { type: 'double' },
        hexColor: { type: 'uint32' },
        mystery: { type: 'double' },
      },
      required: [
        'cameraAngle',
        'rotationRadians',
        'width',
        'partHeight',
        'modelDepth',
        'cellSize',
        'wallThickness',
        'triangleCount',
        'strainAngle',
        'hexColor',
        'mystery',
      ],
    };
    worker.declaration = createParameterDeclaration(defaults, schema);
    const file = createGeometryFile('main.ts');
    const before = structuredClone(worker.declaration);

    try {
      const degrees = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
      const cached = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
      expect(worker.calls).toBe(1);
      expect(cached).toEqual(degrees);
      expect(worker.declaration).toEqual(before);
      expect(degrees.success).toBe(true);
      if (!degrees.success) {
        return;
      }
      expect(degrees.data.defaults).toEqual(defaults);
      expect(degrees.data.schema).toEqual(before.success ? before.data.schema : undefined);
      expect(degrees.data.bindings['/cameraAngle']).toMatchObject({
        unit: 'deg',
        quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
        space: 'linear',
        representation: 'binary64',
        constraints: { default: 38, minimum: 0, maximum: 90, multipleOf: 0.5 },
      });
      expect(degrees.data.bindings['/rotationRadians']).toMatchObject({ unit: 'rad' });
      for (const [pointer, quantityKind] of [
        ['/width', 'http://qudt.org/vocab/quantitykind/Width'],
        ['/partHeight', 'http://qudt.org/vocab/quantitykind/Height'],
        ['/modelDepth', 'http://qudt.org/vocab/quantitykind/Depth'],
        ['/cellSize', 'http://qudt.org/vocab/quantitykind/Length'],
        ['/wallThickness', 'http://qudt.org/vocab/quantitykind/Length'],
      ] as const) {
        expect(degrees.data.bindings[pointer]).toMatchObject({
          unit: 'mm',
          quantityKind,
          space: 'linear',
          representation: 'binary64',
        });
      }
      expect(Object.values(degrees.data.provenance)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'unit', origin: 'inferred', rule: 'angle-default-v1/unit' }),
          expect.objectContaining({ field: 'quantity-kind', origin: 'inferred' }),
          expect.objectContaining({ field: 'space', origin: 'inferred' }),
          expect.objectContaining({ field: 'unit', origin: 'declared' }),
        ]),
      );
      for (const pointer of ['/triangleCount', '/strainAngle', '/hexColor', '/mystery']) {
        expect(degrees.data.bindings[pointer]).toBeDefined();
        expect(degrees.data.bindings[pointer]).not.toHaveProperty('unit');
      }

      worker.getMiddleware()[1]!.options = { angleDefault: 'rad' };
      const radians = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
      expect(worker.calls).toBe(2);
      expect(radians.success && radians.data.bindings['/cameraAngle']?.unit).toBe('rad');
      expect(radians.success && radians.data.revision).not.toBe(degrees.data.revision);
      if (radians.success) {
        expect(radians.data.identity.middleware).not.toBe(degrees.data.identity.middleware);
      }

      worker.getMiddleware()[1]!.options = { angleDefault: 'deg' };
      const degreesAgain = await worker.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
      expect(worker.calls).toBe(3);
      expect(degreesAgain).toEqual(degrees);
      expect(cacheLogs.mock.calls.some(([entry]) => entry.message.includes('Parameter cache cache'))).toBe(true);

      const declaredOnly = await worker.getParameters(file, { mode: 'declared-only', inferenceLanguage: 'en-NZ' });
      expect(worker.calls).toBe(4);
      expect(declaredOnly.success && declaredOnly.data.bindings['/cameraAngle']?.unit).toBeUndefined();
      expect(declaredOnly.success && declaredOnly.data.bindings['/rotationRadians']?.unit).toBe('rad');
      for (const pointer of ['/width', '/partHeight', '/modelDepth', '/cellSize', '/wallThickness']) {
        expect(declaredOnly.success && declaredOnly.data.bindings[pointer]?.unit).toBeUndefined();
      }
    } finally {
      await worker.cleanup();
    }
  });

  it('establishes the producer baseline before admitting a cold-worker CAS hit', async () => {
    const [parameterCache, parameterUnits] = await Promise.all([
      loadExternalMiddleware(parameterCacheUrl, 'parameterCache'),
      loadExternalMiddleware(parameterUnitsUrl, 'parameterUnits'),
    ]);
    const durable = createMemoryComputeEngine();
    const workspace = 'w4-parameter-cache-cold-worker';
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      engine: durable.engine,
      workspace,
      control: durable.control({ workspace }),
    });
    const middleware = [parameterCache, parameterUnits];
    const configs = [{}, { angleDefault: 'deg' }];
    const declaration = createParameterDeclaration(
      { cameraAngle: 38 },
      { properties: { cameraAngle: { type: 'double' } }, required: ['cameraAngle'] },
    );
    const file = createGeometryFile('main.ts');
    const first = createWorker(middleware, configs);
    first.declaration = declaration;
    first.setComputeBinding({ mode: 'durable', store });

    const seeded = await first.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });
    await first.cleanup();

    const coldLogs = vi.fn<OnWorkerLog>();
    const cold = createWorker(middleware, configs, coldLogs);
    cold.declaration = structuredClone(declaration);
    cold.setComputeBinding({ mode: 'durable', store });

    try {
      const reused = await cold.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });

      expect(reused).toEqual(seeded);
      expect(cold.calls).toBe(1);
      expect(coldLogs.mock.calls.some(([entry]) => entry.message.includes('Parameter cache cache'))).toBe(true);
    } finally {
      await cold.cleanup();
    }

    const drifted = createWorker(middleware, configs);
    drifted.declaration = createParameterDeclaration(
      { cameraAngle: 38 },
      {
        properties: { cameraAngle: { type: 'double', maximum: 180 } },
        required: ['cameraAngle'],
      },
    );
    drifted.setComputeBinding({ mode: 'durable', store });

    try {
      const rejected = await drifted.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });

      expect(rejected).toMatchObject({
        success: false,
        issues: [{ code: 'RUNTIME', details: [expect.objectContaining({ code: 'METADATA_CONFLICT' })] }],
      });
      expect(drifted.calls).toBe(1);
    } finally {
      await drifted.cleanup();
    }

    const failing = createWorker(middleware, configs);
    failing.declaration = {
      success: false,
      issues: [{ code: 'RUNTIME', type: 'kernel', severity: 'error', message: 'Producer unavailable' }],
    };
    failing.setComputeBinding({ mode: 'durable', store });

    try {
      const rejected = await failing.getParameters(file, { mode: 'default', inferenceLanguage: 'en-NZ' });

      expect(rejected).toMatchObject({
        success: false,
        issues: [{ code: 'RUNTIME', message: 'Producer unavailable' }],
      });
      expect(failing.calls).toBe(1);
    } finally {
      await failing.cleanup();
    }
  });

  it('does not let the actual parameter-units middleware replace invalid explicit metadata', async () => {
    const parameterUnits = await loadExternalMiddleware(parameterUnitsUrl, 'parameterUnits');
    const worker = createWorker([parameterUnits], [{ angleDefault: 'deg' }]);
    worker.declaration = createParameterDeclaration(
      { cameraAngle: 38 },
      { properties: { cameraAngle: { type: 'double', ucumUnit: 'not-a-unit' } } },
    );

    try {
      const result = await worker.getParameters(createGeometryFile('main.ts'));

      expect(result).toMatchObject({
        success: false,
        issues: [{ code: 'RUNTIME', details: [expect.objectContaining({ code: 'INVALID_ANNOTATION' })] }],
      });
      expect(worker.calls).toBe(1);
    } finally {
      await worker.cleanup();
    }
  });
});
