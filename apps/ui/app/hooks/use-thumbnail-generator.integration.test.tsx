import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyGlb } from '@taucad/geometry-core';
import type { HeadlessImageJob } from '#services/headless-image.service.js';

const sourceEntryPath = 'src/main.ts';
const geometryContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
let geometryBytes: Uint8Array<ArrayBuffer> = geometryContent;
let geometryFormat: 'gltf' | 'svg' = 'gltf';
let emptyEvaluationId: string | undefined;
let renderingNow = false;
let openAttempt = 0;
const currentArtifact = ():
  | { mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> }
  | { mimeType: 'image/svg+xml'; content: string } =>
  geometryFormat === 'gltf'
    ? { mimeType: 'model/gltf-binary', content: geometryBytes }
    : { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
const getSnapshot = vi.fn(() => ({
  context: {
    entryPath: sourceEntryPath,
    openAttempt,
    rendering: {
      success: true,
      requestId: 'request-1',
      evaluationId: 'evaluation-1',
      transient: false,
      view: 'model',
      artifact: currentArtifact(),
      hash: 'geometry-hash',
      issues: [],
    },
    evaluation:
      emptyEvaluationId === undefined
        ? undefined
        : {
            id: emptyEvaluationId,
            success: true,
            transient: false,
            views: [],
            exports: [],
            issues: [],
          },
  },
  matches: (state: string) => state === 'rendering' && renderingNow,
}));
type RenderEvent = {
  rendering:
    | {
        success: true;
        transient: boolean;
        hash: string;
        evaluationId: string;
        artifact: { mimeType: 'model/gltf-binary' | 'image/svg+xml'; content: Uint8Array<ArrayBuffer> | string };
      }
    | { success: false; transient: boolean };
};
let renderingListener: ((event: RenderEvent) => void) | undefined;
const unsubscribe = vi.fn();
let snapshotListener: ((snapshot: ReturnType<typeof getSnapshot>) => void) | undefined;
const unsubscribeSnapshots = vi.fn();
const subscribe = vi.fn((listener: (snapshot: ReturnType<typeof getSnapshot>) => void) => {
  snapshotListener = listener;
  return { unsubscribe: unsubscribeSnapshots };
});
const on = vi.fn((_event: string, listener: (event: RenderEvent) => void) => {
  renderingListener = listener;
  return { unsubscribe };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    geometryUnits: new Map([['src/main.ts', { getSnapshot, on, subscribe }]]),
    mainEntryPath: 'src/main.ts',
    projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  }),
}));

