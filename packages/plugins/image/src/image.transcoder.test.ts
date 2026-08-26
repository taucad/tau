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

vi.mock('nanoraster', async (importOriginal) => ({
  ...(await importOriginal<typeof RenderModule>()),
  renderImage: vi.fn(),
  renderImages: vi.fn(),
}));
vi.mock('#image-backend.js', () => ({ loadImageBackend: backendMock.load }));

const createRuntime = (): TranscoderRuntime =>
  mock<TranscoderRuntime>({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

const glbFile = (bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46])): ExportFile => ({
  name: 'model.glb',
  bytes,
  mimeType: 'model/gltf-binary',
});

describe('image transcoder', () => {
  const resolveImageDefinition = async () => resolveRuntimePluginDefinition('transcoder', imageTranscoder());
  let imageDefinition: Awaited<ReturnType<typeof resolveImageDefinition>>;
  let context: { renderer: typeof RenderModule };
  let runtime: TranscoderRuntime;
  let renderImage: MockedFunction<typeof RenderModule.renderImage>;
  let renderImages: MockedFunction<typeof RenderModule.renderImages>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const renderModule = await import('nanoraster');
    backendMock.load.mockResolvedValue(renderModule);
    renderImage = vi.mocked(renderModule.renderImage);
    renderImages = vi.mocked(renderModule.renderImages);
    runtime = createRuntime();
    imageDefinition = await resolveImageDefinition();
    context = (await imageDefinition.initialize({}, runtime)) as { renderer: typeof RenderModule };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should version renderer output for export cache invalidation', () => {
      expect(imageDefinition.version).toBe('8.0.0');
    });

    it('should load the renderer once during initialize', () => {
      expect(context.renderer).toBeDefined();
      expect(backendMock.load).toHaveBeenCalledOnce();
      expect(renderImage).not.toHaveBeenCalled();
    });
  });

  describe('edges', () => {
    it('should declare png, webp, and jpeg as Z-up metre glb→<format> mesh edges', () => {
      const targets = imageDefinition.edges.map((edge) => edge.to);
      expect(targets).toEqual(['png', 'webp', 'jpeg']);
      for (const edge of imageDefinition.edges) {
        expect(edge.from).toBe('glb');
        expect(edge.fidelity).toBe('mesh');
        expect(edge.optionsSchema).toBeDefined();
        expect(edge.sourceOptions).toEqual({
          coordinateSystem: 'z-up',
          unit: { length: 'meter' },
        });
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
    it('should reuse the initialized renderer across transcodes', async () => {
      renderImage.mockResolvedValue({
        name: 'render.webp',
        bytes: new Uint8Array([1]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      });

      await imageDefinition.transcode({ from: 'glb', to: 'webp', files: [glbFile()], options: {} }, runtime, context);
      await imageDefinition.transcode({ from: 'glb', to: 'webp', files: [glbFile()], options: {} }, runtime, context);

      expect(backendMock.load).toHaveBeenCalledOnce();
      expect(renderImage).toHaveBeenCalledTimes(2);
    });

    it('should render the GLB and return exactly one ExportFile on success', async () => {
      const thumbnail: RenderModule.RenderedImageFile = {
        name: 'render.webp',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
        width: 768,
        height: 432,
      };
      renderImage.mockResolvedValue(thumbnail);

      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: {} },
        runtime,
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([{ name: thumbnail.name, bytes: thumbnail.bytes, mimeType: thumbnail.mimeType }]);
        expect(result.data[0]).not.toHaveProperty('width');
        expect(result.data[0]).not.toHaveProperty('height');
      }
    });

    it('should forward the target format and schema-defaulted options to the renderer', async () => {
      renderImage.mockResolvedValue({
        name: 'render.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 768,
        height: 432,
      });
      const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      await imageDefinition.transcode(
        { from: 'glb', to: 'png', files: [glbFile(bytes)], options: {} },
        runtime,
        context,
      );

      expect(renderImage).toHaveBeenCalledWith(
        bytes,
        expect.objectContaining({
          format: 'png',
          width: 768,
          height: 432,
          lineWidth: 2,
          axes: false,
          scaleBar: false,
          camera: {
            framing: 'fit',
            direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
            up: [0, 0, 1],
            margin: 0.1,
            projection: { kind: 'perspective', verticalFieldOfView: 45 },
          },
        }),
      );
      expect(renderImage.mock.calls[0]?.[1]).not.toHaveProperty('mode');
      expect(renderImage.mock.calls[0]?.[1]).not.toHaveProperty('includeAxes');
      expect(renderImage.mock.calls[0]?.[1]).not.toHaveProperty('includeScale');
    });

    it('should default JPEG to an opaque white background so the encoder never sees alpha', async () => {
      renderImage.mockResolvedValue({
        name: 'render.jpeg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
        width: 768,
        height: 432,
      });

      await imageDefinition.transcode({ from: 'glb', to: 'jpeg', files: [glbFile()], options: {} }, runtime, context);

      expect(renderImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({ format: 'jpeg', background: '#FFFFFF', quality: 0.92 }),
      );
    });

    it('should pass through camera, presentation, and size', async () => {
      renderImage.mockResolvedValue({
        name: 'render.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
      });

      await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'png',
          files: [glbFile()],
          options: {
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
            visiblePrimitives: [{ nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 }],
            sections: {
              planes: [
                { point: [0, 0, 0], normal: [0, 0, 1] },
                { point: [1, 0, 0], normal: [-1, 0, 0] },
              ],
              clipSurfaces: true,
              clipLines: false,
            },
          },
        },
        runtime,
        context,
      );

      expect(renderImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
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
      );
      expect(renderImage.mock.calls[0]?.[1]).not.toHaveProperty('includeLabel');
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
      renderImages.mockResolvedValue([
        { id: 'front', file: front },
        { id: 'top', file: top },
      ]);
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
          options: {
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
          },
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
      });
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('mode');
      expect(renderImages.mock.calls[0]?.[1]).not.toHaveProperty('includeLabel');
      expect(renderImage).not.toHaveBeenCalled();
    });

    it('should return an error result when the renderer throws', async () => {
      renderImage.mockRejectedValue(new Error('adapter-unavailable: no gpu adapter'));

      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: {} },
        runtime,
        context,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('adapter-unavailable');
        expect(result.issues[0]!.severity).toBe('error');
        expect(result.issues[0]!.details).toEqual({ type: 'render', code: 'adapter-unavailable' });
      }
    });

    it.each([{ files: [] }, { files: [glbFile(), glbFile()] }])(
      'should reject a non-singular GLB source set',
      async ({ files }) => {
        const result = await imageDefinition.transcode(
          { from: 'glb', to: 'webp', files, options: {} },
          runtime,
          context,
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues[0]!.message).toContain('expected exactly one GLB source artifact');
        }
        expect(renderImage).not.toHaveBeenCalled();
        expect(renderImages).not.toHaveBeenCalled();
      },
    );

    it('should reject options that violate the edge schema', async () => {
      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'png', files: [glbFile()], options: { width: 99_999 } },
        runtime,
        context,
      );

      expect(result.success).toBe(false);
      expect(result.issues[0]?.message).toContain('Too big');
      expect(renderImage).not.toHaveBeenCalled();
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
