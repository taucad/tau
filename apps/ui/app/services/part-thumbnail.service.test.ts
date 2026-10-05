import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import * as headlessImageDebug from '#services/headless-image-debug.js';
import type { PartThumbnailRequest, PartThumbnailSource } from '#services/part-thumbnail.service.js';
import { HeadlessImageError, HeadlessImageService } from '#services/headless-image.service.js';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';

const debugEnvironment = vi.hoisted(() => ({ read: vi.fn(() => false) }));
vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the real environment facade binding under test.
  ENV: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the real page debug flag under test.
    get TAU_DEBUG(): boolean {
      return debugEnvironment.read();
    },
  },
}));

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
    vi.unstubAllGlobals();
    debugEnvironment.read.mockReset().mockReturnValue(false);
  });

  it.each([
    'adapter-unavailable',
    'cold-start-deferred',
    'device-lost',
    'driver-unsupported',
    'gpu',
    'parse',
    'encode',
    'unknown',
  ] as const)('retains actual %s failure across reusable recipients until one explicit retry', async (code) => {
    const failure = new HeadlessImageError(code, 'actual typed preview failure');
    const exportImage = vi
      .fn<HeadlessImageService['export']>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce([image(0)]);
    const service = fixture(exportImage);
    const parts = [
      { ...part('left', 0), visualKey: 'shared-visual' },
      { ...part('right', 1), visualKey: 'shared-visual' },
    ];
    service.request(source, parts);
    await vi.waitFor(() => {
      expect(service.get('left')?.status).toBe('failed');
      expect(service.get('right')?.status).toBe('failed');
    });
    expect(service.get('left')?.error).toBe(failure);
    expect(service.get('right')?.error).toBe(failure);
    expect(exportImage).toHaveBeenCalledOnce();
    service.request(source, parts, { manualPartId: 'left' });
    await vi.waitFor(() => {
      expect(service.get('left')?.status).toBe('ready');
      expect(service.get('right')?.status).toBe('ready');
    });
    expect(exportImage.mock.calls.map(([job]) => job.kind)).toEqual(['automatic-thumbnail', 'manual-thumbnail']);
    expect(service.get('left')?.bytes).toEqual(service.get('right')?.bytes);
    expect(service.get('left')?.error).toBeUndefined();
    expect(service.get('right')?.error).toBeUndefined();
  });

  it.each(['shown-owner continuity', 'nonrepresentative manual retry'])(
    'should preserve software gallery %s through the real shared image service',
    async (boundary) => {
      const imageClient = createMockRuntimeClient<typeof imageRuntime>();
      const successful: Awaited<ReturnType<typeof imageClient.transcode>> = {
        success: true,
        data: [image(0)],
        issues: [],
      };
      vi.mocked(imageClient.transcode).mockResolvedValue(successful);
      const imageService = new HeadlessImageService({
        createImageClient: async () => imageClient,
        isGpuAvailable: () => true,
        isAutomaticGpuAvailable: () => false,
      });
      const exportImage = vi.spyOn(imageService, 'export');
      const service = fixture(imageService.export.bind(imageService));
      const housing = part('housing', 0);
      const gallery = [
        housing,
        { ...part('face-first', 1), visualKey: 'shared-face' },
        { ...part('face-clicked', 2), visualKey: 'shared-face' },
        part('other', 3),
      ];
      try {
        service.requestForOwner('selected', { source, parts: [housing], options: { manualPartId: housing.id } });
        await vi.waitFor(() => {
          expect(service.get(housing.id)?.status).toBe('ready');
        });
        const cachedBytes = service.get(housing.id)?.bytes;
        expect(cachedBytes).toEqual(image(0).bytes);
        service.requestForOwner('gallery', { source, parts: gallery });
        await vi.waitFor(() => {
          for (const id of ['face-first', 'face-clicked', 'other']) {
            expect(service.get(id)).toMatchObject({ status: 'failed', error: { code: 'driver-unsupported' } });
          }
        });
        expect(imageClient.transcode).toHaveBeenCalledOnce();
        expect(service.get(housing.id)?.bytes).toBe(cachedBytes);
        if (boundary === 'shown-owner continuity') {
          const failure = service.get('face-clicked')?.error;
          service.requestForOwner('gallery', { source, parts: gallery });
          expect(service.get('face-clicked')).toMatchObject({ status: 'failed', error: failure });
          await vi.waitFor(() => {
            expect(service.get('face-first')?.status).toBe('failed');
            expect(service.get('other')?.status).toBe('failed');
          });
          expect(imageClient.transcode).toHaveBeenCalledOnce();
        } else {
          service.requestForOwner('gallery', { source, parts: gallery, options: { manualPartId: 'face-clicked' } });
          await vi.waitFor(() => {
            expect(service.get('face-clicked')?.status).toBe('ready');
            expect(service.get('face-first')?.status).toBe('ready');
            expect(service.get('other')).toMatchObject({ status: 'failed', error: { code: 'driver-unsupported' } });
          });
          expect(service.get('face-clicked')?.bytes).toBe(service.get('face-first')?.bytes);
          expect(service.get('other')).toMatchObject({ status: 'failed', error: { code: 'driver-unsupported' } });
          expect(imageClient.transcode).toHaveBeenCalledTimes(2);
          expect(exportImage.mock.calls.filter(([job]) => job.kind === 'manual-thumbnail')).toHaveLength(2);
        }
        expect(service.get(housing.id)?.bytes).toBe(cachedBytes);
      } finally {
        service.dispose();
        imageService.dispose();
      }
    },
  );

  it('keeps manually accepted gallery aliases through a window that omits both', async () => {
    const imageClient = createMockRuntimeClient<typeof imageRuntime>();
    vi.mocked(imageClient.transcode).mockResolvedValue({ success: true, data: [image(0)], issues: [] });
    const imageService = new HeadlessImageService({
      createImageClient: async () => imageClient,
      isGpuAvailable: () => true,
      isAutomaticGpuAvailable: () => false,
    });
    const exportImage = vi.spyOn(imageService, 'export');
    const service = fixture(imageService.export.bind(imageService));
    const aliases = [
      { ...part('shown', 0), visualKey: 'shared-face' },
      { ...part('alias', 1), visualKey: 'shared-face' },
    ];
    try {
      service.requestForOwner('gallery', { source, parts: aliases });
      await vi.waitFor(() => {
        expect(service.get('shown')?.status).toBe('failed');
      });
      service.requestForOwner('gallery', { source, parts: aliases, options: { manualPartId: 'shown' } });
      await vi.waitFor(() => {
        expect(service.get('alias')?.status).toBe('ready');
      });
      const bytes = service.get('shown')?.bytes;
      expect(bytes).toBe(service.get('alias')?.bytes);

      service.requestForOwner('gallery', { source, parts: [part('distant', 2)] });
      expect(service.get('shown')?.bytes).toBe(bytes);
      expect(service.get('alias')?.bytes).toBe(bytes);
      await vi.waitFor(() => {
        expect(service.get('distant')?.status).toBe('failed');
      });
      service.requestForOwner('explorer', { source, parts: [aliases[0]!] });
      expect(service.get('shown')?.bytes).toBe(bytes);
      service.requestForOwner('explorer', { source, parts: [part('explorer-other', 3)] });
      expect(service.get('shown')?.bytes).toBe(bytes);
      expect(service.get('alias')?.bytes).toBe(bytes);
      service.requestForOwner('gallery', { source, parts: aliases });
      expect(service.get('shown')?.bytes).toBe(bytes);
      expect(service.get('alias')?.bytes).toBe(bytes);
      expect(exportImage.mock.calls.filter(([job]) => job.kind === 'manual-thumbnail')).toHaveLength(1);
      expect(imageClient.transcode).toHaveBeenCalledOnce();
      service.releaseOwner('gallery');
      expect(service.get('shown')).toBeUndefined();
      expect(service.get('alias')).toBeUndefined();
      service.releaseOwner('explorer');
      expect(service.snapshot().size).toBe(0);
    } finally {
      service.dispose();
      imageService.dispose();
    }
  });

  it('never queues a retained-only image after the existing byte budget evicts it', async () => {
    const large = new Uint8Array(5 * 1024 * 1024);
    const exportImage = vi.fn<HeadlessImageService['export']>().mockResolvedValue([{ ...image(0), bytes: large }]);
    const service = fixture(exportImage);
    service.requestForOwner('gallery', { source, parts: [part('old', 0)] });
    await vi.waitFor(() => {
      expect(service.get('old')?.status).toBe('ready');
    });
    service.requestForOwner('gallery', { source, parts: [part('current', 1)] });
    await vi.waitFor(() => {
      expect(service.get('current')?.status).toBe('ready');
    });
    expect(service.get('old')?.status).toBe('failed');
    expect(service.get('old')?.bytes).toBeUndefined();
    service.requestForOwner('gallery', { source, parts: [part('current', 1)] });
    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(service.get('old')).toBeUndefined();
  });

  it('gives the 128 active slots priority over retained gallery imagery', async () => {
    const exportImage = vi
      .fn<HeadlessImageService['export']>()
      .mockResolvedValue([image(0), image(1), image(2), image(3)]);
    const service = fixture(exportImage);
    service.requestForOwner('gallery', { source, parts: [part('old', 0)] });
    await vi.waitFor(() => {
      expect(service.get('old')?.status).toBe('ready');
    });
    service.requestForOwner('gallery', { source, parts: [part('current', 1)] });
    await vi.waitFor(() => {
      expect(service.get('current')?.status).toBe('ready');
    });
    service.requestForOwner('viewer', {
      source,
      parts: Array.from({ length: 128 }, (_, index) => part(`viewer-${index}`, index + 2)),
    });
    await vi.waitFor(() => {
      expect(service.get('viewer-127')?.status).toBe('ready');
    });
    expect(service.snapshot().size).toBe(128);
    expect(service.get('old')).toBeUndefined();
    expect(service.get('current')).toBeUndefined();
    expect(service.get('viewer-0')?.status).toBe('ready');
  });

  it.each(['source', 'visual'] as const)('drops retained gallery eligibility on %s identity change', async (change) => {
    const exportImage = vi.fn<HeadlessImageService['export']>().mockResolvedValue([image(0)]);
    const service = fixture(exportImage);
    service.requestForOwner('gallery', { source, parts: [part('old', 0)] });
    await vi.waitFor(() => {
      expect(service.get('old')?.status).toBe('ready');
    });
    service.requestForOwner('gallery', { source, parts: [part('current', 1)] });
    await vi.waitFor(() => {
      expect(service.get('current')?.status).toBe('ready');
    });
    const changed =
      change === 'source' ? { ...source, geometryHash: 'next-root' } : { ...source, visualKey: 'next-visual' };
    service.requestForOwner('gallery', { source: changed, parts: [part('next', 2)] });
    expect(service.get('old')).toBeUndefined();
  });

  it.each(['off-page', 'debug-disabled'])(
    'should keep diagnostic acquisition inert when %s without changing outputs',
    async (mode) => {
      vi.stubGlobal('window', mode === 'off-page' ? undefined : {});
      debugEnvironment.read.mockImplementation(() => {
        if (mode === 'off-page') {
          throw new Error('The worker cannot read the page environment');
        }
        return false;
      });
      const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
      const exportImage = vi.fn<HeadlessImageService['export']>().mockResolvedValue([image(0)]);
      const service = fixture(exportImage);
      service.requestForOwner('explorer', { source, parts: [part('left', 0)] });
      await vi.waitFor(() => {
        expect(service.get('left')?.status).toBe('ready');
      });
      expect(exportImage).toHaveBeenCalledOnce();
      expect(service.get('left')?.bytes).toEqual(image(0).bytes);
      expect(records).not.toHaveBeenCalled();
      if (mode === 'off-page') {
        expect(debugEnvironment.read).not.toHaveBeenCalled();
      }
    },
  );

  it('should observe the actual manual job and both current reusable recipients without retaining buffers', async () => {
    vi.stubGlobal('window', {});
    debugEnvironment.read.mockReturnValue(true);
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    const exportImage = vi
      .fn<HeadlessImageService['export']>()
      .mockRejectedValueOnce(new Error('Actual automatic preparation failed'))
      .mockResolvedValueOnce([image(0)]);
    const service = fixture(exportImage);
    const parts = [
      { ...part('left', 0), visualKey: 'shared-visual' },
      { ...part('right', 1), visualKey: 'shared-visual' },
    ];
    service.requestForOwner('explorer', { source, parts });
    await vi.waitFor(() => {
      expect(service.get('left')?.status).toBe('failed');
      expect(service.get('right')?.status).toBe('failed');
    });
    const retainedFailure = service.get('left')?.error;
    records.mockClear();
    service.requestForOwner('explorer', { source, parts });
    expect(exportImage).toHaveBeenCalledOnce();
    expect(service.get('left')?.error).toBe(retainedFailure);
    expect(service.get('right')?.error).toBe(retainedFailure);
    const passiveRequest = records.mock.calls.find(([name]) => name === 'thumbnail.service.request')?.[2];
    const requested = passiveRequest?.['requested'];
    const requestedRows: readonly unknown[] = Array.isArray(requested) ? requested : [];
    const [leftRequest, rightRequest] = requestedRows;
    if (
      typeof leftRequest !== 'object' ||
      leftRequest === null ||
      typeof rightRequest !== 'object' ||
      rightRequest === null
    ) {
      throw new Error('Actual passive owner request has no two reusable recipients');
    }
    const identity: unknown = Reflect.get(leftRequest, 'identity');
    expect(identity).toEqual(expect.any(String));
    expect(Reflect.get(rightRequest, 'identity')).toBe(identity);
    expect(passiveRequest).toMatchObject({
      current: undefined,
      demands: [{ owner: 'explorer', ids: ['left', 'right'] }],
      registered: [
        { id: 'left', registeredIdentity: identity, status: 'failed', cachePresent: true },
        { id: 'right', registeredIdentity: identity, status: 'failed', cachePresent: true },
      ],
    });
    records.mockClear();
    service.requestForOwner('explorer', { source, parts, options: { manualPartId: 'left' } });
    await vi.waitFor(() => {
      expect(service.get('left')?.status).toBe('ready');
      expect(service.get('right')?.status).toBe('ready');
    });
    expect(exportImage.mock.calls.map(([job]) => job.kind)).toEqual(['automatic-thumbnail', 'manual-thumbnail']);
    const accepted = records.mock.calls.filter(([name]) => name === 'thumbnail.service.accept');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.[2]).toMatchObject({
      jobIdentity: exportImage.mock.calls[1]?.[0].identity,
      manualPartId: 'left',
      sourcePath: source.sourcePath,
      geometryHash: source.geometryHash,
      currentIds: ['left', 'right'],
      demands: [{ owner: 'explorer', ids: ['left', 'right'] }],
      outputs: [
        {
          id: 'left',
          fileName: 'render-part-0.webp',
          outputBytes: 1,
          outputAccepted: true,
          recipients: ['left', 'right'],
          before: [
            { id: 'left', status: 'pending' },
            { id: 'right', status: 'pending' },
          ],
          after: [
            { id: 'left', status: 'ready', byteLength: 1, decoded: false },
            { id: 'right', status: 'ready', byteLength: 1, decoded: false },
          ],
        },
      ],
    });
    expect(JSON.stringify(accepted[0]?.[2])).not.toContain('content');
    expect(JSON.stringify(accepted[0]?.[2])).not.toContain('"bytes":');
    service.releaseOwner('explorer');
    expect(service.get('left')).toBeUndefined();
    expect(accepted[0]?.[2]?.['currentIds']).toEqual(['left', 'right']);
  });

  it('should observe only current recipients after a real owner withdraws a shared recipient', async () => {
    vi.stubGlobal('window', {});
    debugEnvironment.read.mockReturnValue(true);
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    const pending = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi.fn<HeadlessImageService['export']>().mockReturnValue(pending.promise);
    const service = fixture(exportImage);
    const parts = [
      { ...part('left', 0), visualKey: 'shared-visual' },
      { ...part('right', 1), visualKey: 'shared-visual' },
    ];
    service.requestForOwner('explorer', { source, parts });
    service.requestForOwner('explorer', { source, parts: parts.slice(0, 1) });
    pending.resolve([image(0)]);
    await vi.waitFor(() => {
      expect(service.get('left')?.status).toBe('ready');
    });
    expect(service.get('right')).toBeUndefined();
    expect(exportImage).toHaveBeenCalledOnce();
    const accepted = records.mock.calls.filter(([name]) => name === 'thumbnail.service.accept');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.[2]).toMatchObject({
      jobIdentity: exportImage.mock.calls[0]?.[0].identity,
      currentIds: ['left'],
      outputs: [{ recipients: ['left'], after: [{ id: 'left', status: 'ready' }] }],
    });
  });

  it('should never observe a superseded generation as an accepted current job', async () => {
    vi.stubGlobal('window', {});
    debugEnvironment.read.mockReturnValue(true);
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    const pending = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi
      .fn<HeadlessImageService['export']>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([image(0)]);
    const service = fixture(exportImage);
    service.requestForOwner('explorer', { source, parts: [part('old', 0)] });
    service.requestForOwner('explorer', {
      source: { ...source, geometryHash: 'successor-glb-hash' },
      parts: [part('current', 1)],
    });
    expect(exportImage.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    pending.resolve([image(0)]);
    await vi.waitFor(() => {
      expect(service.get('current')?.status).toBe('ready');
    });
    expect(service.get('old')).toBeUndefined();
    expect(exportImage).toHaveBeenCalledTimes(2);
    const accepted = records.mock.calls.filter(([name]) => name === 'thumbnail.service.accept');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.[2]).toMatchObject({
      jobIdentity: exportImage.mock.calls[1]?.[0].identity,
      geometryHash: 'successor-glb-hash',
      currentIds: ['current'],
      outputs: [{ recipients: ['current'] }],
    });
    expect(accepted[0]?.[2]?.['jobIdentity']).not.toBe(exportImage.mock.calls[0]?.[0].identity);
  });

  it('publishes stable React snapshots and releases encoded bytes on disposal', async () => {
    const pendingExport = Promise.withResolvers<ExportFile[]>();
    const service = fixture(async () => pendingExport.promise);
    const empty = service.snapshot();
    service.request(source, [part('gear', 0)]);
    const pending = service.snapshot();
    expect(pending).not.toBe(empty);
    expect(pending.get('gear')?.status).toBe('pending');
    expect(service.snapshot()).toBe(pending);

    pendingExport.resolve([image(0)]);
    await vi.waitFor(() => {
      expect(service.snapshot().get('gear')?.status).toBe('ready');
    });
    const ready = service.snapshot();
    expect(ready).not.toBe(pending);
    expect(ready.get('gear')?.bytes).toBe(service.get('gear')?.bytes);
    service.dispose();
    expect(service.snapshot().size).toBe(0);
  });

  it('makes a decoded image failure retryable and ignores an error from a superseded image', async () => {
    const service = fixture(async () => [image(0)]);
    service.request(source, [part('gear', 0)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    const bytes = service.get('gear')?.bytes;
    if (!bytes) {
      throw new Error('Expected completed thumbnail bytes');
    }
    service.failDecode('gear', new Uint8Array([7]));
    expect(service.get('gear')?.status).toBe('ready');
    service.failDecode('gear', bytes);
    expect(service.get('gear')).toMatchObject({ status: 'failed' });
    expect(service.get('gear')?.bytes).toBeUndefined();
  });

  it('keeps the previously decoded image through a corrupt refresh until an explicit retry succeeds', async () => {
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 1)])
      .mockResolvedValueOnce([image(0, 2)])
      .mockResolvedValueOnce([image(0, 3)]);
    const service = fixture(exportImage);
    const gear = part('gear', 0);
    service.request(source, [gear]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    const goodBytes = service.get('gear')?.bytes;
    if (!goodBytes) {
      throw new Error('Expected completed thumbnail bytes');
    }
    service.markDecoded('gear', goodBytes);

    const updated = { ...source, geometryHash: 'updated-glb' };
    service.request(updated, [gear]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.bytes?.[0]).toBe(2);
    });
    const corruptBytes = service.get('gear')?.bytes;
    if (!corruptBytes) {
      throw new Error('Expected completed thumbnail bytes');
    }
    service.failDecode('gear', corruptBytes);
    expect(service.get('gear')).toMatchObject({ status: 'failed', bytes: goodBytes });

    service.request(updated, [gear], { manualPartId: 'gear' });
    await vi.waitFor(() => {
      expect(service.get('gear')?.bytes?.[0]).toBe(3);
    });
    expect(exportImage).toHaveBeenCalledTimes(3);
  });

  it('preserves simultaneous Explorer and viewer demand for the same unit and releases only the closing owner', async () => {
    const exportImage = vi.fn(async () => [image(0)]);
    const service = fixture(exportImage);
    service.requestForOwner('explorer', { source, parts: [part('gear', 0)] });
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    service.requestForOwner('viewer', { source, parts: [part('shaft', 1)] });
    await vi.waitFor(() => {
      expect(service.get('shaft')?.status).toBe('ready');
    });
    expect(service.get('gear')?.status).toBe('ready');
    service.releaseOwner('explorer');
    expect(service.get('gear')).toBeUndefined();
    expect(service.get('shaft')?.status).toBe('ready');
    service.releaseOwner('viewer');
    expect(service.snapshot().size).toBe(0);
    expect(exportImage).toHaveBeenCalledTimes(2);
  });

  it('admits a viewer-only part beside a full 128-row Explorer page without exceeding the combined request cap', async () => {
    const exportImage = vi.fn(async () => [image(0), image(1), image(2), image(3)]);
    const service = fixture(exportImage);
    service.requestForOwner('explorer', {
      source,
      parts: Array.from({ length: 128 }, (_, index) => part(`row-${index}`, index)),
    });
    await vi.waitFor(() => {
      expect(service.get('row-127')?.status).toBe('ready');
    });
    service.requestForOwner('viewer', { source, parts: [part('viewer-only', 128)] });
    await vi.waitFor(() => {
      expect(service.get('viewer-only')?.status).toBe('ready');
    });
    expect(service.snapshot().size).toBe(128);
    expect(service.get('row-0')?.status).toBe('ready');
    expect(service.get('row-127')).toBeUndefined();
    service.releaseOwner('viewer');
    await vi.waitFor(() => {
      expect(service.get('row-127')?.status).toBe('ready');
    });
    expect(service.get('viewer-only')).toBeUndefined();
    expect(service.snapshot().size).toBe(128);
  });

  it('releases a failed preparation with its owner while retaining a sibling preview', async () => {
    const exportImage = vi.fn(async () => [image(0)]);
    const service = fixture(exportImage);
    service.requestForOwner('viewer', { source, parts: [part('shaft', 1)] });
    await vi.waitFor(() => {
      expect(service.get('shaft')?.status).toBe('ready');
    });
    service.failPreparationForOwner('explorer', [part('shaft', 1), part('gear', 0)], new Error('Invalid source GLB'));
    expect(service.get('gear')?.status).toBe('failed');
    expect(service.get('shaft')?.status).toBe('ready');
    service.releaseOwner('explorer');
    expect(service.get('gear')).toBeUndefined();
    expect(service.get('shaft')?.status).toBe('ready');
    service.releaseOwner('viewer');
    expect(service.snapshot().size).toBe(0);
  });

  it('surfaces a failed source preparation and retains the last good preview for retry', async () => {
    const exportImage = vi.fn(async () => [image(0)]);
    const service = fixture(exportImage);
    const gear = part('gear', 0);
    service.request(source, [gear]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    const oldBytes = service.get('gear')?.bytes;
    service.failPreparation([gear], new Error('Invalid source GLB'));
    expect(service.snapshot().get('gear')).toMatchObject({ status: 'failed', bytes: oldBytes });
    service.request(source, [gear]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(exportImage).toHaveBeenCalledTimes(2);
  });

  it('submits an explicit retry through the same image queue after automatic admission fails', async () => {
    const exportImage = vi.fn(async (job: Parameters<HeadlessImageService['export']>[0]) => {
      if (job.kind === 'automatic-thumbnail') {
        throw new Error('Software adapter deferred automatic preview');
      }
      return [image(0)];
    });
    const service = fixture(exportImage);
    service.request(source, [part('gear', 0)]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('failed');
    });
    service.request(source, [part('gear', 0)], { manualPartId: 'gear' });
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(exportImage.mock.calls.map(([job]) => job.kind)).toEqual(['automatic-thumbnail', 'manual-thumbnail']);
  });

  it('limits one software-adapter retry to the clicked part even with other failed owner rows', async () => {
    const exportImage = vi.fn(async (job: Parameters<HeadlessImageService['export']>[0]) => {
      if (job.kind === 'automatic-thumbnail') {
        throw new Error('Software adapter deferred automatic preview');
      }
      return [image(0)];
    });
    const service = fixture(exportImage);
    service.requestForOwner('explorer', {
      source,
      parts: Array.from({ length: 5 }, (_, index) => part(`part-${index}`, index)),
    });
    await vi.waitFor(() => {
      expect(service.get('part-4')?.status).toBe('failed');
    });
    service.requestForOwner('viewer', {
      source,
      parts: [part('part-2', 2)],
      options: { manualPartId: 'part-2' },
    });
    await vi.waitFor(() => {
      expect(service.get('part-2')?.status).toBe('ready');
    });
    expect(service.get('part-0')?.status).toBe('failed');
    expect(service.get('part-4')?.status).toBe('failed');
    expect(exportImage.mock.calls.filter(([job]) => job.kind === 'manual-thumbnail')).toHaveLength(1);
  });

  it('should render exact per-part instances in bounded ordered batches through the shared queue', async () => {
    const exportImage = vi.fn(async (job: Parameters<HeadlessImageService['export']>[0]) => {
      if (job.sourceFormat !== 'glb' || job.exportOptions.mode !== 'batch') {
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
        width: 1536,
        height: 1536,
        quality: 0.95,
        lineWidth: 6,
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

  it('skips canonical GLB preparation on a rigid-placement cache hit and prepares the current source on a new miss', async () => {
    const renderFirst = vi.fn(() => new Uint8Array([11]));
    const renderMoved = vi.fn(() => new Uint8Array([22]));
    const exportImage = vi.fn(async (_job: Parameters<HeadlessImageService['export']>[0]) => [image(0)]);
    const service = fixture(exportImage);
    const gear = { ...part('gear', 0), visualKey: 'same-canonical-visual' };
    service.request({ ...source, renderContent: renderFirst }, [gear]);
    await vi.waitFor(() => {
      expect(service.get('gear')?.status).toBe('ready');
    });
    expect(renderFirst).toHaveBeenCalledOnce();
    expect(exportImage.mock.calls[0]?.[0].content).toEqual(new Uint8Array([11]));

    const moved = {
      ...source,
      geometryHash: 'current-pose-hash',
      content: new Uint8Array([8]),
      renderContent: renderMoved,
    };
    service.request(moved, [gear]);
    expect(service.get('gear')?.status).toBe('ready');
    expect(exportImage).toHaveBeenCalledOnce();
    expect(renderMoved).not.toHaveBeenCalled();

    service.request(moved, [gear, { ...part('new-part', 1), visualKey: 'new-canonical-visual' }]);
    await vi.waitFor(() => {
      expect(service.get('new-part')?.status).toBe('ready');
    });
    expect(renderMoved).toHaveBeenCalledOnce();
    const secondJob = exportImage.mock.calls[1]?.[0];
    if (secondJob?.sourceFormat !== 'glb') {
      throw new Error('Expected a GLB preview job');
    }
    expect(secondJob.geometryHash).toBe('current-pose-hash');
    expect(secondJob.content).toEqual(new Uint8Array([22]));
  });

  it('fences an old export during delayed preparation of a newly presented source', async () => {
    const pending = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 6)])
      .mockImplementationOnce(async () => pending.promise)
      .mockResolvedValueOnce([image(0, 9)]);
    const service = fixture(exportImage);
    service.announcePresentedSource('old-glb');
    service.request(source, [part('old', 0)]);
    await vi.waitFor(() => {
      expect(service.get('old')?.status).toBe('ready');
    });
    service.announcePresentedSource('pending-glb');
    service.request({ ...source, geometryHash: 'pending-glb' }, [part('old', 0)]);
    await vi.waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(2);
    });
    expect(service.get('old')).toMatchObject({ status: 'pending', bytes: new Uint8Array([6]) });
    service.announcePresentedSource('new-glb');
    expect(service.get('old')).toMatchObject({ status: 'ready', bytes: new Uint8Array([6]) });
    const preparation = Promise.withResolvers<void>();
    const requestPrepared = async (): Promise<void> => {
      await preparation.promise;
      service.request({ ...source, geometryHash: 'new-glb' }, [part('new', 1)]);
    };
    const preparedRequest = requestPrepared();
    pending.resolve([image(0, 8)]);
    await Promise.resolve();
    expect(service.get('old')?.bytes).toEqual(new Uint8Array([6]));
    preparation.resolve();
    await preparedRequest;
    await vi.waitFor(() => {
      expect(service.get('new')?.status).toBe('ready');
    });
    expect(service.get('new')?.bytes).toEqual(new Uint8Array([9]));
  });

  it('releases last-good bytes when the owner closes before a new source is prepared', async () => {
    const stale = Promise.withResolvers<ExportFile[]>();
    const exportImage = vi
      .fn()
      .mockResolvedValueOnce([image(0, 6)])
      .mockImplementationOnce(async () => stale.promise);
    const service = fixture(exportImage);
    service.announcePresentedSource('old-glb');
    service.requestForOwner('explorer', { source, parts: [part('old', 0)] });
    await vi.waitFor(() => {
      expect(service.get('old')?.status).toBe('ready');
    });
    service.requestForOwner('explorer', {
      source: { ...source, geometryHash: 'pending-glb' },
      parts: [part('old', 0)],
    });
    await vi.waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(2);
    });
    service.announcePresentedSource('new-glb');
    expect(service.get('old')?.bytes).toEqual(new Uint8Array([6]));
    service.releaseOwner('explorer');
    expect(service.snapshot().size).toBe(0);
    stale.resolve([image(0, 8)]);
    await Promise.resolve();
    expect(service.snapshot().size).toBe(0);
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
      isAutomaticGpuAvailable: () => true,
    });
    const service = fixture(imageService.export.bind(imageService));
    try {
      service.request(source, [part('gear', 1)]);
      await vi.waitFor(() => {
        expect(service.get('gear')).toMatchObject({
          status: 'failed',
          error: { code: 'cold-start-deferred' },
        });
      });
      expect(imageClient.transcode).not.toHaveBeenCalled();
      expect(imageClient.connect).not.toHaveBeenCalled();
      service.request(source, [part('gear', 1)], { manualPartId: 'gear' });
      await vi.waitFor(() => {
        expect(service.get('gear')).toMatchObject({
          status: 'failed',
          error: { message: 'first render failed' },
        });
      });
      expect(imageClient.transcode).toHaveBeenCalledOnce();
      service.request(source, [part('gear', 1)], { manualPartId: 'gear' });
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
      .mockResolvedValueOnce(successful)
      .mockImplementationOnce(async () => {
        await captureGate.promise;
        return successful;
      })
      .mockResolvedValue(successful);
    const imageService = new HeadlessImageService({
      createImageClient: async () => imageClient,
      isGpuAvailable: () => true,
      isAutomaticGpuAvailable: () => true,
    });
    const automaticResponses = new Map<string, Promise<ExportFile[] | undefined>>();
    const trackedExport: HeadlessImageService['export'] = async (job) => {
      const response = imageService.export(job);
      if (job.kind === 'automatic-thumbnail' && job.sourceFormat === 'glb') {
        automaticResponses.set(job.geometryHash, response);
      }
      return response;
    };
    let owners: PartThumbnailService[] = [];
    let captureSettled: Promise<Array<PromiseSettledResult<ExportFile[] | undefined>>> | undefined;
    try {
      // Automatic batches enter the queue only after a successful shared-worker render.
      await imageService.export({
        kind: 'capture',
        identity: 'warm-worker',
        sourceFormat: 'glb',
        sourcePath: 'main.ts',
        geometryHash: 'warmup',
        content: source.content,
        format: 'webp',
        exportOptions: { width: 16, height: 16 },
      });
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
      captureSettled = Promise.allSettled([capture]);
      await vi.waitFor(() => {
        expect(imageClient.transcode).toHaveBeenCalledTimes(2);
      });
      owners = Array.from({ length: 9 }, (_, index) => {
        const owner = fixture(trackedExport);
        owner.request({ ...source, geometryHash: `unit-${index}` }, [part(`part-${index}`, index)]);
        return owner;
      });
      const states = (): Array<ReturnType<PartThumbnailService['get']>> =>
        owners.map((owner, index) => owner.get(`part-${index}`));
      await vi.waitFor(() => {
        expect(automaticResponses.size).toBe(9);
        expect(states().filter((state) => state?.status === 'failed')).toHaveLength(1);
        expect(states().filter((state) => state?.status === 'pending')).toHaveLength(8);
      });
      const overflowIndex = states().findIndex((state) => state?.status === 'failed');
      expect(overflowIndex).toBeGreaterThanOrEqual(0);
      const overflow = states()[overflowIndex];
      const failure = overflow?.error;
      if (!(failure instanceof Error)) {
        throw new TypeError('Expected the thumbnail owner to report missing output');
      }
      expect(failure.message).toContain('Missing or oversized WebP preview');
      const overflowResponse = automaticResponses.get(`unit-${overflowIndex}`);
      if (!overflowResponse) {
        throw new Error('Expected the failed owner actual shared queue response');
      }
      expect(await overflowResponse).toBeUndefined();
      expect(imageClient.transcode).toHaveBeenCalledTimes(2);
      captureGate.resolve();
      await capture;
      await vi.waitFor(() => {
        expect(states().filter((state) => state?.status === 'ready')).toHaveLength(8);
        expect(states().filter((state) => state?.status === 'failed')).toHaveLength(1);
      });
      expect(imageClient.transcode).toHaveBeenCalledTimes(10);
      expect(owners[overflowIndex]?.get(`part-${overflowIndex}`)?.bytes).toBeUndefined();
    } finally {
      captureGate.resolve();
      if (captureSettled) {
        await captureSettled;
      }
      await Promise.allSettled(automaticResponses.values());
      for (const owner of owners) {
        owner.dispose();
      }
      imageService.dispose();
    }
  });
});
