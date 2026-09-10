import { describe, expect, it, vi } from 'vitest';

import { createRuntimeAgentClients } from '#runtime/runtime-agent-clients.js';
import type { RuntimeAgentClient, RuntimeAgentImageExporter } from '#runtime/runtime-agent-clients.js';
import type { ExportFile, HashedGeometryResult } from '@taucad/runtime/types';

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
      { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) },
    ]);
  const clients = createRuntimeAgentClients({
    runtime,
    exportImage: exporter,
    mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
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
        return { success: true, issues: [], data: { format: 'gltf', content: glb(), hash: input.source.path } };
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
      { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) },
    ]);
    const clients = createRuntimeAgentClients({
      runtime,
      exportImage,
      mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
    });

    const [blockedCapture, siblingCapture] = [
      clients.images.captureImages({ targetFile: 'a.ts', mode: 'single' }),
      clients.images.captureImages({ targetFile: 'b.ts', mode: 'single' }),
    ] as const;
    await previewEntered.promise;
    const [meshExport, drawingExport] = await Promise.all([
      clients.graphics.exportGeometry({ targetFile: 'mesh.ts', format: 'stl' }),
      clients.graphics.exportGeometry({ targetFile: 'drawing.ts', format: 'svg' }),
    ]);

    expect(meshExport).toMatchObject({ success: true, files: [{ name: 'mesh.ts.stl' }] });
    expect(drawingExport).toMatchObject({ success: true, files: [{ name: 'drawing.ts.svg' }] });
    expect(runtime.export).toHaveBeenCalledWith('stl', { source: { path: 'mesh.ts' }, signal: undefined });
    expect(runtime.export).toHaveBeenCalledWith('svg', { source: { path: 'drawing.ts' }, signal: undefined });
    await expect(siblingCapture).resolves.toMatchObject({ success: true, images: [{ view: 'isometric' }] });
    expect(exportImage).toHaveBeenCalledWith(expect.objectContaining({ geometryHash: 'b.ts' }));

    releasePreview.resolve();
    await expect(blockedCapture).resolves.toMatchObject({ success: true, images: [{ view: 'isometric' }] });
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
      return { success: true, issues: [], data: { format: 'gltf', content: glb(), hash: source.path } };
    });
    const exportGeometry = vi.fn<RuntimeAgentClient['export']>(async () => ({ success: true, data: [], issues: [] }));
    const exportImage = vi.fn<RuntimeAgentImageExporter>(async () => [
      { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) },
    ]);
    const clients = createRuntimeAgentClients({
      runtime: { evaluate, export: exportGeometry },
      exportImage,
      mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
    });
    const context = { signal: controller.signal };
    const cancelled = clients.images.captureImages({ targetFile: 'cancel.ts', mode: 'single' }, context);
    await entered.promise;
    controller.abort(new Error('stop capture'));
    finish.resolve({ success: true, issues: [], data: { format: 'gltf', content: glb(), hash: 'cancelled' } });
    await expect(cancelled).resolves.toMatchObject({ success: false, message: 'Error: stop capture' });
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    expect(exportImage).not.toHaveBeenCalled();

    const sibling = new AbortController();
    await expect(
      clients.images.captureImages({ targetFile: 'sibling.ts', mode: 'single' }, { signal: sibling.signal }),
    ).resolves.toMatchObject({ success: true });
    expect(exportImage).toHaveBeenCalledWith(expect.objectContaining({ signal: sibling.signal }));
    await clients.graphics.exportGeometry({ targetFile: 'sibling.ts', format: 'stl' }, { signal: sibling.signal });
    expect(exportGeometry).toHaveBeenCalledWith('stl', { source: { path: 'sibling.ts' }, signal: sibling.signal });

    await clients.kernelClient.getKernelResult('never.ts', context);
    await clients.graphics.exportGeometry({ targetFile: 'never.ts', format: 'stl' }, context);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(exportGeometry).toHaveBeenCalledTimes(1);
  });

  it('should preserve SVG drawing annotations and refuse meaningless formats before image execution', async () => {
    const svgExporter = vi.fn<RuntimeAgentImageExporter>(async () => [
      { name: 'drawing.png', mimeType: 'image/png', bytes: new Uint8Array([1]) },
    ]);
    const svg = setup(
      {
        success: true,
        issues: [],
        data: { format: 'svg', content: '<svg></svg>', hash: 'svg-hash', units: { length: 'cm' } },
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
    expect(svgJob.exportOptions).toMatchObject({ axes: true, scaleBar: true, lengthSymbol: 'cm' });
    await expect(svg.images.captureImages({ targetFile: 'drawing.ts', mode: 'multi_angle' })).resolves.toMatchObject({
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
      mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
    });
    await expect(
      withoutUnits.images.captureImages({ targetFile: 'drawing.ts', mode: 'single' }),
    ).resolves.toMatchObject({
      success: false,
      message: 'Annotated SVG capture requires the artifact coordinate length unit',
    });
    expect(svgExporter).toHaveBeenCalledTimes(1);

    const malformed = setup({
      success: true,
      issues: [],
      data: { format: 'gltf', content: new TextEncoder().encode('{}'), hash: 'json-gltf' },
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
      { success: true, issues: [], data: { format: 'gltf', content: bytes, hash: 'mesh' } },
      exportImage,
    );
    const result = await clients.images.captureImages({ targetFile: 'mesh.ts', mode: 'multi_angle' });

    expect(exportImage.mock.calls[0]?.[0]).toMatchObject({ content: bytes, sourceFormat: 'glb', geometryHash: 'mesh' });
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
      [{ name: 'wrong.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }],
      [{ name: 'empty.webp', mimeType: 'image/webp', bytes: new Uint8Array() }],
    ];
    await Promise.all(
      invalidFiles.map(async (files) => {
        const invalid = setup(
          { success: true, issues: [], data: { format: 'gltf', content: glb(), hash: 'mesh' } },
          vi.fn<RuntimeAgentImageExporter>(async () => files),
        );
        const invalidResult = await invalid.images.captureImages({ targetFile: 'mesh.ts', mode: 'single' });
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
        { success: true, issues: [], data: { format: 'gltf', content: glb(), hash: 'mesh' } },
        vi.fn<RuntimeAgentImageExporter>(async () =>
          names.map((name) => ({ name, mimeType: 'image/webp', bytes: new Uint8Array([1]) })),
        ),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- each table row verifies its own exporter invocation.
      const invalidResult = await invalid.images.captureImages({ targetFile: 'mesh.ts', mode: 'multi_angle' });
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
        const invalidResult = await invalid.images.captureImages({ targetFile: 'mesh.ts', mode: 'single' });
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
