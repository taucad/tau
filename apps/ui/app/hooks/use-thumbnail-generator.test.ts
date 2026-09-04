import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ThumbnailEvent, ThumbnailInput } from '#machines/thumbnail.machine.js';
import type { HeadlessImageJob } from '#services/headless-image.service.js';

let thumbnailInput: ThumbnailInput | undefined;
const send = vi.fn<(event: ThumbnailEvent) => void>();

vi.mock('@xstate/react', () => ({
  useActorRef: (_machine: unknown, options: { input: ThumbnailInput }) => {
    thumbnailInput = options.input;
    return { send };
  },
}));

const sourceEntryPath = 'src/main.ts';
const geometryContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
let geometryFormat: 'gltf' | 'svg' = 'gltf';
let snapshotEntryPath: string | undefined = sourceEntryPath;
const getSnapshot = vi.fn(() => ({
  context: {
    entryPath: snapshotEntryPath,
    geometry: {
      format: geometryFormat,
      content: geometryFormat === 'gltf' ? geometryContent : '<svg xmlns="http://www.w3.org/2000/svg"/>',
      hash: 'geometry-hash',
    },
  },
}));
let geometryListener: ((event: { geometry: { hash: string } }) => void) | undefined;
const unsubscribe = vi.fn();
const on = vi.fn((_event: string, listener: (event: { geometry: { hash: string } }) => void) => {
  geometryListener = listener;
  return { unsubscribe };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    geometryUnits: new Map([['src/main.ts', { getSnapshot, on }]]),
    mainEntryPath: 'src/main.ts',
    projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  }),
}));

const writeFile = vi.fn(async () => undefined);
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ writeFile }),
}));

const webpBytes = (marker = 0): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(13);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes[12] = marker;
  return bytes;
};
const webpFile = (marker = 0) => [{ name: 'render.webp', mimeType: 'image/webp', bytes: webpBytes(marker) }];
const exportImage = vi.fn(async (_job: HeadlessImageJob) => webpFile(1));
vi.mock('#providers/headless-image-provider.js', () => ({
  useHeadlessImageService: () => ({ export: exportImage }),
}));

const getProjectFileSystemConfig = vi.fn();
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig,
}));

const { useThumbnailGenerator } = await import('#hooks/use-thumbnail-generator.js');

const locator = (providerBasePath: string) =>
  ({
    projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    backend: 'indexeddb',
    providerBasePath,
  }) as const;

const renderArtifact = async () => {
  const result = await thumbnailInput!.render({ kind: 'manual-thumbnail' });
  if ('status' in result) {
    throw new Error('Expected a rendered thumbnail artifact');
  }
  return result;
};

