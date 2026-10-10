import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { WatchEvent } from '@taucad/filesystem';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: vi.fn() }));
type FileManager = ReturnType<typeof useFileManager>;

function source(readBytes: (path: string) => Promise<Uint8Array<ArrayBuffer>>, ready = Promise.resolve()) {
  function readFile(path: string, options: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, options?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const bytes = await readBytes(path);
    return options === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
  }
  let listener: ((event: WatchEvent) => void) | undefined;
  const dispose = vi.fn();
  const closed = Promise.withResolvers<void>();
  const manager = mock<FileManager>({
    recordFiles: mock<FileManager['recordFiles']>({ readFile }),
    watchRecordFile: vi.fn<FileManager['watchRecordFile']>((_path, onEvent) => {
      listener = onEvent;
      return { ready, closed: closed.promise, dispose };
    }),
  });
  return {
    manager,
    dispose,
    closed,
    change: (event?: WatchEvent) => {
      listener?.(event ?? { type: 'change', path: 'thumbnail.webp' });
    },
  };
}

describe('useProjectThumbnail', () => {
  beforeEach(() => {
    let sequence = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-${++sequence}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares the canonical source read and URL until the final release', async () => {
    const readFile = vi.fn(async () => new Uint8Array([1]));
    const fixture = source(readFile);
    vi.mocked(useFileManager).mockReturnValue(fixture.manager);
    const first = renderHook(() => useProjectThumbnail('p'));
    const second = renderHook(() => useProjectThumbnail('p'));
    await waitFor(() => {
      expect(first.result.current.url).toBe('blob:mock-1');
    });
    expect(second.result.current.url).toBe('blob:mock-1');
    expect(readFile).toHaveBeenCalledExactlyOnceWith('/projects/p/thumbnail.webp');
    first.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    second.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:mock-1');
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });

  it('waits for actual registration acknowledgement before reading', async () => {
    const ready = Promise.withResolvers<void>();
    const readFile = vi.fn(async () => new Uint8Array([1]));
    const fixture = source(readFile, ready.promise);
    vi.mocked(useFileManager).mockReturnValue(fixture.manager);
    renderHook(() => useProjectThumbnail('p'));
    expect(readFile).not.toHaveBeenCalled();
    await act(async () => {
      ready.resolve();
    });
    await waitFor(() => {
      expect(readFile).toHaveBeenCalledOnce();
    });
  });

  it('discards a read invalidated by deletion and revokes the settled URL', async () => {
    const gate = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const readFile = vi
      .fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>()
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockImplementationOnce(async () => gate.promise)
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const fixture = source(readFile);
    vi.mocked(useFileManager).mockReturnValue(fixture.manager);
    const view = renderHook(() => useProjectThumbnail('p'));
    await waitFor(() => {
      expect(view.result.current.url).toBe('blob:mock-1');
    });
    act(() => {
      fixture.change();
    });
    await waitFor(() => {
      expect(readFile).toHaveBeenCalledTimes(2);
    });
    act(() => {
      fixture.change({ type: 'delete', path: 'thumbnail.webp' });
    });
    await act(async () => {
      gate.resolve(new Uint8Array([2]));
    });
    await waitFor(() => {
      expect(view.result.current.url).toBeUndefined();
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('rebinds equal project paths to a replacement capability', async () => {
    const first = source(vi.fn(async () => new Uint8Array([1])));
    const second = source(vi.fn(async () => new Uint8Array([2])));
    vi.mocked(useFileManager).mockReturnValue(first.manager);
    const view = renderHook(() => useProjectThumbnail('p'));
    await waitFor(() => {
      expect(view.result.current.url).toBe('blob:mock-1');
    });
    vi.mocked(useFileManager).mockReturnValue(second.manager);
    view.rerender();
    await waitFor(() => {
      expect(view.result.current.url).toBe('blob:mock-2');
    });
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('retains equal thumbnail bytes and disposes the unused URL', async () => {
    const fixture = source(vi.fn(async () => new Uint8Array([1])));
    vi.mocked(useFileManager).mockReturnValue(fixture.manager);
    const view = renderHook(() => useProjectThumbnail('p'));
    await waitFor(() => {
      expect(view.result.current.url).toBe('blob:mock-1');
    });
    act(() => {
      fixture.change({ type: 'reset' });
    });
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-2');
    });
    expect(view.result.current.url).toBe('blob:mock-1');
  });
});
