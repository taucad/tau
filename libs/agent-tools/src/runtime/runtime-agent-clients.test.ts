import { describe, expect, it, vi } from 'vitest';

import { createRuntimeAgentClients, createRuntimeParameterAgentClient } from '#runtime/runtime-agent-clients.js';
import type { RuntimeAgentClient, RuntimeAgentImageExporter } from '#runtime/runtime-agent-clients.js';
import type {
  Description,
  Evaluation,
  ExportFile,
  ExportResult,
  Rendering,
  RuntimeDocument,
  UpdateOutcome,
  ViewSubscription,
  ViewUpdateOutcome,
  WideViewRequest,
} from '@taucad/runtime';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { parameterSetMachine } from '@taucad/parameters/set-machine';
import type { ParameterSetActors, ParameterSetLoadInput } from '@taucad/parameters/set-machine';
import { admitParameterManifest, compileParameterManifest, resolveParameterSnapshot } from '@taucad/parameters';
import type { ParameterSnapshot } from '@taucad/parameters';

const glb = (): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(12);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.byteLength, true);
  return bytes;
};

const evaluation = (views = [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }]): Evaluation => ({
  success: true,
  id: 'evaluation-1',
  transient: false,
  views,
  exports: [],
  issues: [],
});
const rendering = (
  artifact: Extract<Rendering, { success: true }>['artifact'],
  view = 'model',
  hash = 'render-1',
): Rendering => ({
  success: true,
  requestId: 'render-1',
  evaluationId: 'evaluation-1',
  transient: false,
  view,
  artifact,
  hash,
  issues: [],
});
const defaultExport: ExportResult = {
  success: true,
  exportId: 'mesh',
  evaluationId: 'evaluation-1',
  files: [{ name: 'model.stl', mimeType: 'model/stl', bytes: Uint8Array.of(1) }],
  issues: [],
};

type RuntimeFixtureOptions = Readonly<{
  evaluate?: (path: string) => Promise<Evaluation> | Evaluation;
  render?: (path: string, view: string | undefined) => Promise<Rendering> | Rendering;
  export?: (path: string, to: string) => Promise<ExportResult> | ExportResult;
}>;

const runtimeFixture = (options: RuntimeFixtureOptions = {}) => {
  const documents: RuntimeDocument[] = [];
  const documentFor = (path: string): RuntimeDocument => {
    const view = (id?: string, request: WideViewRequest = {}): ViewSubscription => ({
      view: id,
      request,
      on: () => () => undefined,
      rendering: vi.fn(
        async (): Promise<ViewUpdateOutcome> => ({
          superseded: false,
          rendering: await (options.render?.(path, id) ??
            rendering({ mimeType: 'model/gltf-binary', content: glb() }, id)),
        }),
      ),
      update: vi.fn(
        async (): Promise<ViewUpdateOutcome> => ({
          superseded: false,
          rendering: await (options.render?.(path, id) ??
            rendering({ mimeType: 'model/gltf-binary', content: glb() }, id)),
        }),
      ),
      close: vi.fn(),
    });
    function documentView(): ViewSubscription<string, Readonly<{ options?: never; instance?: never; content?: never }>>;
    function documentView<Id extends string>(id: Id, request?: WideViewRequest): ViewSubscription<Id>;
    function documentView(id?: string, request?: WideViewRequest): ViewSubscription {
      return view(id, request);
    }
    const document: RuntimeDocument = {
      id: `document:${path}`,
      view: documentView,
      export: vi.fn(async (to: string) => options.export?.(path, to) ?? defaultExport),
      evaluation: vi.fn(
        async (): Promise<UpdateOutcome> => ({
          superseded: false,
          evaluation: await (options.evaluate?.(path) ?? evaluation()),
        }),
      ),
      update: vi.fn(
        async (): Promise<UpdateOutcome> => ({
          superseded: false,
          evaluation: await (options.evaluate?.(path) ?? evaluation()),
        }),
      ),
      on: () => () => undefined,
      close: vi.fn(),
    };
    documents.push(document);
    return document;
  };
  const open = vi.fn<RuntimeAgentClient['open']>((input) => {
    if (!('path' in input.source) || input.source.path === undefined) {
      throw new TypeError('Agent fixture requires a filesystem source');
    }
    return documentFor(input.source.path);
  });
  const runtime: RuntimeAgentClient = {
    open,
    describe: vi.fn(async (): Promise<Description> => ({ success: false, kernelId: undefined, issues: [] })),
    capabilities: undefined,
  };
  return { runtime, open, documents };
};

