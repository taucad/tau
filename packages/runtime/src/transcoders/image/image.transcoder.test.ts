import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ExportFile } from '@taucad/types';
import type * as RenderModule from '@taucad/render';
import type { TranscoderRuntime } from '#types/runtime-transcoder.types.js';
import { imageTranscoder } from '#transcoders/image/image.transcoder.js';
import { imageEdgeSchemas } from '#transcoders/image/image-export-options.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';

// `@taucad/render` is lazy-loaded by the transcoder (nx module-boundary rule
// forbids static value imports), so the mock reference is obtained via a
// type-only import + runtime dynamic import in beforeEach.
vi.mock('@taucad/render', async (importOriginal) => ({
  ...(await importOriginal<typeof RenderModule>()),
  renderGlbToImage: vi.fn(),
  renderGlbToImages: vi.fn(),
}));

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
  let context: Record<string, never>;
  let runtime: TranscoderRuntime;
  let renderGlbToImage: MockedFunction<typeof RenderModule.renderGlbToImage>;
  let renderGlbToImages: MockedFunction<typeof RenderModule.renderGlbToImages>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const renderModule = await import('@taucad/render');
    renderGlbToImage = vi.mocked(renderModule.renderGlbToImage);
    renderGlbToImages = vi.mocked(renderModule.renderGlbToImages);
    runtime = createRuntime();
    imageDefinition = await resolveImageDefinition();
    context = (await imageDefinition.initialize({}, runtime)) as Record<string, never>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should version renderer output for export cache invalidation', () => {
      expect(imageDefinition.version).toBe('5.0.0');
    });

    it('should initialize without loading the renderer', () => {
      expect(context).toBeDefined();
      expect(renderGlbToImage).not.toHaveBeenCalled();
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
        phi: 60,
        theta: -45,
        includeAxes: false,
        includeLabel: false,
        includeScale: false,
      });
    });

    it('should accept a strict ordered batch and reject cross-branch keys', () => {
      expect(
        imageEdgeSchemas.webp.parse({
          mode: 'batch',
          views: [{ id: 'front', phi: 90, theta: 0 }],
        }),
      ).toMatchObject({ mode: 'batch', views: [{ id: 'front', phi: 90, theta: 0 }] });
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          phi: 90,
          views: [{ id: 'front', phi: 90, theta: 0 }],
        }).success,
      ).toBe(false);
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'single', views: [] }).success).toBe(false);
    });

    it('should reject empty, duplicate, and unsafe batch view identifiers', () => {
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'batch', views: [] }).success).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [
            { id: 'front', phi: 90, theta: 0 },
            { id: 'front', phi: 90, theta: 180 },
          ],
        }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({ mode: 'batch', views: [{ id: '../front', phi: 90, theta: 0 }] }).success,
      ).toBe(false);
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
    it('should render the GLB and return exactly one ExportFile on success', async () => {
      const thumbnail: ExportFile = {
        name: 'thumbnail.webp',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
      };
      renderGlbToImage.mockResolvedValue(thumbnail);

      const result = await imageDefinition.transcode(
        { from: 'glb', to: 'webp', files: [glbFile()], options: {} },
        runtime,
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([thumbnail]);
      }
    });

    it('should forward the target format and schema-defaulted options to the renderer', async () => {
      renderGlbToImage.mockResolvedValue({
        name: 'thumbnail.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
      });
      const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      await imageDefinition.transcode(
        { from: 'glb', to: 'png', files: [glbFile(bytes)], options: {} },
        runtime,
        context,
      );

      expect(renderGlbToImage).toHaveBeenCalledWith(
        bytes,
        expect.objectContaining({
          format: 'png',
          width: 768,
          height: 432,
          phi: 60,
          theta: -45,
          margin: 0.1,
          includeAxes: false,
          includeLabel: false,
          includeScale: false,
          up: 'z',
        }),
      );
      expect(renderGlbToImage.mock.calls[0]?.[1]).not.toHaveProperty('mode');
    });

    it('should default JPEG to an opaque white background so the encoder never sees alpha', async () => {
      renderGlbToImage.mockResolvedValue({
        name: 'thumbnail.jpeg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
      });

      await imageDefinition.transcode({ from: 'glb', to: 'jpeg', files: [glbFile()], options: {} }, runtime, context);

      expect(renderGlbToImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({ format: 'jpeg', background: '#FFFFFF', quality: 0.92, up: 'z' }),
      );
    });

    it('should pass through caller overrides for camera and size', async () => {
      renderGlbToImage.mockResolvedValue({
        name: 'thumbnail.png',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
      });

      await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'png',
          files: [glbFile()],
          options: {
            width: 1920,
            height: 1080,
            phi: 30,
            includeLabel: true,
            label: 'Housing datum A',
          },
        },
        runtime,
        context,
      );

      expect(renderGlbToImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
          width: 1920,
          height: 1080,
          phi: 30,
          includeLabel: true,
          label: 'Housing datum A',
        }),
      );
    });

    it('should render an ordered batch with one plural renderer call', async () => {
      const front: ExportFile = { name: 'thumbnail-front.webp', bytes: new Uint8Array([1]), mimeType: 'image/webp' };
      const top: ExportFile = { name: 'thumbnail-top.webp', bytes: new Uint8Array([2]), mimeType: 'image/webp' };
      renderGlbToImages.mockResolvedValue([
        { id: 'front', file: front },
        { id: 'top', file: top },
      ]);
      const views = [
        { id: 'front', label: 'Front — View From +Z', phi: 90, theta: 0 },
        { id: 'top', label: 'Top — View From +Y', phi: 0, theta: 0 },
      ] as const;

      const result = await imageDefinition.transcode(
        {
          from: 'glb',
          to: 'webp',
          files: [glbFile()],
          options: {
            mode: 'batch',
            views,
            projection: 'orthographic',
            includeAxes: true,
            includeLabel: true,
            includeScale: true,
          },
        },
        runtime,
        context,
      );

      expect(result).toEqual({ success: true, data: [front, top], issues: [] });
      expect(renderGlbToImages).toHaveBeenCalledOnce();
      expect(renderGlbToImages).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
          format: 'webp',
          views,
          projection: 'orthographic',
          includeAxes: true,
          includeLabel: true,
          includeScale: true,
          up: 'z',
        }),
      );
      expect(renderGlbToImages.mock.calls[0]?.[1]).not.toHaveProperty('mode');
      expect(renderGlbToImage).not.toHaveBeenCalled();
    });

    it('should return an error result when the renderer throws', async () => {
      renderGlbToImage.mockRejectedValue(new Error('adapter-unavailable: no gpu adapter'));

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
        expect(renderGlbToImage).not.toHaveBeenCalled();
        expect(renderGlbToImages).not.toHaveBeenCalled();
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
      expect(renderGlbToImage).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up without error', async () => {
      await expect(imageDefinition.cleanup(context)).resolves.toBeUndefined();
    });
  });
});
