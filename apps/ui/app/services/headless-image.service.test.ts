import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import type { ExportFile } from '@taucad/types';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import { HeadlessImageError, HeadlessImageService } from '#services/headless-image.service.js';
import type { HeadlessImageJob } from '#services/headless-image.service.js';

const activeServices = new Set<HeadlessImageService>();
const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const files = (bytes = new Uint8Array([1, 2, 3])): ExportFile[] => [
  { name: 'thumbnail.webp', mimeType: 'image/webp', bytes },
];
const thumbnailJob = (identity: string): HeadlessImageJob => ({
  kind: 'automatic-thumbnail',
  identity,
  projectId: 'project-1',
  sourceFormat: 'glb',
  sourcePath: 'main.ts',
  geometryHash: 'geometry-hash',
  content: glb,
  format: 'webp',
  exportOptions: { width: 16, height: 16 },
});
const captureJob = (identity: string, overrides: Partial<HeadlessImageJob> = {}): HeadlessImageJob =>
  ({
    kind: 'capture',
    identity,
    sourceFormat: 'glb',
    sourcePath: 'main.ts',
    geometryHash: 'geometry-hash',
    content: glb,
    format: 'webp',
    exportOptions: { width: 16, height: 16 },
    ...overrides,
  }) as HeadlessImageJob;

const createFixture = () => {
  const imageClient = createMockRuntimeClient<typeof imageRuntime>();
  vi.mocked(imageClient.transcode).mockResolvedValue({ success: true, data: files(), issues: [] });
  const service = new HeadlessImageService({
    createImageClient: vi.fn().mockResolvedValue(imageClient),
    isGpuAvailable: () => true,
  });
  activeServices.add(service);
  return { imageClient, service };
};

describe('HeadlessImageService', () => {
  afterEach(() => {
    for (const service of activeServices) {
      service.dispose();
    }
    activeServices.clear();
    vi.restoreAllMocks();
  });

  it('transcodes the settled thumbnail GLB without a kernel render or filesystem', async () => {
    const { imageClient, service } = createFixture();
    await expect(service.export(thumbnailJob('thumb'))).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledWith({
      from: 'glb',
      to: 'webp',
      files: [{ name: 'render.glb', bytes: glb, mimeType: 'model/gltf-binary' }],
      options: { width: 16, height: 16 },
    });
  });

  it('transcodes settled GLB bytes without a kernel render or filesystem', async () => {
    const { imageClient, service } = createFixture();
    const job = captureJob('capture');
    if (job.sourceFormat !== 'glb') {
      throw new Error('Expected a GLB capture job');
    }
    await expect(service.export(job)).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledWith({
      from: 'glb',
      to: 'webp',
      files: [{ name: 'render.glb', bytes: job.content, mimeType: 'model/gltf-binary' }],
      options: { width: 16, height: 16 },
    });
  });

  it('serializes jobs without terminating active automatic work for priority', async () => {
    const { imageClient, service } = createFixture();
    let release: (() => void) | undefined;
    vi.mocked(imageClient.transcode).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { success: true, data: files(), issues: [] };
    });
    const automatic = service.export(thumbnailJob('automatic'));
    await vi.waitFor(() => {
      expect(imageClient.transcode).toHaveBeenCalledOnce();
    });
    const capture = service.export(captureJob('capture'));
    expect(imageClient.terminate).not.toHaveBeenCalled();
    release?.();
    await expect(Promise.all([automatic, capture])).resolves.toHaveLength(2);
  });

  it('retains the image client until owner disposal', async () => {
    const { imageClient, service } = createFixture();
    await service.export(thumbnailJob('thumb'));
    await service.export(captureJob('capture'));
    expect(imageClient.terminate).not.toHaveBeenCalled();
    service.dispose();
    expect(imageClient.terminate).toHaveBeenCalledOnce();
  });

  it('reuses one immutable capture result for the same geometry and normalized options', async () => {
    const { imageClient, service } = createFixture();
    const first = await service.export(captureJob('first'));
    first![0]!.bytes[0] = 255;

    const repeated = await service.export(captureJob('repeat', { exportOptions: { height: 16, width: 16 } }));

    expect(repeated).toEqual(files());
    expect(repeated).not.toBe(first);
    expect(imageClient.transcode).toHaveBeenCalledOnce();
  });

  it('misses the capture cache when geometry or render options change', async () => {
    const { imageClient, service } = createFixture();
    await service.export(captureJob('initial'));
    await service.export(captureJob('geometry', { geometryHash: 'changed-geometry' }));
    await service.export(captureJob('dimensions', { exportOptions: { width: 32, height: 16 } }));
    await service.export(
      captureJob('camera', {
        exportOptions: {
          width: 16,
          height: 16,
          camera: { framing: 'fit', direction: [1, 1, 1], up: [0, 0, 1], margin: 0.05 },
        },
      }),
    );
    await service.export(
      captureJob('visibility', { exportOptions: { width: 16, height: 16, visiblePrimitives: [0] } }),
    );

    expect(imageClient.transcode).toHaveBeenCalledTimes(5);
  });

  it('does not cache failed captures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { imageClient, service } = createFixture();
    vi.mocked(imageClient.transcode)
      .mockResolvedValueOnce({
        success: false,
        issues: [
          {
            message: 'encode failed',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            details: { type: 'render', code: 'encode' },
          },
        ],
      })
      .mockResolvedValueOnce({ success: true, data: files(), issues: [] });

    await expect(service.export(captureJob('failed'))).rejects.toMatchObject({ code: 'encode' });
    await expect(service.export(captureJob('retry'))).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledTimes(2);
  });

  it('suppresses repeated automatic failures for one immutable identity', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { imageClient, service } = createFixture();
    vi.mocked(imageClient.transcode).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'encode failed',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          details: { type: 'render', code: 'encode' },
        },
      ],
    });
    await expect(service.export(thumbnailJob('broken'))).rejects.toMatchObject({ code: 'encode' });
    await expect(service.export(thumbnailJob('broken'))).resolves.toBeUndefined();
    expect(imageClient.transcode).toHaveBeenCalledOnce();
  });

  it('renders SVG without probing GPU or creating the image runtime client', async () => {
    const createImageClient = vi.fn();
    const service = new HeadlessImageService({
      createImageClient,
      isGpuAvailable: () => false,
    });
    activeServices.add(service);
    const result = await service.export({
      kind: 'capture',
      identity: 'svg',
      sourceFormat: 'svg',
      sourcePath: 'drawing.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>',
      format: 'png',
      exportOptions: { width: 32, height: 32 },
    });
    expect(result?.[0]?.mimeType).toBe('image/png');
    expect(createImageClient).not.toHaveBeenCalled();
  });

  it('reports a stable no-GPU failure before creating the image worker', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new HeadlessImageService({
      isGpuAvailable: () => false,
    });
    activeServices.add(service);
    const result = service.export(captureJob('missing-gpu'));
    await expect(result).rejects.toBeInstanceOf(HeadlessImageError);
    await expect(result).rejects.toMatchObject({ code: 'adapter-unavailable' });
  });
});
