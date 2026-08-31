import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessImageJob } from '#services/headless-image.service.js';

const sourceEntryPath = 'src/main.ts';
const geometryContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const getSnapshot = vi.fn(() => ({
  context: {
    entryPath: sourceEntryPath,
    geometry: { format: 'gltf' as const, content: geometryContent, hash: 'geometry-hash' },
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

const locator = {
  projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  backend: 'indexeddb',
  providerBasePath: '/proj-aaa',
} as const;

const deferred = <T,>() => {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
};

const settle = (hash: string): void => {
  act(() => {
    geometryListener?.({ geometry: { hash } });
  });
};

const advance = async (milliseconds: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};

describe('useThumbnailGenerator integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    geometryListener = undefined;
    getProjectFileSystemConfig.mockResolvedValue(locator);
    exportImage.mockResolvedValue(webpFile([1, 2, 3]));
    writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should debounce a settlement and persist bytes from the exact settled source', async () => {
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash');
    expect(exportImage).not.toHaveBeenCalled();
    await advance(999);
    expect(exportImage).not.toHaveBeenCalled();

    await advance(1);

    expect(exportImage).toHaveBeenCalledOnce();
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'glb' || job.kind === 'capture') {
      throw new Error('Expected a GLB thumbnail job');
    }
    expect(job.sourcePath).toBe(sourceEntryPath);
    expect(job.content).toBe(geometryContent);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', new Uint8Array([1, 2, 3]), { source: 'machine' });
  });

  it('should discard a late artifact after a newer settlement and persist only the latest bytes', async () => {
    const first = deferred<ReturnType<typeof webpFile>>();
    exportImage.mockImplementationOnce(async () => first.promise).mockResolvedValueOnce(webpFile([2]));
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash-1');
    await advance(2000);
    expect(exportImage).toHaveBeenCalledOnce();

    settle('geometry-hash-2');
    first.resolve(webpFile([1]));
    await advance(0);
    expect(writeFile).not.toHaveBeenCalled();

    await advance(2000);

    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', new Uint8Array([2]), { source: 'machine' });
  });

  it('should recover from a failed request on a newer settlement without writing failed bytes', async () => {
    exportImage.mockRejectedValueOnce(new TypeError('headless export failed')).mockResolvedValueOnce(webpFile([4]));
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash-1');
    await advance(2000);
    expect(writeFile).not.toHaveBeenCalled();

    settle('geometry-hash-2');
    await advance(2000);

    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', new Uint8Array([4]), { source: 'machine' });
  });
});
