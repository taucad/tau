import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
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
let snapshotEntryPath: string | undefined = sourceEntryPath;
const getSnapshot = vi.fn(() => ({
  context: {
    kernelClient: {},
    entryPath: snapshotEntryPath,
    parameters: { size: 10 },
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
const runtimeFileSystem = fromMemoryFs();
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ writeFile, runtimeFileSystem }),
}));

const webpFile = (bytes: number[]) => [{ name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array(bytes) }];
const exportImage = vi.fn(async (_job: HeadlessImageJob) => webpFile([1, 2, 3]));
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

describe('useThumbnailGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumbnailInput = undefined;
    geometryListener = undefined;
    snapshotEntryPath = sourceEntryPath;
    getProjectFileSystemConfig.mockResolvedValue(locator('/projects/one'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should forward the settled nested entry path unchanged and commit bytes', async () => {
    renderHook(() => useThumbnailGenerator());
    const artifact = await thumbnailInput!.render({ kind: 'manual-thumbnail' });

    await thumbnailInput!.store(artifact);

    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', new Uint8Array([1, 2, 3]), { source: 'machine' });
    expect(exportImage).toHaveBeenCalledWith({
      kind: 'manual-thumbnail',
      identity: 'proj_aaaaaaaaaaaaaaaaaaaaa:unsettled',
      projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
      sourceFormat: 'gltf',
      format: 'webp',
      fileSystem: runtimeFileSystem,
      source: { path: sourceEntryPath },
      parameters: { size: 10 },
      includeEdges: true,
      exportOptions: {
        mode: 'single',
        width: 768,
        height: 576,
        margin: 0.1,
        projection: 'perspective',
        phi: 60,
        theta: -45,
        quality: 0.9,
      },
    });
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'gltf') {
      throw new Error('Expected a GLTF image job');
    }
    expect(job.source.path).toBe(sourceEntryPath);
  });

  it('should reject a missing settled source without enqueueing an image export', async () => {
    snapshotEntryPath = undefined;
    renderHook(() => useThumbnailGenerator());

    try {
      await thumbnailInput!.render({ kind: 'manual-thumbnail' });
      expect.fail('render should reject without a settled entry path');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('source-unavailable: settled CAD entry path not ready');
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
      { name: 'render.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) },
      { name: 'render.png', mimeType: 'image/png', bytes: new Uint8Array() },
    ]);
    await expect(thumbnailInput!.render({ kind: 'manual-thumbnail' })).rejects.toThrow(
      'Thumbnail export expected exactly one non-empty image/webp artifact, received 2: image/webp 1B, image/png 0B',
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should include 4:3 dimensions in the settled thumbnail identity', () => {
    renderHook(() => useThumbnailGenerator());

    geometryListener?.({ geometry: { hash: 'geometry-hash' } });

    const event = send.mock.calls.at(-1)?.[0];
    expect(event?.type).toBe('settled');
    if (event?.type === 'settled') {
      expect(event.hash).toBe('proj_aaaaaaaaaaaaaaaaaaaaa:src/main.ts:geometry-hash:webp:q0.9:768x576:m0.1:edges');
    }
  });

  it('should discard bytes when the project locator changes during rendering', async () => {
    getProjectFileSystemConfig
      .mockResolvedValueOnce(locator('/projects/one'))
      .mockResolvedValueOnce(locator('/projects/two'));
    renderHook(() => useThumbnailGenerator());
    const artifact = await thumbnailInput!.render({ kind: 'manual-thumbnail' });

    await thumbnailInput!.store(artifact);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should report a thumbnail write failure once and rethrow it', async () => {
    const failure = new TypeError('project storage is unavailable');
    writeFile.mockRejectedValueOnce(failure);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderHook(() => useThumbnailGenerator());
    const artifact = await thumbnailInput!.render({ kind: 'manual-thumbnail' });

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
});
