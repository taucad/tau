import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import type { PartThumbnailRequest, PartThumbnailSource } from '#services/part-thumbnail.service.js';
import { HeadlessImageService } from '#services/headless-image.service.js';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';

const source: PartThumbnailSource = {
  sourcePath: 'main.ts',
  geometryHash: 'whole-glb-hash',
  content: new Uint8Array([1, 2, 3]),
};
const part = (id: string, nodeIndex: number): PartThumbnailRequest => ({
  id,
  primitives: [{ nodeIndex, meshIndex: 0, primitiveIndex: 0 }],
});
const image = (index: number, byte = index + 1): ExportFile => ({
  name: `render-part-${index}.webp`,
  mimeType: 'image/webp',
  bytes: new Uint8Array([byte]),
});
const services = new Set<PartThumbnailService>();
const fixture = (exportImage: HeadlessImageService['export']) => {
  const service = new PartThumbnailService({ export: exportImage });
  services.add(service);
  return service;
};

describe('PartThumbnailService', () => {
  afterEach(() => {
    for (const service of services) {
      service.dispose();
    }
    services.clear();
    vi.restoreAllMocks();
  });

  it('should render exact per-part instances in bounded ordered batches through the shared queue', async () => {
    const exportImage = vi.fn(async (job: Parameters<HeadlessImageService['export']>[0]) => {
      if (job.sourceFormat !== 'glb' || job.exportOptions['mode'] !== 'batch') {
        throw new Error('Expected GLB batch');
      }
      return [image(3), image(2), image(1), image(0)];
    });
    const service = fixture(exportImage);
    const parts = Array.from({ length: 5 }, (_, index) => part(`part-${index}`, index));
    parts[0] = {
      id: 'part-0',
      primitives: [
        { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
        { nodeIndex: 8, meshIndex: 0, primitiveIndex: 1 },
      ],
    };
    service.request(source, parts);
    await vi.waitFor(() => {
      expect(service.get('part-4')?.status).toBe('ready');
    });
    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(exportImage.mock.calls[0]?.[0]).toMatchObject({
      kind: 'automatic-thumbnail',
      sourcePath: 'main.ts',
      exportOptions: {
        mode: 'batch',
        width: 256,
        height: 256,
        views: [
          {
            visiblePrimitives: [
              { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
              { nodeIndex: 8, meshIndex: 0, primitiveIndex: 1 },
            ],
          },
          { visiblePrimitives: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }] },
          { visiblePrimitives: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }] },
          { visiblePrimitives: [{ nodeIndex: 3, meshIndex: 0, primitiveIndex: 0 }] },
        ],
      },
    });
    expect(exportImage.mock.calls[0]?.[0]).not.toHaveProperty('projectId');
    expect(service.get('part-0')?.bytes).toEqual(new Uint8Array([1]));
    expect(service.get('part-4')?.bytes).toEqual(new Uint8Array([1]));
    service.request(source, parts);
    expect(exportImage).toHaveBeenCalledTimes(2);
  });

  it('invalidates an ineligible presentation and drops its late preview', async () => {
    const pending = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 6)])
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce([image(0, 9)]);
    const service = fixture(exportImage);
    service.request(source, [part('old', 0)]);
    await vi.waitFor(() => expect(service.get('old')?.status).toBe('ready'));
    service.request({ ...source, geometryHash: 'pending-glb' }, [part('old', 0)]);
    await vi.waitFor(() => expect(exportImage).toHaveBeenCalledTimes(2));
    expect(service.get('old')).toMatchObject({ status: 'pending', bytes: new Uint8Array([6]) });
    service.invalidate();
    expect(service.get('old')).toMatchObject({ status: 'ready', bytes: new Uint8Array([6]) });
    pending.resolve([image(0, 8)]);
    await Promise.resolve();
    expect(service.get('old')?.bytes).toEqual(new Uint8Array([6]));
    service.request({ ...source, geometryHash: 'new-glb' }, [part('new', 1)]);
    await vi.waitFor(() => expect(service.get('new')?.status).toBe('ready'));
    expect(service.get('new')?.bytes).toEqual(new Uint8Array([9]));
  });

  it('should reject stale batch results and keep the last good preview while refreshing', async () => {
    const stale = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 8)])
      .mockImplementationOnce(async () => stale.promise)
      .mockResolvedValueOnce([image(0, 9)]);
    const service = fixture(exportImage);
    service.request(source, [part('gear', 1)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(service.get('gear')?.bytes).toEqual(new Uint8Array([8]));

    service.request({ ...source, geometryHash: 'revision-2' }, [part('gear', 1)]);
    expect(service.get('gear')).toMatchObject({ status: 'pending', bytes: new Uint8Array([8]) });
    await vi.waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(2);
    });
    service.request({ ...source, geometryHash: 'revision-3' }, [part('gear', 2)]);
    stale.resolve([image(0, 7)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(service.get('gear')?.bytes).toEqual(new Uint8Array([9]));
    expect(exportImage).toHaveBeenCalledTimes(3);
  });

  it('should preserve a prior preview on failure and retry only on a new request', async () => {
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 4)])
      .mockRejectedValueOnce(new Error('GPU unavailable'))
      .mockResolvedValueOnce([image(0, 5)]);
    const service = fixture(exportImage);
    service.request(source, [part('gear', 1)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    service.request({ ...source, geometryHash: 'revision-2' }, [part('gear', 1)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('failed');
    });
    expect(service.get('gear')?.bytes).toEqual(new Uint8Array([4]));
    expect(exportImage).toHaveBeenCalledTimes(2);
    service.request({ ...source, geometryHash: 'revision-2' }, [part('gear', 1)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(service.get('gear')?.bytes).toEqual(new Uint8Array([5]));
  });

  it('should enforce source, job, and output byte bounds before retaining previews', async () => {
    const exportImage = vi.fn().mockResolvedValue([image(0, 1), image(1, 2)]);
    const service = fixture(exportImage);
    expect(() => {
      service.request({ ...source, content: new Uint8Array(64 * 1024 * 1024 + 1) }, []);
    }).toThrow(RangeError);
    expect(() => {
      service.request({ ...source, content: new Uint8Array(64 * 1024 * 1024 + 1).subarray(0, 1) }, []);
    }).toThrow(RangeError);
    expect(() => {
      service.request(
        source,
        Array.from({ length: 129 }, (_, index) => part(`${index}`, index)),
      );
    }).toThrow(RangeError);
    expect(() => {
      service.request(source, [part('duplicate', 0), part('duplicate', 1)]);
    }).toThrow(TypeError);
    expect(exportImage).not.toHaveBeenCalled();
    exportImage.mockResolvedValueOnce([image(0, 1), { ...image(1, 2), bytes: new Uint8Array(9 * 1024 * 1024) }]);
    service.request(source, [part('one', 0), part('two', 1)]);
    await vi.waitFor(() => {
      expect(service.get('two')?.status).toBe('failed');
    });
    expect(service.get('one')?.status).toBe('ready');
    expect(service.get('two')?.bytes).toBeUndefined();
  });

  it('should notify remaining subscribers when one unsubscribes or throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = fixture(vi.fn().mockResolvedValue([image(0)]));
    const first = vi.fn();
    const second = vi.fn();
    let unsubscribeFirst: () => void = () => undefined;
    unsubscribeFirst = service.subscribe(() => {
      first();
      unsubscribeFirst();
      throw new Error('observer failed');
    });
    service.subscribe(second);
    service.request(source, [part('gear', 0)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('should retry, deduplicate, and cancel obsolete queued work through the real shared image service', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const imageClient = createMockRuntimeClient<typeof imageRuntime>();
    const pending = Promise.withResolvers<void>();
    const captureGate = Promise.withResolvers<void>();
    const successful: Awaited<ReturnType<typeof imageClient.transcode>> = {
      success: true,
      data: [image(0)],
      issues: [],
    };
    vi.mocked(imageClient.transcode)
      .mockRejectedValueOnce(new Error('first render failed'))
      .mockResolvedValueOnce(successful)
      .mockImplementationOnce(async () => {
        await pending.promise;
        return successful;
      })
      .mockImplementationOnce(async () => {
        await captureGate.promise;
        return successful;
      })
      .mockResolvedValueOnce(successful);
    const imageService = new HeadlessImageService({
      createImageClient: async () => imageClient,
      isGpuAvailable: () => true,
    });
    const service = fixture(imageService.export.bind(imageService));
    try {
      service.request(source, [part('gear', 1)]);
      await vi.waitFor(() => {
        expect(service.get('gear')?.status).toBe('failed');
      });
      service.request(source, [part('gear', 1)]);
      await vi.waitFor(() => {
        expect(service.get('gear')?.status).toBe('ready');
      });
      expect(imageClient.transcode).toHaveBeenCalledTimes(2);

      const nextSource = { ...source, geometryHash: 'next' };
      service.request(nextSource, [part('gear', 2)]);
      await vi.waitFor(() => {
        expect(imageClient.transcode).toHaveBeenCalledTimes(3);
      });
      service.request(nextSource, [part('gear', 2), part('gear-occurrence', 2)]);
      expect(imageClient.transcode).toHaveBeenCalledTimes(3);
      pending.resolve();
      await vi.waitFor(() => {
        expect(service.get('gear-occurrence')?.status).toBe('ready');
      });
      expect(service.get('gear')?.bytes).toBe(service.get('gear-occurrence')?.bytes);
      expect(imageClient.transcode).toHaveBeenCalledTimes(3);

      const capture = imageService.export({
        kind: 'capture',
        identity: 'occupy-gpu',
        sourceFormat: 'glb',
        sourcePath: 'main.ts',
        geometryHash: 'capture',
        content: source.content,
        format: 'webp',
        exportOptions: { width: 16, height: 16 },
      });
      await vi.waitFor(() => {
        expect(imageClient.transcode).toHaveBeenCalledTimes(4);
      });
      service.request({ ...source, geometryHash: 'obsolete' }, [part('old', 3)]);
      service.request({ ...source, geometryHash: 'latest' }, [part('new', 4)]);
      captureGate.resolve();
      await capture;
      await vi.waitFor(() => {
        expect(service.get('new')?.status).toBe('ready');
      });
      expect(service.get('old')).toBeUndefined();
      expect(imageClient.transcode).toHaveBeenCalledTimes(5);
    } finally {
      pending.resolve();
      captureGate.resolve();
      service.dispose();
      imageService.dispose();
    }
  });

  it('should bound queued automatic work across independent model-unit owners', async () => {
    const imageClient = createMockRuntimeClient<typeof imageRuntime>();
    const captureGate = Promise.withResolvers<void>();
    const successful: Awaited<ReturnType<typeof imageClient.transcode>> = {
      success: true,
      data: [image(0)],
      issues: [],
    };
    vi.mocked(imageClient.transcode)
      .mockImplementationOnce(async () => {
        await captureGate.promise;
        return successful;
      })
      .mockResolvedValue(successful);
    const imageService = new HeadlessImageService({
      createImageClient: async () => imageClient,
      isGpuAvailable: () => true,
    });
    try {
      const capture = imageService.export({
        kind: 'capture',
        identity: 'blocking-capture',
        sourceFormat: 'glb',
        sourcePath: 'main.ts',
        geometryHash: 'capture',
        content: source.content,
        format: 'webp',
        exportOptions: { width: 16, height: 16 },
      });
      await vi.waitFor(() => {
        expect(imageClient.transcode).toHaveBeenCalledOnce();
      });
      const owners = Array.from({ length: 9 }, (_, index) => {
        const owner = fixture(imageService.export.bind(imageService));
        owner.request({ ...source, geometryHash: `unit-${index}` }, [part(`part-${index}`, index)]);
        return owner;
      });
      await vi.waitFor(() => {
        expect(owners[8]?.get('part-8')?.status).toBe('failed');
      });
      expect(imageClient.transcode).toHaveBeenCalledOnce();
      captureGate.resolve();
      await capture;
      await vi.waitFor(() => {
        expect(owners[7]?.get('part-7')?.status).toBe('ready');
      });
      expect(imageClient.transcode).toHaveBeenCalledTimes(9);
      expect(owners[8]?.get('part-8')?.bytes).toBeUndefined();
    } finally {
      captureGate.resolve();
      imageService.dispose();
    }
  });
});
