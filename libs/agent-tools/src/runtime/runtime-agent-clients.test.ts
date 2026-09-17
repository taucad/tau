import { describe, expect, it, vi } from 'vitest';

import { createRuntimeAgentClients, createRuntimeParameterAgentClient } from '#runtime/runtime-agent-clients.js';
import type { RuntimeAgentClient, RuntimeAgentImageExporter } from '#runtime/runtime-agent-clients.js';
import type { ExportFile, HashedGeometryResult } from '@taucad/runtime/types';
import { createActor, fromPromise, waitFor } from 'xstate';
import { parameterSetMachine } from '@taucad/parameters/set-machine';
import type { ParameterSetLoadInput } from '@taucad/parameters/set-machine';
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

const setup = (geometry: HashedGeometryResult, exportImage?: RuntimeAgentImageExporter) => {
  const evaluate = vi.fn(async () => geometry);
  const exportGeometry = vi.fn(async () => ({ success: true, data: [], issues: [] }) as const);
  const runtime: RuntimeAgentClient = { evaluate, export: exportGeometry };
  const exporter =
    exportImage ??
    vi.fn<RuntimeAgentImageExporter>(async () => [
      {
        name: 'render.webp',
        mimeType: 'image/webp',
        bytes: new Uint8Array([1]),
      },
    ]);
  const clients = createRuntimeAgentClients({
    runtime,
    exportImage: exporter,
    mapRuntimeError: (error) => ({
      success: false,
      errorCode: 'UNKNOWN',
      message: String(error),
    }),
  });
  return { ...clients, evaluate, exportGeometry, exporter };
};

