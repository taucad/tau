import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockedFunction } from 'vitest';

import { mock } from 'vitest-mock-extended';
import type { ExportFile } from '@taucad/runtime/types';
import type * as RenderModule from 'nanoraster';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { imageTranscoder } from '#image.transcoder.js';
import { imageEdgeSchemas } from '#image-export-options.js';

const backendMock = vi.hoisted(() => ({ load: vi.fn() }));
const sceneBoundsMock = vi.hoisted(() => ({
  read: vi.fn(
    async (_options: {
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly targetWorld: { readonly up: string; readonly forward: string; readonly metersPerUnit: number };
    }) => ({ min: [-2, -1, -0.5] as const, max: [2, 1, 0.5] as const }),
  ),
}));
type SpanAttributes = Record<string, string | number | boolean>;
const endSpan = vi.fn<(values?: SpanAttributes) => void>();

vi.mock('nanoraster', async (importOriginal) => ({
  ...(await importOriginal<typeof RenderModule>()),
  describeAdapter: vi.fn(),
  renderImage: vi.fn(),
  renderImages: vi.fn(),
}));
vi.mock('#image-backend.js', () => ({ loadImageBackend: backendMock.load }));
vi.mock('#gltf-scene-bounds.js', () => ({ readGltfSceneBounds: sceneBoundsMock.read }));

const createRuntime = (): TranscoderRuntime =>
  mock<TranscoderRuntime>({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tracer: { startSpan: vi.fn(() => ({ end: endSpan })) },
  });

const timings: RenderModule.RenderTimings = {
  parse: 1,
  setup: 2,
  capBuild: 3,
  upload: 4,
  peakReadbackBytes: 128,
  glbParses: 1,
  adapterDeviceRequests: 0,
  pipelineSets: 0,
  presentationBuilds: 1,
  sceneUploads: 1,
  targetAllocations: 0,
  views: [{ id: 'single', render: 5, overlay: 6, encode: 7 }],
};

const timedImages = (
  images: Array<{ readonly id: string; readonly file: RenderModule.RenderedImageFile }>,
  value: RenderModule.RenderTimings = timings,
) => Object.assign(images, { timings: value });

const glbFile = (bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46])): ExportFile => ({
  name: 'model.glb',
  bytes,
  mimeType: 'model/gltf-binary',
});

