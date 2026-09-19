import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import type { ExportFile } from '@taucad/types';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import { HeadlessImageError, HeadlessImageService } from '#services/headless-image.service.js';
import type { HeadlessImageJob, HeadlessImageServiceDependencies } from '#services/headless-image.service.js';

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
type WebpGlbJob = Extract<HeadlessImageJob, { readonly sourceFormat: 'glb'; readonly format: 'webp' }>;
const captureJob = (identity: string, overrides: Partial<WebpGlbJob> = {}): WebpGlbJob => ({
  kind: 'capture',
  identity,
  sourceFormat: 'glb',
  sourcePath: 'main.ts',
  geometryHash: 'geometry-hash',
  content: glb,
  format: 'webp',
  exportOptions: { width: 16, height: 16 },
  ...overrides,
});

const createFixture = (dependencies: HeadlessImageServiceDependencies = {}) => {
  const imageClient = createMockRuntimeClient<typeof imageRuntime>();
  vi.mocked(imageClient.transcode).mockResolvedValue({ success: true, data: files(), issues: [] });
  const service = new HeadlessImageService({
    createImageClient: vi.fn().mockResolvedValue(imageClient),
    isGpuAvailable: () => true,
    ...dependencies,
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
    await expect(service.export(job)).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledWith({
      from: 'glb',
      to: 'webp',
      files: [{ name: 'render.glb', bytes: job.content, mimeType: 'model/gltf-binary' }],
      options: { width: 16, height: 16 },
    });
  });

  it('serializes jobs and runs explicit work before queued automatic work without terminating the client', async () => {
    const { imageClient, service } = createFixture();
    let release: (() => void) | undefined;
    const completionOrder: string[] = [];
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
    const queuedAutomatic = (async () => {
      await service.export(thumbnailJob('automatic-next'));
      completionOrder.push('automatic');
    })();
    const capture = (async () => {
      await service.export(captureJob('capture'));
      completionOrder.push('capture');
    })();
    expect(imageClient.terminate).not.toHaveBeenCalled();
    release?.();
    await expect(Promise.all([automatic, queuedAutomatic, capture])).resolves.toHaveLength(3);
    expect(completionOrder).toEqual(['capture', 'automatic']);
  });

  it('rejects pre-aborted and queued work without starting or poisoning sibling jobs', async () => {
    const { imageClient, service } = createFixture();
    const preAborted = new AbortController();
    preAborted.abort(new DOMException('pre-aborted', 'AbortError'));
    await expect(service.export(captureJob('pre', { signal: preAborted.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(imageClient.transcode).not.toHaveBeenCalled();

    const gate = Promise.withResolvers<void>();
    vi.mocked(imageClient.transcode).mockImplementationOnce(async () => {
      await gate.promise;
      return { success: true, data: files(), issues: [] };
    });
    const active = service.export(captureJob('active'));
    await vi.waitFor(() => {
      expect(imageClient.transcode).toHaveBeenCalledOnce();
    });
    const queuedAbort = new AbortController();
    const cancelled = service.export(captureJob('cancelled', { signal: queuedAbort.signal }));
    const sibling = service.export(captureJob('sibling', { geometryHash: 'sibling' }));
    queuedAbort.abort(new DOMException('queued-abort', 'AbortError'));
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(imageClient.transcode).toHaveBeenCalledOnce();

    gate.resolve();
    await expect(Promise.all([active, sibling])).resolves.toHaveLength(2);
    expect(imageClient.transcode).toHaveBeenCalledTimes(2);
  });

  it('settles active cancellation promptly but joins non-cooperative work before starting its sibling', async () => {
    const { imageClient, service } = createFixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(imageClient.transcode).mockImplementationOnce(async () => {
      await gate.promise;
      return { success: true, data: files(), issues: [] };
    });
    const controller = new AbortController();
    const cancelled = service.export(captureJob('active-cancel', { signal: controller.signal }));
    await vi.waitFor(() => {
      expect(imageClient.transcode).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(imageClient.transcode).mock.calls[0]?.[0]).toMatchObject({ signal: controller.signal });
    const sibling = service.export(captureJob('after-cancel', { geometryHash: 'after-cancel' }));
    controller.abort(new DOMException('active-abort', 'AbortError'));
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(imageClient.transcode).toHaveBeenCalledOnce();

    gate.resolve();
    await expect(sibling).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledTimes(2);
  });

  it('does not start an aborted operation after shared client initialization and detaches its listener', async () => {
    const imageClient = createMockRuntimeClient<typeof imageRuntime>();
    vi.mocked(imageClient.transcode).mockResolvedValue({ success: true, data: files(), issues: [] });
    const connected = Promise.withResolvers<void>();
    vi.mocked(imageClient.connect).mockImplementation(async () => connected.promise);
    const service = new HeadlessImageService({
      createImageClient: vi.fn().mockResolvedValue(imageClient),
      isGpuAvailable: () => true,
    });
    activeServices.add(service);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const cancelled = service.export(captureJob('during-init', { signal: controller.signal }));
    await vi.waitFor(() => {
      expect(imageClient.connect).toHaveBeenCalledOnce();
    });
    controller.abort(new DOMException('init-abort', 'AbortError'));
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    connected.resolve();

    await expect(service.export(captureJob('init-sibling', { geometryHash: 'init-sibling' }))).resolves.toEqual(
      files(),
    );
    expect(imageClient.transcode).toHaveBeenCalledOnce();
    expect(imageClient.terminate).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalled();
  });

  it('joins an aborted non-cooperative SVG render and ignores its result before continuing', async () => {
    const gate = Promise.withResolvers<void>();
    const renderSvg = vi.fn(async (): Promise<ExportFile> => {
      await gate.promise;
      return { name: 'drawing.png', mimeType: 'image/png', bytes: new Uint8Array([1]) };
    });
    const { imageClient, service } = createFixture({ renderSvg });
    const controller = new AbortController();
    const svgJob = {
      kind: 'capture',
      identity: 'svg',
      sourceFormat: 'svg',
      sourcePath: 'drawing.svg',
      content: '<svg/>',
      format: 'png',
      signal: controller.signal,
    } as const satisfies HeadlessImageJob;
    const cancelled = service.export(svgJob);
    await vi.waitFor(() => {
      expect(renderSvg).toHaveBeenCalledOnce();
    });
    const sibling = service.export(captureJob('after-svg', { geometryHash: 'after-svg' }));
    controller.abort(new DOMException('svg-abort', 'AbortError'));
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(imageClient.transcode).not.toHaveBeenCalled();

    gate.resolve();
    await expect(sibling).resolves.toEqual(files());
    expect(imageClient.transcode).toHaveBeenCalledOnce();
  });

  it('retains the image client until owner disposal', async () => {
    const { imageClient, service } = createFixture();
    await service.export(thumbnailJob('thumb'));
    await service.export(captureJob('capture'));
    expect(imageClient.terminate).not.toHaveBeenCalled();
    service.dispose();
    expect(imageClient.terminate).toHaveBeenCalledOnce();
  });

  it('terminates a client whose connection fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { imageClient, service } = createFixture();
    vi.mocked(imageClient.connect).mockRejectedValueOnce(new Error('worker handshake failed'));

    await expect(service.export(captureJob('failed-connect'))).rejects.toThrow('worker handshake failed');

    expect(imageClient.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a queued job when the drain fails before the export runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new HeadlessImageService({
      createImageClient: vi.fn(),
      isGpuAvailable: () => true,
      /*
       * The drain reads this between dequeue and execute. Anything raised in
       * that region used to reject `drain()` — whose only caller discards the
       * rejection — leaving `export()` pending forever, which is how a
       * `screenshot` in the agent-host worker stalled for 900 s with no error.
       */
      get debug(): boolean {
        throw new Error('drain failed before execute');
      },
    });
    activeServices.add(service);

    await expect(service.export(captureJob('drain-failure'))).rejects.toThrow('drain failed before execute');
  });

  it('owns and terminates a connection that is still in progress during disposal', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { imageClient, service } = createFixture();
    let finishConnect!: () => void;
    vi.mocked(imageClient.connect).mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          finishConnect = resolve;
        }),
    );

    const pending = service.export(captureJob('pending-connect'));
    await vi.waitFor(() => {
      expect(imageClient.connect).toHaveBeenCalledOnce();
    });
    service.dispose();

    expect(imageClient.terminate).toHaveBeenCalledOnce();
    finishConnect();
    await expect(pending).rejects.toThrow('HeadlessImageService was disposed');
    expect(imageClient.terminate).toHaveBeenCalledOnce();
  });

  it('settles an active caller when a non-cooperative SVG renderer never returns', async () => {
    const entered = Promise.withResolvers<void>();
    const renderSvg = vi.fn(async (): Promise<ExportFile> => {
      entered.resolve();
      return new Promise<never>(() => {
        // This backend deliberately ignores disposal and never settles.
      });
    });
    const { service } = createFixture({ renderSvg });
    const pending = service.export({
      kind: 'capture',
      identity: 'stalled-svg',
      sourceFormat: 'svg',
      sourcePath: 'drawing.svg',
      content: '<svg/>',
      format: 'png',
    });
    await entered.promise;

    service.dispose();

    await expect(pending).rejects.toThrow('HeadlessImageService was disposed');
    expect(renderSvg).toHaveBeenCalledOnce();
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
    expect(warn).toHaveBeenCalledWith('Headless image job failed (capture/encode): encode failed');
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

  it('evicts the oldest automatic failure identity after the bounded history fills', async () => {
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

    for (let index = 0; index <= 100; index++) {
      // oxlint-disable-next-line no-await-in-loop -- Fill the sequential service history deterministically.
      await expect(service.export(thumbnailJob(`broken-${index}`))).rejects.toMatchObject({ code: 'encode' });
    }

    await expect(service.export(thumbnailJob('broken-100'))).resolves.toBeUndefined();
    await expect(service.export(thumbnailJob('broken-0'))).rejects.toMatchObject({ code: 'encode' });
    expect(imageClient.transcode).toHaveBeenCalledTimes(102);
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

  it('selects direct SVG WebP rendering with the exact thumbnail options', async () => {
    const webp: ExportFile = { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) };
    const renderSvg = vi.fn(async () => webp);
    const { imageClient, service } = createFixture({ renderSvg });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"/>';
    const exportOptions = { width: 768, height: 576, quality: 0.9 };

    await expect(
      service.export({
        kind: 'automatic-thumbnail',
        identity: 'svg-webp',
        projectId: 'project-1',
        sourceFormat: 'svg',
        sourcePath: 'drawing.svg',
        content: svg,
        format: 'webp',
        exportOptions,
      }),
    ).resolves.toEqual([webp]);
    expect(renderSvg).toHaveBeenCalledWith(svg, 'webp', exportOptions);
    expect(imageClient.transcode).not.toHaveBeenCalled();
  });

  it('routes SVG through the host client when the selected backend has no direct SVG renderer', async () => {
    const { imageClient, service } = createFixture({ renderSvg: undefined, isGpuAvailable: undefined });
    const png: ExportFile[] = [{ name: 'render.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }];
    vi.mocked(imageClient.transcode).mockResolvedValueOnce({ success: true, data: png, issues: [] });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"/>';
    const options = { width: 128, height: 64, background: '#FFFFFF00', label: 'Part', margin: 0.15 };
    await expect(
      service.export({
        kind: 'capture',
        identity: 'desktop-svg',
        sourceFormat: 'svg',
        sourcePath: 'drawing.svg',
        content: svg,
        format: 'png',
        exportOptions: options,
      }),
    ).resolves.toEqual(png);
    expect(imageClient.transcode).toHaveBeenCalledWith({
      from: 'svg',
      to: 'png',
      files: [{ name: 'render.svg', bytes: new TextEncoder().encode(svg), mimeType: 'image/svg+xml' }],
      options,
    });
    expect(imageClient.render).not.toHaveBeenCalled();
  });

  it('does not probe renderer GPU when the selected execution host does not require it', async () => {
    const requestAdapter = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    try {
      const { imageClient, service } = createFixture({ isGpuAvailable: undefined });
      await expect(service.export(captureJob('desktop-no-gpu'))).resolves.toEqual(files());
      expect(imageClient.transcode).toHaveBeenCalledOnce();
      expect(requestAdapter).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it.each([
    { adapter: null, label: 'answers null' },
    { adapter: undefined, label: 'rejects', reject: true },
  ])('reports the same failure when navigator.gpu $label to requestAdapter', async ({ adapter, reject }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    /*
     * Playwright's Firefox and WebKit builds expose `navigator.gpu` and hand
     * back no adapter. Without this probe the image worker spawns, the raster
     * backend dereferences the null, and the `TypeError` escapes as an uncaught
     * worker error instead of a tool result.
     */
    const createImageClient = vi.fn();
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => {
          if (reject) {
            throw new Error('WebGPU is disabled');
          }
          return adapter;
        },
      },
    });
    const service = new HeadlessImageService({ createImageClient });
    activeServices.add(service);

    await expect(service.export(captureJob('null-adapter'))).rejects.toMatchObject({
      code: 'adapter-unavailable',
    });
    expect(createImageClient).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