describe('useThumbnailGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumbnailInput = undefined;
    geometryListener = undefined;
    snapshotEntryPath = sourceEntryPath;
    geometryFormat = 'gltf';
    getProjectFileSystemConfig.mockResolvedValue(locator('/projects/one'));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 768, height: 576, close: vi.fn() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should forward the settled nested entry path unchanged and commit bytes', async () => {
    renderHook(() => useThumbnailGenerator());
    const artifact = await renderArtifact();

    await expect(thumbnailInput!.store(artifact)).resolves.toEqual({ status: 'stored' });

    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', webpBytes(1), { source: 'machine' });
    expect(exportImage).toHaveBeenCalledWith({
      kind: 'manual-thumbnail',
      identity: 'proj_aaaaaaaaaaaaaaaaaaaaa:unsettled',
      projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
      sourceFormat: 'glb',
      sourcePath: sourceEntryPath,
      geometryHash: 'geometry-hash',
      content: geometryContent,
      format: 'webp',
      exportOptions: {
        mode: 'single',
        width: 768,
        height: 576,
        lineWidth: 3,
        camera: {
          framing: 'bounds',
          direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
          up: [0, 0, 1],
          margin: 0.1,
          projection: { kind: 'perspective', verticalFieldOfView: 45 },
        },
        quality: 0.9,
      },
    });
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'glb' || job.kind === 'capture') {
      throw new Error('Expected a GLB thumbnail job');
    }
    expect(job.sourcePath).toBe(sourceEntryPath);
    expect(job.content).toBe(geometryContent);
  });

  it('should reject a missing settled source without enqueueing an image export', async () => {
    snapshotEntryPath = undefined;
    renderHook(() => useThumbnailGenerator());

    try {
      await thumbnailInput!.render({ kind: 'manual-thumbnail' });
      expect.fail('render should reject without a settled entry path');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('source-unavailable: settled canonical GLB not ready');
    }
    expect(exportImage).not.toHaveBeenCalled();
  });

  it('should reject a malformed thumbnail result', async () => {
    exportImage.mockResolvedValueOnce([]);
    renderHook(() => useThumbnailGenerator());

    await expect(thumbnailInput!.render({ kind: 'manual-thumbnail' })).rejects.toThrow(
      'Thumbnail export expected exactly one non-empty image/webp artifact, received 0:',
    );

    exportImage.mockResolvedValueOnce([
      { name: 'render.webp', mimeType: 'image/webp', bytes: webpBytes(1) },
      { name: 'render.png', mimeType: 'image/png', bytes: new Uint8Array() },
    ]);
    await expect(thumbnailInput!.render({ kind: 'manual-thumbnail' })).rejects.toThrow(
      'Thumbnail export expected exactly one non-empty image/webp artifact, received 2: image/webp 13B, image/png 0B',
    );
    exportImage.mockResolvedValueOnce([
      { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    await expect(thumbnailInput!.render({ kind: 'manual-thumbnail' })).rejects.toThrow('without a WebP signature');
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 640,
      height: 480,
      close: vi.fn(),
    } as unknown as ImageBitmap);
    exportImage.mockResolvedValueOnce(webpFile(2));
    await expect(thumbnailInput!.render({ kind: 'manual-thumbnail' })).rejects.toThrow(
      'expected 768×576 pixels, received 640×480',
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should return a typed skip for automatic SVG sources without exporting them', async () => {
    geometryFormat = 'svg';
    renderHook(() => useThumbnailGenerator());

    await expect(thumbnailInput!.render({ kind: 'automatic-thumbnail', identity: 'svg-identity' })).resolves.toEqual({
      status: 'skipped',
      identity: 'svg-identity',
      reason: 'svg-source',
    });
    expect(exportImage).not.toHaveBeenCalled();
  });

  it('should include the render recipe in the settled thumbnail identity', () => {
    renderHook(() => useThumbnailGenerator());

    geometryListener?.({ geometry: { hash: 'geometry-hash' } });

    const event = send.mock.calls.at(-1)?.[0];
    expect(event?.type).toBe('settled');
    if (event?.type === 'settled') {
      expect(event.hash).toBe(
        'proj_aaaaaaaaaaaaaaaaaaaaa:src/main.ts:geometry-hash:webp:q0.9:768x576:m0.1:lw3:camera-bounds-v1:edges',
      );
    }
  });

  it('should discard bytes when the project locator changes during rendering', async () => {
    getProjectFileSystemConfig
      .mockResolvedValueOnce(locator('/projects/one'))
      .mockResolvedValueOnce(locator('/projects/two'));
    renderHook(() => useThumbnailGenerator());
    const artifact = await renderArtifact();

    await expect(thumbnailInput!.store(artifact)).resolves.toEqual({
      status: 'skipped',
      reason: 'locator-changed',
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should report a thumbnail write failure once and rethrow it', async () => {
    const failure = new TypeError('project storage is unavailable');
    writeFile.mockRejectedValueOnce(failure);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderHook(() => useThumbnailGenerator());
    const artifact = await renderArtifact();

    await expect(thumbnailInput!.store(artifact)).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Thumbnail write failed', {
      projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
      identity: 'proj_aaaaaaaaaaaaaaaaaaaaa:unsettled',
      path: 'thumbnail.webp',
      message: 'project storage is unavailable',
    });
  });

  it('should unsubscribe from geometry events on unmount', () => {
    const { unmount } = renderHook(() => useThumbnailGenerator());

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should resolve regenerate with the machine-reported outcome', async () => {
    const hook = renderHook(() => useThumbnailGenerator());
    const outcome = hook.result.current.regenerate();
    expect(send).toHaveBeenLastCalledWith({ type: 'regenerate' });

    thumbnailInput!.onManualResult?.({
      status: 'stored',
      kind: 'manual-thumbnail',
      identity: 'manual-identity',
    });

    await expect(outcome).resolves.toEqual({
      status: 'stored',
      kind: 'manual-thumbnail',
      identity: 'manual-identity',
    });
  });
});
