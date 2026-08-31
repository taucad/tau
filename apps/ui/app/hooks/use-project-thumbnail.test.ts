import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: vi.fn(),
}));

type FileManagerReturn = ReturnType<typeof useFileManager>;
type ChangeChannel = NonNullable<FileManagerReturn['workerChangeChannel']>;

const createFileManager = (
  readFile: FileManagerReturn['client']['readFile'],
  workerChangeChannel?: ChangeChannel,
): FileManagerReturn =>
  mock<FileManagerReturn>({
    client: mock<FileManagerReturn['client']>({ readFile }),
    workerChangeChannel,
  });

describe('useProjectThumbnail', () => {
  beforeEach(() => {
    let counter = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      counter += 1;
      return `blob:mock-${counter}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should read the canonical project thumbnail and expose a blob object URL', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(useFileManager).mockReturnValue(createFileManager(readFile));

    const { result } = renderHook(() => useProjectThumbnail('proj-1'));

    await waitFor(() => {
      expect(result.current).toBe('blob:mock-1');
    });
    expect(readFile).toHaveBeenCalledWith('/projects/proj-1/thumbnail.webp');
  });

  it('should replace a mounted thumbnail after a worker write event', async () => {
    const readFile = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockResolvedValueOnce(new Uint8Array([2]));
    let written: Parameters<ChangeChannel['onFileWritten']>[0] | undefined;
    const unsubscribeWritten = vi.fn();
    const unsubscribeDeleted = vi.fn();
    const workerChangeChannel = mock<ChangeChannel>({
      onFileWritten: vi.fn((subscription: Parameters<ChangeChannel['onFileWritten']>[0]) => {
        written = subscription;
        return unsubscribeWritten;
      }),
      onFileDeleted: vi.fn(() => unsubscribeDeleted),
    });
    vi.mocked(useFileManager).mockReturnValue(createFileManager(readFile, workerChangeChannel));

    const { result, unmount } = renderHook(() => useProjectThumbnail('proj-1'));
    await waitFor(() => {
      expect(result.current).toBe('blob:mock-1');
    });

    expect(written?.interestedIn?.('/projects/proj-1/thumbnail.webp')).toBe(true);
    act(() => {
      written?.handler({ type: 'fileWritten', path: 'thumbnail.webp', backend: 'indexeddb' });
    });

    await waitFor(() => {
      expect(result.current).toBe('blob:mock-2');
    });
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');

    unmount();
    expect(unsubscribeWritten).toHaveBeenCalledOnce();
    expect(unsubscribeDeleted).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-2');
  });

  it('should revoke the object URL on unmount', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
    vi.mocked(useFileManager).mockReturnValue(createFileManager(readFile));

    const { result, unmount } = renderHook(() => useProjectThumbnail('proj-1'));
    await waitFor(() => {
      expect(result.current).toBe('blob:mock-1');
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('should return undefined when the file cannot be read', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
    vi.mocked(useFileManager).mockReturnValue(createFileManager(readFile));

    const { result } = renderHook(() => useProjectThumbnail('proj-1'));

    await waitFor(() => {
      expect(readFile).toHaveBeenCalled();
    });
    expect(result.current).toBeUndefined();
  });

  it('should not read when the project id is missing', () => {
    const readFile = vi.fn();
    vi.mocked(useFileManager).mockReturnValue(createFileManager(readFile));

    const { result } = renderHook(() => useProjectThumbnail(undefined));

    expect(result.current).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });
});