describe('createRuntimeAgentClients', () => {
  it('should keep concurrent captures and exports source-scoped without cross-publishing', async () => {
    const evaluated: string[] = [];
    const previewEntered = Promise.withResolvers<void>();
    const releasePreview = Promise.withResolvers<void>();
    const runtime: RuntimeAgentClient = {
      async evaluate(input) {
        evaluated.push(input.source.path);
        if (input.source.path === 'a.ts') {
          previewEntered.resolve();
          await releasePreview.promise;
        }
        return {
          success: true,
          issues: [],
          data: { format: 'gltf', content: glb(), hash: input.source.path },
        };
      },
      export: vi.fn<RuntimeAgentClient['export']>(async (format, { source }) => ({
        success: true,
        data: [
          {
            name: `${source.path}.${format}`,
            mimeType: format === 'stl' ? 'model/stl' : 'image/svg+xml',
            bytes: new Uint8Array([1]),
          },
        ],
        issues: [],
      })),
    };
    const exportImage = vi.fn<RuntimeAgentImageExporter>(async () => [
      {
        name: 'render.webp',
        mimeType: 'image/webp',
        bytes: new Uint8Array([1]),
      },
    ]);
    const clients = createRuntimeAgentClients({
      runtime,
      exportImage,
      mapRuntimeError: (error) => ({
        success: false,
        errorCode: 'UNKNOWN',
        message: String(error),
      }),
    });

    const [blockedCapture, siblingCapture] = [
      clients.images.captureImages({ targetFile: 'a.ts', mode: 'single' }),
      clients.images.captureImages({ targetFile: 'b.ts', mode: 'single' }),
    ] as const;
    await previewEntered.promise;
    const [meshExport, drawingExport] = await Promise.all([
      clients.graphics.exportGeometry({ targetFile: 'mesh.ts', format: 'stl' }),
      clients.graphics.exportGeometry({
        targetFile: 'drawing.ts',
        format: 'svg',
      }),
    ]);

    expect(meshExport).toMatchObject({
      success: true,
      files: [{ name: 'mesh.ts.stl' }],
    });
    expect(drawingExport).toMatchObject({
      success: true,
      files: [{ name: 'drawing.ts.svg' }],
    });
    expect(runtime.export).toHaveBeenCalledWith('stl', {
      source: { path: 'mesh.ts' },
      signal: undefined,
    });
    expect(runtime.export).toHaveBeenCalledWith('svg', {
      source: { path: 'drawing.ts' },
      signal: undefined,
    });
    await expect(siblingCapture).resolves.toMatchObject({
      success: true,
      images: [{ view: 'isometric' }],
    });
    expect(exportImage).toHaveBeenCalledWith(expect.objectContaining({ geometryHash: 'b.ts' }));

    releasePreview.resolve();
    await expect(blockedCapture).resolves.toMatchObject({
      success: true,
      images: [{ view: 'isometric' }],
    });
    expect(evaluated).toEqual(['a.ts', 'b.ts']);
    expect(exportImage.mock.calls.map(([job]) => (job.sourceFormat === 'glb' ? job.geometryHash : undefined))).toEqual([
      'b.ts',
      'a.ts',
    ]);
  });

  it('should preserve invocation cancellation through evaluation, export and capture without starting later work', async () => {
    const controller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<HashedGeometryResult>();
    const evaluate = vi.fn<RuntimeAgentClient['evaluate']>(async ({ source }) => {
      if (source.path === 'cancel.ts') {
        entered.resolve();
        return finish.promise;
      }
      return {
        success: true,
        issues: [],
        data: { format: 'gltf', content: glb(), hash: source.path },
      };
    });
    const exportGeometry = vi.fn<RuntimeAgentClient['export']>(async () => ({
      success: true,
      data: [],
      issues: [],
    }));
    const exportImage = vi.fn<RuntimeAgentImageExporter>(async () => [
      {
        name: 'render.webp',
        mimeType: 'image/webp',
        bytes: new Uint8Array([1]),
      },
    ]);
    const clients = createRuntimeAgentClients({
      runtime: { evaluate, export: exportGeometry },
      exportImage,
      mapRuntimeError: (error) => ({
        success: false,
        errorCode: 'UNKNOWN',
        message: String(error),
      }),
    });
    const context = { signal: controller.signal };
    const cancelled = clients.images.captureImages({ targetFile: 'cancel.ts', mode: 'single' }, context);
    await entered.promise;
    controller.abort(new Error('stop capture'));
    finish.resolve({
      success: true,
      issues: [],
      data: { format: 'gltf', content: glb(), hash: 'cancelled' },
    });
    await expect(cancelled).resolves.toMatchObject({
      success: false,
      message: 'Error: stop capture',
    });
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    expect(exportImage).not.toHaveBeenCalled();

    const sibling = new AbortController();
    await expect(
      clients.images.captureImages({ targetFile: 'sibling.ts', mode: 'single' }, { signal: sibling.signal }),
    ).resolves.toMatchObject({ success: true });
    expect(exportImage).toHaveBeenCalledWith(expect.objectContaining({ signal: sibling.signal }));
    await clients.graphics.exportGeometry({ targetFile: 'sibling.ts', format: 'stl' }, { signal: sibling.signal });
    expect(exportGeometry).toHaveBeenCalledWith('stl', {
      source: { path: 'sibling.ts' },
      signal: sibling.signal,
    });

    await clients.kernelClient.getKernelResult('never.ts', context);
    await clients.graphics.exportGeometry({ targetFile: 'never.ts', format: 'stl' }, context);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(exportGeometry).toHaveBeenCalledTimes(1);
  });

  it('should preserve SVG drawing annotations and refuse meaningless formats before image execution', async () => {
    const svgExporter = vi.fn<RuntimeAgentImageExporter>(async () => [
      {
        name: 'drawing.png',
        mimeType: 'image/png',
        bytes: new Uint8Array([1]),
      },
    ]);
    const svg = setup(
      {
        success: true,
        issues: [],
        data: {
          format: 'svg',
          content: '<svg></svg>',
          hash: 'svg-hash',
          units: { length: 'cm' },
        },
      },
      svgExporter,
    );
    await expect(svg.images.captureImages({ targetFile: 'drawing.ts', mode: 'single' })).resolves.toMatchObject({
      success: true,
      images: [{ view: 'drawing' }],
    });
    const svgJob = svgExporter.mock.calls[0]?.[0];
    expect(svgJob?.sourceFormat).toBe('svg');
    if (svgJob?.sourceFormat !== 'svg') {
      throw new Error('Expected SVG capture job');
    }
    expect(svgJob.exportOptions).toMatchObject({
      axes: true,
      scaleBar: true,
      lengthSymbol: 'cm',
    });
    await expect(
      svg.images.captureImages({
        targetFile: 'drawing.ts',
        mode: 'multi_angle',
      }),
    ).resolves.toMatchObject({
      success: false,
      message: 'Planar SVG drawings have one canonical view',
    });
    expect(svgExporter).toHaveBeenCalledTimes(1);

    const withoutUnits = createRuntimeAgentClients({
      runtime: {
        evaluate: vi.fn(
          async (): Promise<HashedGeometryResult> => ({
            success: true,
            issues: [],
            data: { format: 'svg', content: '<svg></svg>', hash: 'svg-hash' },
          }),
        ),
        export: vi.fn(async () => ({ success: true, data: [], issues: [] })),
      },
      exportImage: svgExporter,
      mapRuntimeError: (error) => ({
        success: false,
        errorCode: 'UNKNOWN',
        message: String(error),
      }),
    });
    await expect(
      withoutUnits.images.captureImages({
        targetFile: 'drawing.ts',
        mode: 'single',
      }),
    ).resolves.toMatchObject({
      success: false,
      message: 'Annotated SVG capture requires the artifact coordinate length unit',
    });
    expect(svgExporter).toHaveBeenCalledTimes(1);

    const malformed = setup({
      success: true,
      issues: [],
      data: {
        format: 'gltf',
        content: new TextEncoder().encode('{}'),
        hash: 'json-gltf',
      },
    });
    await expect(malformed.images.captureImages({ targetFile: 'bad.ts', mode: 'single' })).resolves.toMatchObject({
      success: false,
    });
    expect(malformed.exporter).not.toHaveBeenCalled();

    const webrtc = setup({
      success: true,
      issues: [],
      data: { format: 'webrtc', stream: new EventTarget(), hash: 'live' },
    });
    await expect(webrtc.images.captureImages({ targetFile: 'live.ts', mode: 'single' })).resolves.toMatchObject({
      success: false,
      message: 'Live WebRTC geometry cannot be captured headlessly',
    });
    expect(webrtc.exporter).not.toHaveBeenCalled();
  });

  it('should pass exact GLB bytes and validate the complete ordered batch', async () => {
    const bytes = glb();
    const exportImage = vi.fn<RuntimeAgentImageExporter>(async () =>
      ['front', 'back', 'right', 'left', 'top', 'bottom'].map((name) => ({
        name: `render-${name}.webp`,
        mimeType: 'image/webp',
        bytes: new Uint8Array([1]),
      })),
    );
    const clients = setup(
      {
        success: true,
        issues: [],
        data: { format: 'gltf', content: bytes, hash: 'mesh' },
      },
      exportImage,
    );
    const result = await clients.images.captureImages({
      targetFile: 'mesh.ts',
      mode: 'multi_angle',
    });

    expect(exportImage.mock.calls[0]?.[0]).toMatchObject({
      content: bytes,
      sourceFormat: 'glb',
      geometryHash: 'mesh',
    });
    expect(result).toMatchObject({
      success: true,
      images: [
        { view: 'front' },
        { view: 'back' },
        { view: 'right' },
        { view: 'left' },
        { view: 'top' },
        { view: 'bottom' },
      ],
    });

    const invalidFiles: ReadonlyArray<readonly ExportFile[]> = [
      [],
      [
        {
          name: 'wrong.png',
          mimeType: 'image/png',
          bytes: new Uint8Array([1]),
        },
      ],
      [{ name: 'empty.webp', mimeType: 'image/webp', bytes: new Uint8Array() }],
    ];
    await Promise.all(
      invalidFiles.map(async (files) => {
        const invalid = setup(
          {
            success: true,
            issues: [],
            data: { format: 'gltf', content: glb(), hash: 'mesh' },
          },
          vi.fn<RuntimeAgentImageExporter>(async () => files),
        );
        const invalidResult = await invalid.images.captureImages({
          targetFile: 'mesh.ts',
          mode: 'single',
        });
        expect(invalidResult.success).toBe(false);
        if (invalidResult.success) {
          throw new Error('Expected invalid capture result');
        }
        expect(invalidResult.message).toContain('Image capture expected');
      }),
    );

    for (const names of [
      [
        'render-back.webp',
        'render-front.webp',
        'render-right.webp',
        'render-left.webp',
        'render-top.webp',
        'render-bottom.webp',
      ],
      [
        'render-front.webp',
        'render-front.webp',
        'render-right.webp',
        'render-left.webp',
        'render-top.webp',
        'render-bottom.webp',
      ],
      [
        'render-front.webp',
        'render-back.webp',
        'render-right.webp',
        'render-left.webp',
        'render-top.webp',
        'render-oblique.webp',
      ],
    ]) {
      const invalid = setup(
        {
          success: true,
          issues: [],
          data: { format: 'gltf', content: glb(), hash: 'mesh' },
        },
        vi.fn<RuntimeAgentImageExporter>(async () =>
          names.map((name) => ({
            name,
            mimeType: 'image/webp',
            bytes: new Uint8Array([1]),
          })),
        ),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- each table row verifies its own exporter invocation.
      const invalidResult = await invalid.images.captureImages({
        targetFile: 'mesh.ts',
        mode: 'multi_angle',
      });
      expect(invalidResult.success).toBe(false);
      if (invalidResult.success) {
        throw new Error('Expected invalid view identity result');
      }
      expect(invalidResult.message).toContain('Image capture expected');
    }

    await Promise.all(
      [
        (() => {
          const value = glb();
          new DataView(value.buffer).setUint32(4, 1, true);
          return value;
        })(),
        (() => {
          const value = glb();
          new DataView(value.buffer).setUint32(8, 24, true);
          return value;
        })(),
      ].map(async (malformed) => {
        const invalid = setup({
          success: true,
          issues: [],
          data: { format: 'gltf', content: malformed, hash: 'mesh' },
        });
        const invalidResult = await invalid.images.captureImages({
          targetFile: 'mesh.ts',
          mode: 'single',
        });
        expect(invalidResult.success).toBe(false);
        if (invalidResult.success) {
          throw new Error('Expected malformed GLB result');
        }
        expect(invalidResult.message).toContain('not a GLB 2 container');
        expect(invalid.exporter).not.toHaveBeenCalled();
      }),
    );
  });
});

describe('createRuntimeParameterAgentClient', () => {
  const fixture = async (gate?: Promise<void>, options: Readonly<{ sourceUnit?: boolean }> = {}) => {
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
          properties: { width: { type: 'double', ...(options.sourceUnit ? { ucumUnit: 'mm' } : {}) } },
        },
        defaults: { width: 1 },
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
    const current = await resolveParameterSnapshot({
      target,
      manifest,
      path: '.tau/parameters/main.py.json',
      bytes: null,
      preconditions: [],
    });
    const commit = vi.fn(async ({ input }: { input: { proposed: typeof current } }) => {
      await gate;
      return { status: 'applied', content: input.proposed.bytes! } as const;
    });
    const loads = vi.fn();
    const actor = createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: fromPromise(async () => {
            loads();
            return current;
          }),
          commitParameterSet: fromPromise(async ({ input }) => commit({ input })),
        },
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
      targetFile: 'main.py',
      requestId: 'agent:1',
      expected: current.identity,
      pressure: 'final',
      operation: { kind: 'replace-group-values', group: 'default', values: { width: 5 } },
    } as const;
    return { actor, adapter, request, current, commit, loads };
  };

  it('preserves operation identity and the complete business outcome', async () => {
    const { actor, adapter, request, commit } = await fixture();
    const result = await adapter.applyParameterOperation({
      ...request,
      expected: { ...request.expected, sourceRevision: 'stale' },
    });
    expect(result).toMatchObject({
      success: true,
      outcome: { status: 'rejected', requestId: 'agent:1', code: 'STALE_MANIFEST' },
    });
    expect(commit).not.toHaveBeenCalled();
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
      targetFile: 'main.py',
      requestId: 'agent:unit',
      expected: read.current.identity,
      pressure: 'final',
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: binding.parameter.value,
        resource: binding.schema.resource,
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
          loadParameterSet: fromPromise<ParameterSnapshot, ParameterSetLoadInput>(async () => {
            throw Object.assign(new Error('Saved parameter values are not a valid record.'), {
              code: 'INVALID_RECORD',
              applicationState: 'known-not-applied',
            });
          }),
        },
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

  it('projects only the wire snapshot and semantically re-admits manifests', async () => {
    const { actor, adapter, current } = await fixture();
    const result = await adapter.getParameters({ targetFile: 'main.py' });
    expect(result).toMatchObject({ success: true, status: 'resolved', current: { identity: current.identity } });
    if (!result.success || result.status !== 'resolved' || result.current === undefined) {
      throw new Error('Expected resolved parameters');
    }
    expect(Object.keys(result.current).sort()).toEqual(['entry', 'identity']);
    // Snapshots share the compiled manifest, which is deep-frozen, so corrupt a copy of it.
    Object.assign(current, { manifest: { ...current.manifest, revision: 'invalid' } });
    await expect(adapter.getParameters({ targetFile: 'main.py' })).resolves.toMatchObject({
      success: false,
      errorCode: 'VALIDATION_ERROR',
    });
    actor.stop();
  });
});