describe('image transcoder', () => {
  const resolveImageDefinition = async () => resolveRuntimePluginDefinition('transcoder', imageTranscoder());
  let imageDefinition: Awaited<ReturnType<typeof resolveImageDefinition>>;
  let context: { renderer: typeof RenderModule; adapter: RenderModule.AdapterInfo | undefined };
  let runtime: TranscoderRuntime;
  let renderImage: MockedFunction<typeof RenderModule.renderImage>;
  let renderImages: MockedFunction<typeof RenderModule.renderImages>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const renderModule = await import('nanoraster');
    backendMock.load.mockResolvedValue(renderModule);
    vi.mocked(renderModule.describeAdapter).mockResolvedValue({
      backend: 'webgpu',
      name: 'Test Adapter',
      deviceType: 'integrated-gpu',
    });
    renderImage = vi.mocked(renderModule.renderImage);
    renderImages = vi.mocked(renderModule.renderImages);
    runtime = createRuntime();
    imageDefinition = await resolveImageDefinition();
    context = (await imageDefinition.initialize({}, runtime)) as typeof context;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should version renderer output for export cache invalidation', () => {
      expect(imageDefinition.version).toBe('10.0.0');
    });

    it('should load the renderer and describe its adapter once during initialize', () => {
      expect(context.renderer).toBeDefined();
      expect(context.adapter).toEqual({ backend: 'webgpu', name: 'Test Adapter', deviceType: 'integrated-gpu' });
      expect(backendMock.load).toHaveBeenCalledOnce();
      expect(context.renderer.describeAdapter).toHaveBeenCalledOnce();
      expect(renderImage).not.toHaveBeenCalled();
    });
  });

  describe('edges', () => {
    it('should declare png, webp, and jpeg over canonical glTF input', () => {
      const targets = imageDefinition.edges.map((edge) => edge.to);
      expect(targets).toEqual(['png', 'webp', 'jpeg']);
      for (const edge of imageDefinition.edges) {
        expect(edge.from).toBe('glb');
        expect(edge.fidelity).toBe('mesh');
        expect(edge.optionsSchema).toBeDefined();
        expect(edge.sourceOptions).toBeUndefined();
      }
    });
  });

  describe('image option schemas', () => {
    it('should default an empty request to the strict single branch', () => {
      expect(imageEdgeSchemas.webp.parse({})).toMatchObject({
        mode: 'single',
        axes: false,
        scaleBar: false,
      });
    });

    it('should accept a strict ordered batch and reject cross-branch keys', () => {
      expect(
        imageEdgeSchemas.webp.parse({
          mode: 'batch',
          views: [{ id: 'front' }],
        }),
      ).toMatchObject({ mode: 'batch', views: [{ id: 'front' }] });
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          phi: 90,
          views: [{ id: 'front' }],
        }).success,
      ).toBe(false);
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'single', views: [] }).success).toBe(false);
    });

    it('should reject empty, duplicate, and unsafe batch view identifiers', () => {
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'batch', views: [] }).success).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [{ id: 'front' }, { id: 'front' }],
        }).success,
      ).toBe(false);
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'batch', views: [{ id: '../front' }] }).success).toBe(false);
    });
  });

  describe('compile-time / runtime parity (drift guard)', () => {
    it('should declare a runtime edge for every key in imageEdgeSchemas', () => {
      const runtimeTargets = new Set(imageDefinition.edges.map((edge) => edge.to));
      for (const target of Object.keys(imageEdgeSchemas)) {
        expect(runtimeTargets).toContain(target);
      }
    });

    it('should point each runtime edge optionsSchema at its imageEdgeSchemas entry', () => {
      for (const edge of imageDefinition.edges) {
        expect(edge.optionsSchema).toBe(imageEdgeSchemas[edge.to as keyof typeof imageEdgeSchemas]);
      }
    });
  });

  describe('transcode', () => {
    it('should resolve bounds framing once and give nanoraster a fixed camera', async () => {
      const file = {
        name: 'render.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 576,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'webp',
          files: [glbFile()],
          options: imageEdgeSchemas.webp.parse({
            width: 768,
            height: 576,
            camera: {
              framing: 'bounds',
              direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
              up: [0, 0, 1],
              margin: 0.1,
              projection: { kind: 'perspective', verticalFieldOfView: 45 },
            },
          }),
        },
        runtime,
        context,
      );

      expect(sceneBoundsMock.read).toHaveBeenCalledOnce();
      expect(sceneBoundsMock.read.mock.calls[0]?.[0]).toEqual({
        bytes: glbFile().bytes,
        targetWorld: { up: '+z', forward: '-y', metersPerUnit: 1 },
      });
      const renderOptions = renderImages.mock.calls[0]?.[1];
      const camera = renderOptions?.views[0]?.camera;
      expect(camera?.framing).toBe('fixed');
      if (camera?.framing !== 'fixed') {
        throw new Error('Expected bounds framing to lower to a fixed camera.');
      }
      expect(camera.target).toEqual([0, 0, 0]);
      expect(camera.position).toHaveLength(3);
      expect(camera.up).toHaveLength(3);
      expect(camera.projection).toMatchObject({ kind: 'perspective', verticalFieldOfView: 45 });
      expect(camera.clipping?.near).toBeGreaterThan(0);
      expect(camera.clipping?.far).toBeGreaterThan(camera.clipping?.near ?? Number.POSITIVE_INFINITY);
      /* oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Assertion preserves the public telemetry key. */
      expect(typeof endSpan.mock.calls.at(-1)?.[0]?.['boundsFitMs']).toBe('number');
      /* oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Assertion preserves the public telemetry key. */
      expect(typeof endSpan.mock.calls.at(-1)?.[0]?.['boundsParseMs']).toBe('number');
      /* oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Assertion preserves the public telemetry key. */
      expect(typeof endSpan.mock.calls.at(-1)?.[0]?.['cameraSolveMs']).toBe('number');
    });

    it('should reuse one scene-bounds read across a mixed batch', async () => {
      const file = {
        name: 'front.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 576,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'front', file }]));
      const boundsCamera = {
        framing: 'bounds',
        direction: [0, -1, 0],
        up: [0, 0, 1],
        projection: { kind: 'perspective', verticalFieldOfView: 45 },
      } as const;

      await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'webp',
          files: [glbFile()],
          options: imageEdgeSchemas.webp.parse({
            mode: 'batch',
            views: [
              { id: 'front', camera: boundsCamera },
              { id: 'top', camera: { ...boundsCamera, direction: [0, 0, 1], up: [0, 1, 0] } },
              { id: 'native', camera: { framing: 'fit', direction: [1, -1, 1], up: [0, 0, 1] } },
            ],
          }),
        },
        runtime,
        context,
      );

      expect(sceneBoundsMock.read).toHaveBeenCalledOnce();
      const views = renderImages.mock.calls[0]?.[1].views;
      expect(views?.map((view) => [view.id, view.camera?.framing])).toEqual([
        ['front', 'fixed'],
        ['top', 'fixed'],
        ['native', 'fit'],
      ]);
    });

    it('should not read scene bounds for native fit and fixed cameras', async () => {
      const file = {
        name: 'render.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: imageEdgeSchemas.webp.parse({}) },
        runtime,
        context,
      );

      expect(sceneBoundsMock.read).not.toHaveBeenCalled();
    });

    it('should reuse the initialized renderer across transcodes', async () => {
      const file = {
        name: 'render.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      const options = imageEdgeSchemas.webp.parse({});
      await imageDefinition.transcode({ from: 'glb', to: 'webp', files: [glbFile()], options }, runtime, context);
      await imageDefinition.transcode({ from: 'glb', to: 'webp', files: [glbFile()], options }, runtime, context);

      expect(backendMock.load).toHaveBeenCalledOnce();
      expect(renderImages).toHaveBeenCalledTimes(2);
    });

    it('should render the GLB and return exactly one ExportFile on success', async () => {
      const thumbnail: RenderModule.RenderedImageFile = {
        name: 'render.webp',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      };
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file: thumbnail }]));

      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: imageEdgeSchemas.webp.parse({}) },
        runtime,
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([{ name: 'render.webp', bytes: thumbnail.bytes, mimeType: thumbnail.mimeType }]);
        expect(result.data[0]).not.toHaveProperty('width');
        expect(result.data[0]).not.toHaveProperty('height');
      }
      expect(runtime.tracer.startSpan).toHaveBeenCalledWith('image.render', {
        mode: 'single',
        format: 'webp',
        width: 768,
        height: 432,
        adapterBackend: 'webgpu',
        adapterName: 'Test Adapter',
        adapterDeviceType: 'integrated-gpu',
      });
      /* oxlint-disable tau-lint/no-time-unit-suffix -- Assertions preserve the public telemetry key names. */
      expect(endSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          outputCount: 1,
          outputBytes: 3,
          parseMs: 1,
          renderMs: 5,
          encodeMs: 7,
          glbParses: 1,
          sceneUploads: 1,
        }),
      );
      /* oxlint-enable tau-lint/no-time-unit-suffix */
    });

    it.each([
      { format: 'png', mimeType: 'image/png' },
      { format: 'webp', mimeType: 'image/webp' },
      { format: 'jpeg', mimeType: 'image/jpeg' },
    ] as const)(
      'should preserve singular $format bytes through the timed one-view plan',
      async ({ format, mimeType }) => {
        const bytes = new Uint8Array([9, 8, 7, 6]);
        renderImages.mockResolvedValue(
          timedImages([
            {
              id: 'single',
              file: { name: `render-single.${format}`, bytes, mimeType, width: 32, height: 24 },
            },
          ]),
        );

        const request =
          format === 'png'
            ? {
                from: 'glb' as const,
                to: format,
                files: [glbFile()],
                options: imageEdgeSchemas.png.parse({ width: 32, height: 24 }),
              }
            : format === 'webp'
              ? {
                  from: 'glb' as const,
                  to: format,
                  files: [glbFile()],
                  options: imageEdgeSchemas.webp.parse({ width: 32, height: 24 }),
                }
              : {
                  from: 'glb' as const,
                  to: format,
                  files: [glbFile()],
                  options: imageEdgeSchemas.jpeg.parse({ width: 32, height: 24 }),
                };
        const result = await imageDefinition.transcode(request, runtime, context);

        expect(result).toEqual({
          success: true,
          data: [{ name: `render.${format}`, bytes, mimeType }],
          issues: [],
        });
        expect(renderImages).toHaveBeenCalledWith(
          expect.any(Uint8Array),
          expect.objectContaining({ timings: true, views: [expect.objectContaining({ id: 'single' })] }),
        );
      },
    );

    it('should forward the target format and schema-defaulted options to the renderer', async () => {
      const file = {
        name: 'render.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 768,
        height: 432,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));
      const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      await imageDefinition.transcode(
        { from: 'glb', to: 'png', files: [glbFile(bytes)], options: imageEdgeSchemas.png.parse({}) },
        runtime,
        context,
      );

      expect(renderImages).toHaveBeenCalledWith(
        bytes,
        expect.objectContaining({
          format: 'png',
          width: 768,
          height: 432,
          lineWidth: 3,
          axes: false,
          scaleBar: false,
          timings: true,
          views: [
            {
              id: 'single',
              camera: {
                framing: 'fit',
                direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
                up: [0, 0, 1],
                margin: 0.1,
                projection: { kind: 'perspective', verticalFieldOfView: 45 },
              },
            },
          ],
        }),
      );
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('mode');
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('includeAxes');
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('includeScale');
    });

    it('should default JPEG to an opaque white background so the encoder never sees alpha', async () => {
      const file = {
        name: 'render.jpeg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
        width: 768,
        height: 432,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      await imageDefinition.transcode(
        { from: 'glb', to: 'jpeg', files: [glbFile()], options: imageEdgeSchemas.jpeg.parse({}) },
        runtime,
        context,
      );

      expect(renderImages).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({ format: 'jpeg', background: '#FFFFFF', quality: 0.92 }),
      );
    });

    it('should pass through camera, presentation, and size', async () => {
      const file = {
        name: 'render.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'png',
          files: [glbFile()],
          options: imageEdgeSchemas.png.parse({
            width: 1920,
            height: 1080,
            camera: {
              framing: 'fixed',
              position: [8, -6, 4],
              target: [1, 2, 3],
              up: [0, 0, 1],
              projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
              clipping: { near: 0.2, far: 900 },
            },
            label: 'Housing datum A',
            surfaces: false,
            lines: true,
            lighting: {
              lights: [{ direction: [0, 1, 0], color: [2, 2, 2] }],
              space: 'world',
              exposure: 1.5,
            },
            visiblePrimitives: [{ nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 }],
            sections: {
              planes: [
                { point: [0, 0, 0], normal: [0, 0, 1] },
                { point: [1, 0, 0], normal: [-1, 0, 0] },
              ],
              clipSurfaces: true,
              clipLines: false,
            },
          }),
        },
        runtime,
        context,
      );

      expect(renderImages).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
          width: 1920,
          height: 1080,
          surfaces: false,
          lines: true,
          lighting: {
            lights: [{ direction: [0, 1, 0], color: [2, 2, 2] }],
            space: 'world',
            exposure: 1.5,
          },
          visiblePrimitives: [{ nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 }],
          sections: {
            planes: [
              { point: [0, 0, 0], normal: [0, 0, 1] },
              { point: [1, 0, 0], normal: [-1, 0, 0] },
            ],
            clipSurfaces: true,
            clipLines: false,
          },
          views: [
            {
              id: 'single',
              camera: {
                framing: 'fixed',
                position: [8, -6, 4],
                target: [1, 2, 3],
                up: [0, 0, 1],
                projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
                clipping: { near: 0.2, far: 900 },
              },
              label: 'Housing datum A',
            },
          ],
        }),
      );
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('includeLabel');
    });

    it('should render an ordered batch with one plural renderer call', async () => {
      const front: RenderModule.RenderedImageFile = {
        name: 'render-front.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      };
      const top: RenderModule.RenderedImageFile = {
        name: 'render-top.webp',
        bytes: new Uint8Array([2]),
        mimeType: 'image/webp',
        width: 384,
        height: 216,
      };
      renderImages.mockResolvedValue(
        timedImages(
          [
            { id: 'front', file: front },
            { id: 'top', file: top },
          ],
          {
            ...timings,
            views: [
              { id: 'front', render: 1, overlay: 2, encode: 3 },
              { id: 'top', render: 4, overlay: 5, encode: 6 },
            ],
          },
        ),
      );
      const views = [
        {
          id: 'front',
          label: 'Front — View From +Z',
          camera: { framing: 'fit', direction: [0, -1, 0], up: [0, 0, 1], projection: { kind: 'orthographic' } },
        },
        {
          id: 'top',
          camera: { framing: 'fit', direction: [0, 0, 1], up: [0, 1, 0], projection: { kind: 'orthographic' } },
          width: 384,
          height: 216,
          quality: 0.9,
        },
      ] as const;

      const result = await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'webp',
          files: [glbFile()],
          options: imageEdgeSchemas.webp.parse({
            mode: 'batch',
            views,
            axes: true,
            scaleBar: true,
            surfaces: false,
            sections: {
              planes: [{ point: [0, 0, 0], normal: [0, 0, 1] }],
              clipSurfaces: true,
              clipLines: true,
            },
          }),
        },
        runtime,
        context,
      );

      expect(result).toEqual({
        success: true,
        data: [
          { name: front.name, bytes: front.bytes, mimeType: front.mimeType },
          { name: top.name, bytes: top.bytes, mimeType: top.mimeType },
        ],
        issues: [],
      });
      expect(renderImages).toHaveBeenCalledOnce();
      expect(renderImages.mock.calls[0]?.[0]).toEqual(expect.any(Uint8Array));
      expect(renderImages.mock.calls[0]?.[1]).toMatchObject({
        format: 'webp',
        quality: 1,
        views: [
          {
            id: 'front',
            camera: { projection: { kind: 'orthographic' } },
          },
          {
            id: 'top',
            camera: { projection: { kind: 'orthographic' } },
          },
        ],
        axes: true,
        scaleBar: true,
        surfaces: false,
        sections: {
          planes: [{ point: [0, 0, 0], normal: [0, 0, 1] }],
          clipSurfaces: true,
          clipLines: true,
        },
        timings: true,
      });
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('mode');
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('includeLabel');
      expect(renderImage).not.toHaveBeenCalled();
    });

    it('should return an error result when the renderer throws', async () => {
      renderImages.mockRejectedValue(new Error('adapter-unavailable: no gpu adapter'));

      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: imageEdgeSchemas.webp.parse({}) },
        runtime,
        context,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('adapter-unavailable');
        expect(result.issues[0]!.severity).toBe('error');
        expect(result.issues[0]!.details).toEqual({ type: 'render', code: 'adapter-unavailable' });
      }
      expect(endSpan).toHaveBeenCalledWith({ success: false, errorCode: 'adapter-unavailable' });
    });

    it.each([{ files: [] }, { files: [glbFile(), glbFile()] }])(
      'should reject a non-singular GLB source set',
      async ({ files }) => {
        const result = await imageDefinition.transcode(
          { from: 'glb', to: 'webp', files, options: imageEdgeSchemas.webp.parse({}) },
          runtime,
          context,
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues[0]!.message).toContain('expected exactly one GLB source artifact');
        }
        expect(renderImages).not.toHaveBeenCalled();
      },
    );

    it('should trust the options already validated by the runtime boundary', async () => {
      const options = imageEdgeSchemas.png.parse({});
      const parse = vi.spyOn(imageEdgeSchemas.png, 'parse');
      const file = {
        name: 'render.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 768,
        height: 432,
      } as const;
      renderImages.mockResolvedValue(timedImages([{ id: 'single', file }]));

      await imageDefinition.transcode({ from: 'glb', to: 'png', files: [glbFile()], options }, runtime, context);

      expect(parse).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up without error', async () => {
      const { cleanup } = imageDefinition;
      expect(cleanup).toBeDefined();
      if (!cleanup) {
        return;
      }
      await expect(cleanup(context)).resolves.toBeUndefined();
    });
  });
});