const clientsFor = (
  fixture: ReturnType<typeof runtimeFixture>,
  exportImage: RuntimeAgentImageExporter = async () => [
    { name: 'render.webp', mimeType: 'image/webp', bytes: Uint8Array.of(1) },
  ],
) => {
  const exporter = vi.fn<RuntimeAgentImageExporter>(exportImage);
  const clients = createRuntimeAgentClients({
    runtime: fixture.runtime,
    exportImage: exporter,
    mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
  });
  return { ...clients, ...fixture, exporter };
};

describe('createRuntimeAgentClients', () => {
  it('preserves authentication issues through evaluation, export and capture', async () => {
    const issue = {
      code: 'AUTHENTICATION_ERROR',
      message: 'Authentication timeout',
      type: 'connection',
      severity: 'error',
    } as const;
    const fixture = runtimeFixture({
      evaluate: () => ({ success: false, id: 'failed', transient: false, issues: [issue] }),
      export: () => ({ success: false, issues: [issue] }),
    });
    const clients = clientsFor(fixture);
    await expect(clients.kernelClient.evaluateModel({ targetFile: 'main.kcl' })).resolves.toMatchObject({
      success: true,
      status: 'error',
      kernelIssues: [issue],
    });
    await expect(clients.graphics.exportModel({ targetFile: 'main.kcl', to: 'stl' })).resolves.toMatchObject({
      success: false,
      errorCode: 'AUTHENTICATION_ERROR',
      message: 'Authentication timeout',
    });
    await expect(clients.images.captureImages({ targetFile: 'main.kcl', mode: 'single' })).resolves.toMatchObject({
      success: false,
      errorCode: 'AUTHENTICATION_ERROR',
      message: 'Authentication timeout',
    });
    expect(fixture.documents).toHaveLength(3);
    for (const document of fixture.documents) {
      expect(document.close).toHaveBeenCalledOnce();
    }
  });

  it('keeps concurrent captures and exports scoped to their source documents', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const order: string[] = [];
    const fixture = runtimeFixture({
      render: async (path, view) => {
        order.push(path);
        if (path === 'a.ts') {
          entered.resolve();
          await release.promise;
        }
        return rendering({ mimeType: 'model/gltf-binary', content: glb() }, view, path);
      },
      export: (path, to) => ({
        success: true,
        exportId: to,
        evaluationId: 'evaluation-1',
        issues: [],
        files: [
          { name: `${path}.${to}`, mimeType: to === 'stl' ? 'model/stl' : 'image/svg+xml', bytes: Uint8Array.of(1) },
        ],
      }),
    });
    const clients = clientsFor(fixture);
    const blocked = clients.images.captureImages({ targetFile: 'a.ts', mode: 'single' });
    const sibling = clients.images.captureImages({ targetFile: 'b.ts', mode: 'single' });
    await entered.promise;
    const [mesh, drawing] = await Promise.all([
      clients.graphics.exportModel({ targetFile: 'mesh.ts', to: 'stl' }),
      clients.graphics.exportModel({ targetFile: 'drawing.ts', to: 'svg' }),
    ]);
    expect(mesh).toMatchObject({ success: true, files: [{ name: 'mesh.ts.stl' }] });
    expect(drawing).toMatchObject({ success: true, files: [{ name: 'drawing.ts.svg' }] });
    await expect(sibling).resolves.toMatchObject({ success: true, images: [{ view: 'model', angle: 'isometric' }] });
    release.resolve();
    await expect(blocked).resolves.toMatchObject({ success: true, images: [{ view: 'model', angle: 'isometric' }] });
    expect(order).toEqual(['a.ts', 'b.ts']);
    expect(clients.exporter.mock.calls.map(([job]) => job.sourcePath)).toEqual(['b.ts', 'a.ts']);
    for (const document of fixture.documents) {
      expect(document.close).toHaveBeenCalledOnce();
    }
  });

  it('propagates cancellation and does not start image execution after abort', async () => {
    const controller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const fixture = runtimeFixture({
      render: async (_path, view) => {
        entered.resolve();
        await release.promise;
        return rendering({ mimeType: 'model/gltf-binary', content: glb() }, view);
      },
    });
    const clients = clientsFor(fixture);
    const pending = clients.images.captureImages(
      { targetFile: 'cancel.ts', mode: 'single' },
      { signal: controller.signal },
    );
    await entered.promise;
    controller.abort(new Error('stop capture'));
    release.resolve();
    await expect(pending).resolves.toMatchObject({ success: false, message: 'Error: stop capture' });
    expect(clients.exporter).not.toHaveBeenCalled();
    expect(fixture.documents[0]?.close).toHaveBeenCalledOnce();
  });

  it('uses a declared SVG view, keeps annotations, and permits unitless drawing capture', async () => {
    const exporter = vi.fn<RuntimeAgentImageExporter>(async () => [
      { name: 'drawing.png', mimeType: 'image/png', bytes: Uint8Array.of(1) },
    ]);
    const fixture = runtimeFixture({
      evaluate: () => evaluation([{ id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' }]),
      render: (_path, view) =>
        rendering(
          {
            mimeType: 'image/svg+xml',
            content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            units: { length: 'cm' },
          },
          view,
          'svg-hash',
        ),
    });
    const clients = clientsFor(fixture, exporter);
    await expect(
      clients.images.captureImages({ targetFile: 'drawing.ts', mode: 'single', view: 'drawing' }),
    ).resolves.toMatchObject({
      success: true,
      images: [{ view: 'drawing' }],
    });
    expect(clients.exporter.mock.calls[0]?.[0]).toMatchObject({
      sourceFormat: 'svg',
      exportOptions: { axes: false, scaleBar: true, lengthSymbol: 'cm' },
    });
    await expect(
      clients.images.captureImages({ targetFile: 'drawing.ts', mode: 'multi_angle', view: 'drawing' }),
    ).resolves.toEqual({ success: true, images: [{ view: 'drawing', dataUrl: 'data:image/png;base64,AQ==' }] });
    expect(clients.exporter).toHaveBeenCalledTimes(2);
    const unitless = clientsFor(
      runtimeFixture({
        evaluate: () => evaluation([{ id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' }]),
        render: (_path, view) =>
          rendering({ mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, view),
      }),
      exporter,
    );
    await expect(unitless.images.captureImages({ targetFile: 'drawing.ts', mode: 'multi_angle' })).resolves.toEqual({
      success: true,
      images: [{ view: 'drawing', dataUrl: 'data:image/png;base64,AQ==' }],
    });
    expect(unitless.exporter.mock.calls[2]?.[0]).toMatchObject({
      exportOptions: { axes: false, scaleBar: false, lengthSymbol: '' },
    });
  });

  it('rejects malformed or unknown display artifacts before image execution', async () => {
    for (const artifact of [
      { mimeType: 'model/gltf-binary', content: new TextEncoder().encode('{}') },
      { mimeType: 'application/x-webrtc', content: Uint8Array.of(1) },
    ] as const) {
      const clients = clientsFor(runtimeFixture({ render: (_path, view) => rendering(artifact, view) }));
      // oxlint-disable-next-line eslint/no-await-in-loop -- each artifact has an isolated document and exporter.
      await expect(clients.images.captureImages({ targetFile: 'bad.ts', mode: 'single' })).resolves.toMatchObject({
        success: false,
      });
      expect(clients.exporter).not.toHaveBeenCalled();
    }
  });

  it('passes exact GLB bytes and validates the complete ordered multi-angle batch', async () => {
    const bytes = glb();
    const names = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;
    const fixture = runtimeFixture({
      render: (_path, view) => rendering({ mimeType: 'model/gltf-binary', content: bytes }, view, 'mesh'),
    });
    const clients = clientsFor(fixture, async () =>
      names.map((name) => ({ name: `render-${name}.webp`, mimeType: 'image/webp', bytes: Uint8Array.of(1) })),
    );
    const result = await clients.images.captureImages({ targetFile: 'mesh.ts', mode: 'multi_angle' });
    expect(clients.exporter.mock.calls[0]?.[0]).toMatchObject({
      content: bytes,
      sourceFormat: 'glb',
      geometryHash: 'mesh',
    });
    expect(result).toMatchObject({ success: true, images: names.map((angle) => ({ view: 'model', angle })) });
    for (const files of [
      [] as ExportFile[],
      [{ name: 'wrong.png', mimeType: 'image/png', bytes: Uint8Array.of(1) }],
      [{ name: 'empty.webp', mimeType: 'image/webp', bytes: new Uint8Array() }],
      names.map((name, i) => ({
        name: `render-${i === 0 ? 'back' : name}.webp`,
        mimeType: 'image/webp',
        bytes: Uint8Array.of(1),
      })),
    ]) {
      const invalid = clientsFor(fixture, async () => files);
      // oxlint-disable-next-line eslint/no-await-in-loop -- each table row verifies a distinct invalid batch.
      const outcome = await invalid.images.captureImages({ targetFile: 'mesh.ts', mode: 'multi_angle' });
      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.message).toContain('Image capture expected');
      }
    }
    for (const [malformed, expectedMessage] of [
      [new Uint8Array(), 'GLB artifact content must be nonempty Uint8Array bytes.'],
      [
        (() => {
          const value = glb();
          new DataView(value.buffer).setUint32(4, 1, true);
          return value;
        })(),
        'not a GLB 2 container',
      ],
      [
        (() => {
          const value = glb();
          new DataView(value.buffer).setUint32(8, 24, true);
          return value;
        })(),
        'not a GLB 2 container',
      ],
    ] as const) {
      const invalid = clientsFor(
        runtimeFixture({
          render: (_path, view) => rendering({ mimeType: 'model/gltf-binary', content: malformed }, view),
        }),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- each malformed GLB has an isolated document.
      const outcome = await invalid.images.captureImages({ targetFile: 'mesh.ts', mode: 'single' });
      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.message).toContain(expectedMessage);
      }
      expect(invalid.exporter).not.toHaveBeenCalled();
    }
  });
});

describe('createRuntimeParameterAgentClient', () => {
  const fixture = async (gate?: Promise<void>, options: Readonly<{ sourceUnit?: boolean; unbound?: boolean }> = {}) => {
    const target = { authority: 'test', root: '/project', entry: 'main.py' };
    const digest = `sha256:${'1'.repeat(64)}` as Parameters<typeof compileParameterManifest>[0]['dependency'];
    const manifest = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:test',
          $uses: ['JSONSchemaUnits'],
          name: 'Parameters',
          type: 'object',
          properties: {
            width: { type: 'double', ...(options.sourceUnit ? { ucumUnit: 'mm' } : {}) },
            // A declared scalar the manifest binds nothing to: only numeric leaves get a binding.
            ...(options.unbound ? { label: { type: 'string' } } : {}),
          },
        },
        defaults: { width: 1, ...(options.unbound ? { label: 'plate' } : {}) },
        ...(options.sourceUnit
          ? {
              bindings: {
                '/width': {
                  parameterId: 'width',
                  quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
                  space: 'linear',
                  unit: 'mm',
                  sourceUnitCapability: 'change-source-unit:preserve-size:v1',
                },
              },
            }
          : {}),
      },
      scope: { kind: 'source', ...target },
      source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
      dependency: digest,
      middleware: digest,
    });
    const current = resolveParameterSnapshot({
      target,
      manifest,
      path: '.tau/parameters/main.py.json',
      bytes: null,
    });
    let persisted = current;
    const commit = vi.fn(async ({ input }: { input: { proposed: typeof current } }) => {
      await gate;
      persisted = structuredClone(input.proposed);
      return { status: 'applied', content: input.proposed.bytes! } as const;
    });
    const loads = vi.fn();
    const actor = createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: createAsyncLogic({
            run: async () => {
              loads();
              return current;
            },
          }),
          commitParameterSet: createAsyncLogic({ run: async ({ input }) => commit({ input }) }),
        } satisfies Partial<ParameterSetActors>,
      }),
      { input: { target } },
    );
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
    const adapter = createRuntimeParameterAgentClient({
      parameterActorFor: () => actor,
      mapRuntimeError: (error) => ({ success: false, errorCode: 'VALIDATION_ERROR', message: String(error) }),
    });
    const request = {
      action: 'propose',
      targetFile: 'main.py',
      requestId: 'agent:1',
      expected: current.identity,
      pressure: 'final',
      operation: { kind: 'replace-group-values', group: 'default', values: { width: 5 } },
    } as const;
    return { actor, adapter, request, current, commit, loads, persisted: () => persisted };
  };

  it('preserves operation identity and the complete business outcome', async () => {
    const { actor, adapter, request, commit } = await fixture();
    const result = await adapter.applyParameterOperation({
      ...request,
      expected: { manifestRevision: 'stale' },
    });
    expect(result).toMatchObject({
      success: true,
      outcome: { status: 'rejected', requestId: 'agent:1', code: 'STALE_MANIFEST' },
    });
    expect(commit).not.toHaveBeenCalled();
    actor.stop();
  });

  it('commits a native-value named by group, pointer and value alone on a field with no binding', async () => {
    const { actor, adapter, current, persisted } = await fixture(undefined, { unbound: true });
    await expect(
      adapter.applyParameterOperation({
        action: 'propose',
        targetFile: 'main.py',
        requestId: 'agent:unbound',
        expected: current.identity,
        pressure: 'final',
        operation: { kind: 'native-value', group: 'default', pointer: '/label', value: 'rail' },
      }),
    ).resolves.toMatchObject({
      success: true,
      outcome: { status: 'committed', requestId: 'agent:unbound' },
    });
    expect(persisted().entry.groups['default']?.values['label']).toBe('rail');
    actor.stop();
  });

  it('should evaluate an immediate kernel result after the parameter write settles', async () => {
    const { actor, adapter, request, persisted } = await fixture();
    const evaluate = vi.fn(async (): Promise<Evaluation> => {
      const width = persisted().entry.groups['default']?.values['width'];
      if (typeof width !== 'number') {
        throw new TypeError('Expected the settled width to be numeric');
      }
      return {
        success: true,
        id: `width:${width}`,
        transient: false,
        views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
        exports: [],
        issues: [{ type: 'runtime', code: 'RUNTIME', severity: 'error', message: `width:${width}` }],
      };
    });
    const clients = clientsFor(runtimeFixture({ evaluate }));

    await expect(adapter.applyParameterOperation(request)).resolves.toMatchObject({
      success: true,
      outcome: { status: 'committed' },
    });
    await expect(clients.kernelClient.evaluateModel({ targetFile: 'main.py' })).resolves.toMatchObject({
      success: true,
      status: 'ready',
      kernelIssues: [{ message: 'width:5' }],
    });
    expect(evaluate).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('rejects unknown confirmation/cancellation and preserves a known outcome after abort', async () => {
    const gate = Promise.withResolvers<void>();
    const { actor, adapter, request, commit } = await fixture(gate.promise);
    await Promise.all(
      (['confirm', 'cancel'] as const).map(async (action) => {
        const result = await adapter.applyParameterOperation(
          action === 'confirm'
            ? { action, targetFile: 'main.py', requestId: action, planFingerprint: 'unknown' }
            : { action, targetFile: 'main.py', requestId: action },
        );
        expect(result).toMatchObject({ success: true, outcome: { status: 'rejected', requestId: action } });
      }),
    );
    const controller = new AbortController();
    const operation = adapter.applyParameterOperation(request, { signal: controller.signal });
    await vi.waitFor(() => {
      expect(commit).toHaveBeenCalledOnce();
    });
    controller.abort(new Error('reply lost'));
    gate.resolve();
    await expect(operation).resolves.toMatchObject({
      success: true,
      outcome: { status: 'committed', requestId: 'agent:1' },
    });
    actor.stop();
  });

  const proposeSourceUnit = async (adapter: Awaited<ReturnType<typeof fixture>>['adapter']) => {
    // The request is built only from what `get_parameters` returned.
    const read = await adapter.getParameters({ targetFile: 'main.py' });
    if (!read.success || read.manifest === undefined || read.current === undefined) {
      throw new Error('Expected resolved parameters');
    }
    const manifest = await admitParameterManifest(read.manifest);
    const binding = manifest.bindings['/width'];
    if (binding?.sourceUnitCapability === undefined) {
      throw new Error('Expected a source-unit capable binding');
    }
    const proposed = await adapter.applyParameterOperation({
      action: 'propose',
      targetFile: 'main.py',
      requestId: 'agent:unit',
      expected: read.current.identity,
      pressure: 'final',
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: manifest.source.id,
          sourceRevision: manifest.source.revision,
          capability: binding.sourceUnitCapability,
        },
      },
    });
    if (!proposed.success || proposed.outcome.status !== 'confirmation-required') {
      throw new Error(`Expected a confirmation, got ${JSON.stringify(proposed)}`);
    }
    return proposed.outcome.planFingerprint;
  };

  it('keeps a plan awaiting confirmation across a read in the same mode', async () => {
    const { actor, adapter, commit, loads } = await fixture(undefined, { sourceUnit: true });
    const planFingerprint = await proposeSourceUnit(adapter);
    const loadsBefore = loads.mock.calls.length;
    await expect(
      Promise.all([
        adapter.getParameters({ targetFile: 'main.py' }),
        adapter.getParameters({ targetFile: 'main.py', resolutionMode: 'default' }),
      ]),
    ).resolves.toMatchObject([
      { success: true, status: 'resolved' },
      { success: true, status: 'resolved' },
    ]);
    // A read while a plan waits observes the held snapshot and never reloads it.
    expect(loads.mock.calls.length).toBe(loadsBefore);
    await expect(
      adapter.applyParameterOperation({
        action: 'confirm',
        targetFile: 'main.py',
        requestId: 'agent:unit',
        planFingerprint,
      }),
    ).resolves.toMatchObject({ success: true, outcome: { status: 'committed', requestId: 'agent:unit' } });
    expect(commit).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('rejects a plan awaiting confirmation when a read changes the admission mode', async () => {
    const { actor, adapter, commit, loads } = await fixture(undefined, { sourceUnit: true });
    await adapter.getParameters({ targetFile: 'main.py' });
    expect(actor.getSnapshot().context.resolution).toBeUndefined();
    const planFingerprint = await proposeSourceUnit(adapter);
    const settled = new Promise<unknown>((resolve) => {
      actor.on('settled', (event) => {
        resolve(event.outcome);
      });
    });
    const loadsBefore = loads.mock.calls.length;
    await expect(
      adapter.getParameters({ targetFile: 'main.py', resolutionMode: 'declared-only' }),
    ).resolves.toMatchObject({
      success: true,
      status: 'unresolved',
      diagnostics: [{ code: 'RESOLUTION_SUPERSEDED' }],
    });
    expect(loads.mock.calls.length).toBe(loadsBefore + 1);
    await expect(settled).resolves.toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
    await expect(
      adapter.applyParameterOperation({
        action: 'confirm',
        targetFile: 'main.py',
        requestId: 'agent:unit',
        planFingerprint,
      }),
    ).resolves.toMatchObject({ success: true, outcome: { status: 'rejected', code: 'STALE_PLAN' } });
    expect(commit).not.toHaveBeenCalled();
    actor.stop();
  });

  it('returns a typed unresolved result for an unreadable record', async () => {
    const target = { authority: 'test', root: '/project', entry: 'main.py' };
    const actor = createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
            run: async () => {
              throw Object.assign(new Error('Saved parameter values are not a valid record.'), {
                code: 'INVALID_RECORD',
                applicationState: 'known-not-applied',
              });
            },
          }),
        } satisfies Partial<ParameterSetActors>,
      }),
      { input: { target } },
    );
    actor.start();
    const adapter = createRuntimeParameterAgentClient({
      parameterActorFor: () => actor,
      mapRuntimeError: (error) => ({ success: false, errorCode: 'VALIDATION_ERROR', message: String(error) }),
    });
    await expect(adapter.getParameters({ targetFile: 'main.py' })).resolves.toMatchObject({
      success: true,
      status: 'unresolved',
      diagnostics: [{ code: 'INVALID_RECORD', severity: 'error', resource: 'main.py' }],
    });
    actor.stop();
  });

  it('projects only the wire snapshot, without re-admitting the manifest per read', async () => {
    const { actor, adapter, current } = await fixture();
    const result = await adapter.getParameters({ targetFile: 'main.py' });
    expect(result).toMatchObject({ success: true, status: 'resolved', current: { identity: current.identity } });
    if (!result.success || result.status !== 'resolved' || result.current === undefined) {
      throw new Error('Expected resolved parameters');
    }
    expect(Object.keys(result.current).sort()).toEqual(['entry', 'identity']);
    expect(result.current.identity).toEqual({ manifestRevision: current.manifest.revision });
    actor.stop();
  });
});