const writeFile = vi.fn(async () => undefined);
const deleteFile = vi.fn(async () => undefined);
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ writeFile, deleteFile }),
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
    renderingListener?.({
      rendering: {
        success: true,
        transient: false,
        hash,
        evaluationId: 'evaluation-1',
        artifact: getSnapshot().context.rendering.artifact,
      },
    });
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
    renderingListener = undefined;
    snapshotListener = undefined;
    geometryFormat = 'gltf';
    geometryBytes = geometryContent;
    emptyEvaluationId = undefined;
    renderingNow = false;
    openAttempt = 0;
    getProjectFileSystemConfig.mockResolvedValue(locator);
    exportImage.mockResolvedValue(webpFile(1));
    writeFile.mockResolvedValue(undefined);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1536, height: 1152, close: vi.fn() }));
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

  it('keeps the prior thumbnail on failure or transient output and clears it after a successful empty model', async () => {
    renderHook(() => useThumbnailGenerator());
    settle('committed-hash');
    await advance(1000);
    expect(writeFile).toHaveBeenCalledOnce();
    act(() => {
      renderingListener?.({ rendering: { success: false, transient: false } });
      renderingListener?.({
        rendering: {
          success: true,
          transient: true,
          hash: 'drag-hash',
          evaluationId: 'evaluation-1',
          artifact: getSnapshot().context.rendering.artifact,
        },
      });
    });
    await advance(2000);
    expect(exportImage).toHaveBeenCalledOnce();
    expect(deleteFile).not.toHaveBeenCalled();
    emptyEvaluationId = 'empty-evaluation';
    act(() => {
      snapshotListener?.(getSnapshot());
    });
    expect(deleteFile).toHaveBeenCalledWith('thumbnail.webp', { source: 'machine' });
  });

  it('clears a prior thumbnail for Replicad’s successful empty GLB model offer', async () => {
    renderHook(() => useThumbnailGenerator());
    settle('committed-hash');
    await advance(1000);
    expect(writeFile).toHaveBeenCalledOnce();

    geometryBytes = createEmptyGlb();
    settle('empty-glb-hash');
    await advance(2000);

    expect(deleteFile).toHaveBeenCalledWith('thumbnail.webp', { source: 'machine' });
    expect(exportImage).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledOnce();
  });

  it('debounces again when a newer committed rendering settles', async () => {
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash');
    await advance(900);
    settle('newer-rendering-hash');
    await advance(900);
    expect(exportImage).not.toHaveBeenCalled();

    await advance(100);

    expect(exportImage).toHaveBeenCalledOnce();
  });

  it('should retain an in-flight artifact when the same identity settles again', async () => {
    const result = deferred<ReturnType<typeof webpFile>>();
    exportImage.mockImplementationOnce(async () => result.promise);
    renderHook(() => useThumbnailGenerator());
    settle('geometry-hash');
    await advance(2000);
    settle('geometry-hash');
    result.resolve(webpFile(3));
    await advance(2000);
    expect(exportImage).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledExactlyOnceWith('thumbnail.webp', webpBytes(3), { source: 'machine' });
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

  it('should discard an in-flight artifact when a watched document starts another render', async () => {
    const first = deferred<ReturnType<typeof webpFile>>();
    exportImage.mockImplementationOnce(async () => first.promise).mockResolvedValueOnce(webpFile(2));
    renderHook(() => useThumbnailGenerator());

    settle('geometry-hash-1');
    await advance(2000);
    expect(exportImage).toHaveBeenCalledOnce();

    act(() => {
      renderingNow = true;
      snapshotListener?.(getSnapshot());
    });
    first.resolve(webpFile(1));
    await advance(0);
    expect(writeFile).not.toHaveBeenCalled();

    settle('geometry-hash-2');
    await advance(2000);
    expect(writeFile).toHaveBeenCalledExactlyOnceWith('thumbnail.webp', webpBytes(2), { source: 'machine' });
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

  it('should automatically render and store SVG thumbnails as WebP', async () => {
    geometryFormat = 'svg';
    renderHook(() => useThumbnailGenerator());

    settle('drawing-hash');
    await advance(2000);

    expect(exportImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'automatic-thumbnail',
        sourceFormat: 'svg',
        format: 'webp',
        content: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        exportOptions: { width: 1536, height: 1152, quality: 0.9 },
      }),
    );
    expect(writeFile).toHaveBeenCalledWith('thumbnail.webp', webpBytes(1), { source: 'machine' });
  });

  it('should abort an active export on unmount and never write its late bytes', async () => {
    const pending = deferred<ReturnType<typeof webpFile>>();
    exportImage.mockImplementationOnce(async () => pending.promise);
    const hook = renderHook(() => useThumbnailGenerator());

    settle('geometry-hash');
    await advance(1000);
    const job = exportImage.mock.calls[0]![0];
    expect(job.signal?.aborted).toBe(false);

    hook.unmount();
    /* @xstate/react 7 stops an unmounted actor at the next microtask (RB1-1), still before the
     * late bytes below can arrive. */
    await Promise.resolve();
    expect(job.signal?.aborted).toBe(true);
    pending.resolve(webpFile(9));
    await advance(0);

    expect(writeFile).not.toHaveBeenCalled();
  });
});
