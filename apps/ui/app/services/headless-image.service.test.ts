import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilesystemRuntimeSource } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import type { ExportFile } from '@taucad/types';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { HeadlessImageError, HeadlessImageService } from '#services/headless-image.service.js';
import type { HeadlessImageJob, HeadlessImageServiceDependencies } from '#services/headless-image.service.js';

const { createRuntimeClient, webWorkerTransport } = vi.hoisted(() => ({
  createRuntimeClient: vi.fn<(options: unknown) => AppRuntimeClient>(),
  webWorkerTransport: vi.fn<(options: unknown) => { kind: 'worker-transport' }>(() => ({
    kind: 'worker-transport',
  })),
}));
const activeServices = new Set<HeadlessImageService>();
const defaultFileSystem = fromMemoryFs();
const createMockAppRuntimeClient = () => createMockRuntimeClient<typeof runtime>();

vi.mock('@taucad/runtime/client', () => ({ createRuntimeClient }));
vi.mock('@taucad/runtime/transport/web', () => ({ webWorkerTransport }));

const imageJob = (
  identity: string,
  kind: 'automatic-thumbnail' | 'manual-thumbnail' | 'capture' = 'automatic-thumbnail',
  path: FilesystemRuntimeSource['path'] = '/main.ts',
): Extract<HeadlessImageJob, { sourceFormat: 'gltf' }> => ({
  kind,
  identity,
  projectId: 'project-1',
  sourceFormat: 'gltf',
  fileSystem: defaultFileSystem,
  format: 'webp',
  source: { path },
  includeEdges: true,
  exportOptions: { width: 16, height: 16 },
});

const webpFiles = (bytes: Uint8Array<ArrayBuffer>): ExportFile[] => [
  { name: 'thumbnail.webp', mimeType: 'image/webp', bytes },
];

const svgJob = (identity: string, content: string): Extract<HeadlessImageJob, { sourceFormat: 'svg' }> => ({
  kind: 'capture',
  identity,
  sourceFormat: 'svg',
  sourcePath: '/drawing.ts',
  content,
  format: 'png',
  exportOptions: {
    width: 320,
    height: 240,
    label: 'drawing.ts',
    axes: true,
    scaleBar: true,
    lengthSymbol: 'mm',
  },
});

const createClient = (): AppRuntimeClient => {
  const client = createMockAppRuntimeClient();
  vi.mocked(client.export).mockResolvedValue({
    success: true,
    data: webpFiles(new Uint8Array([1, 2, 3])),
    issues: [],
  });
  return client;
};

const trackService = (service: HeadlessImageService): HeadlessImageService => {
  activeServices.add(service);
  return service;
};

const createService = (client: AppRuntimeClient, idleTimeout = 60_000) =>
  trackService(
    new HeadlessImageService({
      runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
      createClient: vi.fn().mockResolvedValue(client),
      isGpuAvailable: () => true,
      idleTimeout,
    }),
  );

