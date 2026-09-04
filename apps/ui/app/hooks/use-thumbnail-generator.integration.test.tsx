import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessImageJob } from '#services/headless-image.service.js';

const sourceEntryPath = 'src/main.ts';
const geometryContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
let geometryFormat: 'gltf' | 'svg' = 'gltf';
const getSnapshot = vi.fn(() => ({
  context: {
    entryPath: sourceEntryPath,
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
    geometryFormat = 'gltf';
    getProjectFileSystemConfig.mockResolvedValue(locator);
    exportImage.mockResolvedValue(webpFile(1));
    writeFile.mockResolvedValue(undefined);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 768, height: 576, close: vi.fn() }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', webpBytes(1), { source: 'machine' });
  });

  it('should discard a late artifact after a newer settlement and persist only the latest bytes', async () => {
    const first = deferred<ReturnType<typeof webpFile>>();
    exportImage.mockImplementationOnce(async () => first.promise).mockResolvedValueOnce(webpFile(2));
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash-1');
    await advance(2000);
    expect(exportImage).toHaveBeenCalledOnce();

    settle('geometry-hash-2');
    first.resolve(webpFile(1));
    await advance(0);
    expect(writeFile).not.toHaveBeenCalled();

    await advance(2000);

    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', webpBytes(2), { source: 'machine' });
  });

  it('should recover from a failed request on a newer settlement without writing failed bytes', async () => {
    exportImage.mockRejectedValueOnce(new TypeError('headless export failed')).mockResolvedValueOnce(webpFile(4));
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash-1');
    await advance(2000);
    expect(writeFile).not.toHaveBeenCalled();

    settle('geometry-hash-2');
    await advance(2000);

    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', webpBytes(4), { source: 'machine' });
  });

  it('should retry the same identity after the filesystem locator changes before storage', async () => {
    const secondLocator = { ...locator, providerBasePath: '/proj-bbb' };
    getProjectFileSystemConfig.mockResolvedValueOnce(locator).mockResolvedValue(secondLocator);
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash');
    await advance(2000);
    expect(writeFile).not.toHaveBeenCalled();

    settle('geometry-hash');
    await advance(2000);

    expect(exportImage).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledOnce();
  });

  it('should gracefully skip automatic SVG thumbnails without invoking the GLB exporter', async () => {
    geometryFormat = 'svg';
    renderHook(() => useThumbnailGenerator());

    settle('drawing-hash');
    await advance(2000);

    expect(exportImage).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