describe('HeadlessImageService', () => {
  afterEach(() => {
    for (const service of activeServices) {
      service.dispose();
    }
    activeServices.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should forward the exact entry path and add no warning when export succeeds', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sourceEntryPath = 'src/main.ts';
    const client = createClient();
    const service = createService(client);

    await expect(service.export(imageJob('exact-source', 'automatic-thumbnail', sourceEntryPath))).resolves.toEqual(
      webpFiles(new Uint8Array([1, 2, 3])),
    );

    expect(client.export).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(client.export).mock.calls[0]!;
    if (!options) {
      throw new Error('Expected request-scoped export options');
    }
    expect(options.source?.path).toBe(sourceEntryPath);
    expect(warning).not.toHaveBeenCalled();
  });

  it('should render settled SVG through real resvg without probing GPU or creating a runtime client', async () => {
    const createClient = vi.fn<NonNullable<HeadlessImageServiceDependencies['createClient']>>();
    const isGpuAvailable = vi.fn(() => false);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        createClient,
        isGpuAvailable,
      }),
    );
    const content =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0H100V50H0Z" fill="none" stroke="#ef4444"/></svg>';

    const files = await service.export(svgJob('svg-real', content));

    expect(files).toHaveLength(1);
    expect(files?.[0]).toMatchObject({ mimeType: 'image/png' });
    expect(files?.[0]?.bytes.subarray(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    expect(createClient).not.toHaveBeenCalled();
    expect(isGpuAvailable).not.toHaveBeenCalled();
  });

  it('should recover the shared queue after a typed SVG parse failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        isGpuAvailable: () => false,
      }),
    );
    const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>';

    await expect(service.export(svgJob('svg-invalid', '<svg/>'))).rejects.toMatchObject({ code: 'parse' });
    await expect(service.export(svgJob('svg-valid', valid))).resolves.toEqual([
      expect.objectContaining({ mimeType: 'image/png' }),
    ]);
  });

  it('should serialize GPU exports and keep manual requests in FIFO order', async () => {
    const releases: Array<() => void> = [];
    const calls: string[] = [];
    const client = createClient();
    vi.mocked(client.export).mockImplementation(async (_format, options) => {
      if (!options) {
        throw new Error('Expected request-scoped export options');
      }
      const sourcePath = options.source?.path;
      calls.push(sourcePath ?? '');
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return { success: true, data: webpFiles(new Uint8Array([calls.length])), issues: [] };
    });
    const service = createService(client);

    const first = service.export({ ...imageJob('manual-1', 'manual-thumbnail'), source: { path: '/one.ts' } });
    const second = service.export({ ...imageJob('manual-2', 'manual-thumbnail'), source: { path: '/two.ts' } });
    await vi.waitFor(() => {
      expect(calls).toEqual(['/one.ts']);
    });
    releases.shift()?.();
    await vi.waitFor(() => {
      expect(calls).toEqual(['/one.ts', '/two.ts']);
    });
    releases.shift()?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('should coalesce queued automatic work per project to the newest identity', async () => {
    let releaseRunning: (() => void) | undefined;
    const calls: string[] = [];
    const client = createClient();
    vi.mocked(client.export).mockImplementation(async (_format, options) => {
      if (!options) {
        throw new Error('Expected request-scoped export options');
      }
      const sourcePath = options.source?.path;
      calls.push(sourcePath ?? '');
      if (calls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseRunning = resolve;
        });
      }
      return { success: true, data: webpFiles(new Uint8Array([1])), issues: [] };
    });
    const service = createService(client);

    const running = service.export({ ...imageJob('running'), source: { path: '/running.ts' } });
    await vi.waitFor(() => {
      expect(calls).toEqual(['/running.ts']);
    });
    const superseded = service.export({ ...imageJob('old'), source: { path: '/old.ts' } });
    const newest = service.export({ ...imageJob('new'), source: { path: '/new.ts' } });
    await expect(superseded).resolves.toBeUndefined();
    releaseRunning?.();

    await expect(Promise.all([running, newest])).resolves.toHaveLength(2);
    expect(calls).toEqual(['/running.ts', '/new.ts']);
  });

  it('should preempt active automatic work and run explicit work before queued automatic work', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let rejectAutomatic: ((error: Error) => void) | undefined;
    const automaticClient = createClient();
    vi.mocked(automaticClient.export).mockImplementation(
      async () =>
        new Promise((_resolve, reject) => {
          rejectAutomatic = reject;
        }),
    );
    vi.mocked(automaticClient.terminate).mockImplementation(() => {
      rejectAutomatic?.(new Error('terminated'));
    });
    const healthyClient = createClient();
    const createClientSequence = vi.fn().mockResolvedValueOnce(automaticClient).mockResolvedValueOnce(healthyClient);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        createClient: createClientSequence,
        isGpuAvailable: () => true,
      }),
    );

    const automatic = service.export({ ...imageJob('active'), source: { path: '/active.ts' } });
    await vi.waitFor(() => {
      expect(automaticClient.export).toHaveBeenCalledOnce();
    });
    const queuedAutomatic = service.export({
      ...imageJob('queued'),
      projectId: 'project-2',
      source: { path: '/queued.ts' },
    });
    const capture = service.export({ ...imageJob('capture', 'capture'), source: { path: '/capture.ts' } });

    await expect(automatic).resolves.toBeUndefined();
    await expect(capture).resolves.toEqual(webpFiles(new Uint8Array([1, 2, 3])));
    await expect(queuedAutomatic).resolves.toEqual(webpFiles(new Uint8Array([1, 2, 3])));
    expect(automaticClient.terminate).toHaveBeenCalledOnce();
    const paths = vi.mocked(healthyClient.export).mock.calls.map(([, options]) => {
      if (!options) {
        throw new Error('Expected request-scoped export options');
      }
      return options.source?.path;
    });
    expect(paths).toEqual(['/capture.ts', '/queued.ts']);
  });

  it('should preempt automatic work while its lazy client is still being created', async () => {
    let releaseClient: ((client: AppRuntimeClient) => void) | undefined;
    const staleClient = createClient();
    const healthyClient = createClient();
    const createClientSequence = vi
      .fn<NonNullable<HeadlessImageServiceDependencies['createClient']>>()
      .mockImplementationOnce(
        async () =>
          new Promise<AppRuntimeClient>((resolve) => {
            releaseClient = resolve;
          }),
      )
      .mockResolvedValueOnce(healthyClient);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        createClient: createClientSequence,
        isGpuAvailable: () => true,
      }),
    );

    const automatic = service.export(imageJob('active'));
    await vi.waitFor(() => {
      expect(createClientSequence).toHaveBeenCalledOnce();
    });
    const capture = service.export(imageJob('capture', 'capture'));
    releaseClient?.(staleClient);

    await expect(automatic).resolves.toBeUndefined();
    await expect(capture).resolves.toEqual(webpFiles(new Uint8Array([1, 2, 3])));
    expect(staleClient.terminate).toHaveBeenCalledOnce();
    expect(healthyClient.export).toHaveBeenCalledOnce();
  });

  it('should suppress repeated automatic failures for the same identity but never manual work', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClient();
    vi.mocked(client.export).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'encoder failed',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          details: { type: 'render', code: 'encode' },
        },
      ],
    });
    const service = createService(client);

    await expect(service.export(imageJob('broken'))).rejects.toMatchObject({ code: 'encode' });
    await expect(service.export(imageJob('broken'))).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
    await expect(service.export(imageJob('broken', 'manual-thumbnail'))).rejects.toMatchObject({ code: 'encode' });
    expect(client.export).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it('should preserve and suppress an unchanged driver-unsupported automatic failure without terminating the client', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClient();
    vi.mocked(client.export).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'WebP encoding is unsupported by this graphics driver',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          details: { type: 'render', code: 'driver-unsupported' },
        },
      ],
    });
    const service = createService(client);

    const first = service.export(imageJob('unsupported-driver'));
    await expect(first).rejects.toBeInstanceOf(HeadlessImageError);
    await expect(first).rejects.toMatchObject({
      code: 'driver-unsupported',
      message: 'WebP encoding is unsupported by this graphics driver',
    });
    await expect(service.export(imageJob('unsupported-driver'))).resolves.toBeUndefined();

    expect(client.export).toHaveBeenCalledOnce();
    expect(client.terminate).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
  });

  it('should terminate a faulted client so the next request creates a fresh one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failedClient = createClient();
    vi.mocked(failedClient.export).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'device lost',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          details: { type: 'render', code: 'device-lost' },
        },
      ],
    });
    const healthyClient = createClient();
    vi.mocked(healthyClient.export).mockResolvedValue({
      success: true,
      data: webpFiles(new Uint8Array([9])),
      issues: [],
    });
    const createClientSequence = vi.fn().mockResolvedValueOnce(failedClient).mockResolvedValueOnce(healthyClient);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        createClient: createClientSequence,
        isGpuAvailable: () => true,
      }),
    );

    await expect(service.export(imageJob('first', 'capture'))).rejects.toBeInstanceOf(HeadlessImageError);
    await expect(service.export(imageJob('second', 'capture'))).resolves.toEqual(webpFiles(new Uint8Array([9])));
    expect(failedClient.terminate).toHaveBeenCalledOnce();
    expect(createClientSequence).toHaveBeenCalledTimes(2);
  });

  it('should terminate the lazy client after the configured idle window', async () => {
    vi.useFakeTimers();
    const client = createClient();
    vi.mocked(client.export).mockResolvedValue({
      success: true,
      data: webpFiles(new Uint8Array([1])),
      issues: [],
    });
    const service = createService(client, 50);

    await service.export(imageJob('idle', 'capture'));
    await vi.advanceTimersByTimeAsync(49);
    expect(client.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.terminate).toHaveBeenCalledOnce();
  });

  it('should reuse by opaque filesystem identity and replace the client when that identity changes', async () => {
    const firstFileSystem = fromMemoryFs();
    const secondFileSystem = fromMemoryFs();
    const firstClient = createClient();
    const secondClient = createClient();
    const createClientForFileSystem = vi.fn().mockResolvedValueOnce(firstClient).mockResolvedValueOnce(secondClient);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        createClient: createClientForFileSystem,
        isGpuAvailable: () => true,
      }),
    );

    await service.export({ ...imageJob('first', 'capture'), fileSystem: firstFileSystem });
    await service.export({
      ...imageJob('same-filesystem-different-project', 'capture'),
      projectId: 'project-2',
      fileSystem: firstFileSystem,
    });
    await service.export({ ...imageJob('second-filesystem', 'capture'), fileSystem: secondFileSystem });

    expect(createClientForFileSystem).toHaveBeenNthCalledWith(1, firstFileSystem);
    expect(createClientForFileSystem).toHaveBeenNthCalledWith(2, secondFileSystem);
    expect(firstClient.terminate).toHaveBeenCalledOnce();
    expect(firstClient.export).toHaveBeenCalledTimes(2);
    expect(secondClient.export).toHaveBeenCalledOnce();
  });

  it('should inject only the job filesystem into the lazy worker transport', async () => {
    const fileSystem = fromMemoryFs();
    const client = createClient();
    vi.mocked(client.export).mockResolvedValue({
      success: true,
      data: webpFiles(new Uint8Array([1])),
      issues: [],
    });
    createRuntimeClient.mockReturnValueOnce(client);
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        isGpuAvailable: () => true,
      }),
    );

    await expect(service.export({ ...imageJob('lazy', 'capture'), fileSystem })).resolves.toEqual(
      webpFiles(new Uint8Array([1])),
    );

    expect(webWorkerTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSystem,
      }),
    );
    expect(createRuntimeClient).toHaveBeenCalledWith(
      expect.objectContaining({ transport: { kind: 'worker-transport' } }),
    );
    expect(webWorkerTransport.mock.calls[0]?.[0]).not.toHaveProperty('filePoolBuffer');
  });

  it('should reject a late result after disposal instead of publishing stale bytes', async () => {
    let release: (() => void) | undefined;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClient();
    vi.mocked(client.export).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { success: true, data: webpFiles(new Uint8Array([7])), issues: [] };
    });
    const service = createService(client);
    const result = service.export(imageJob('late', 'capture'));
    await vi.waitFor(() => {
      expect(client.export).toHaveBeenCalledOnce();
    });

    service.dispose();
    release?.();

    await expect(result).rejects.toThrow('after its client was disposed');
    expect(client.terminate).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
  });

  it('should fail preflight with a stable adapter-unavailable code and one safe queue warning', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sourceEntryPath = 'src/main.ts';
    const service = trackService(
      new HeadlessImageService({
        runtimeConfig: { tauApiUrl: 'https://example.test', tauWebSocketUrl: 'wss://example.test' },
        isGpuAvailable: () => false,
      }),
    );

    const result = service.export(imageJob('missing-1', 'capture', sourceEntryPath));
    await expect(result).rejects.toBeInstanceOf(HeadlessImageError);
    await expect(result).rejects.toMatchObject({
      code: 'adapter-unavailable',
      message: 'WebGPU is unavailable; update your browser or use the Tau CLI for image exports.',
    });
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith('Headless image job failed', {
      kind: 'capture',
      projectId: 'project-1',
      identity: 'missing-1',
      sourceLocator: sourceEntryPath,
      code: 'adapter-unavailable',
      message: 'WebGPU is unavailable; update your browser or use the Tau CLI for image exports.',
    });
  });
});
