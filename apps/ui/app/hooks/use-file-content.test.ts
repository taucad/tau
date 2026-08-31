import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';

const mockContentService = {
  peekOutcome: vi.fn<(path: string) => FileContentResult>(),
  resolve: vi.fn<(path: string) => Promise<FileContentResult>>(),
  subscribe: vi.fn<(path: string | undefined, callback: () => void) => () => void>(),
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ contentService: mockContentService }),
}));

const { useFileContent } = await import('#hooks/use-file-content.js');

describe('useFileContent', () => {
  const loadingOutcome: FileContentResult = { kind: 'loading' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContentService.peekOutcome.mockReturnValue(loadingOutcome);
    mockContentService.resolve.mockResolvedValue({ kind: 'text', content: new Uint8Array([1, 2, 3]) });
    mockContentService.subscribe.mockImplementation((_path, _callback) => () => {
      /* No-op unsubscribe */
    });
  });

  it('should return loading kind when contentService reports loading', () => {
    mockContentService.peekOutcome.mockReturnValue({ kind: 'loading' });

    const { result } = renderHook(() => useFileContent('main.ts'));

    expect(result.current).toEqual({ kind: 'loading' });
  });

  it('should trigger resolve once on cache miss even across re-renders', () => {
    mockContentService.peekOutcome.mockReturnValue({ kind: 'loading' });

    const { rerender } = renderHook(() => useFileContent('main.ts'));
    rerender();
    rerender();

    expect(mockContentService.resolve).toHaveBeenCalledTimes(1);
    expect(mockContentService.resolve).toHaveBeenCalledWith('main.ts');
  });

  it('should not loop when peekOutcome returns the same loading sentinel', () => {
    // Regression: returning a fresh `{ kind: 'loading' }` from peekOutcome
    // breaks useSyncExternalStore's referential-equality contract and
    // triggers an infinite re-render that the parent error boundary turns
    // into a project-tree remount crash-loop. The sentinel must be stable.
    mockContentService.peekOutcome.mockReturnValue(loadingOutcome);

    const { result, rerender } = renderHook(() => useFileContent('main.ts'));
    rerender();
    rerender();

    expect(result.current).toBe(loadingOutcome);
  });

  it('should not trigger resolve when outcome is already text', () => {
    mockContentService.peekOutcome.mockReturnValue({ kind: 'text', content: new Uint8Array([1]) });

    renderHook(() => useFileContent('main.ts'));

    expect(mockContentService.resolve).not.toHaveBeenCalled();
  });

  it('should return text kind with content when contentService reports text', () => {
    const data = new Uint8Array([10, 20, 30]);
    mockContentService.peekOutcome.mockReturnValue({ kind: 'text', content: data });

    const { result } = renderHook(() => useFileContent('main.ts'));

    expect(result.current.kind).toBe('text');
    if (result.current.kind === 'text') {
      expect(result.current.content).toEqual(data);
    }
  });

  it('should return binary kind when contentService reports binary', () => {
    const head = new Uint8Array([0x00, 0x01, 0x02]);
    mockContentService.peekOutcome.mockReturnValue({ kind: 'binary', size: 4096, head, revision: 1 });

    const { result } = renderHook(() => useFileContent('mystery.dat'));

    expect(result.current.kind).toBe('binary');
    if (result.current.kind === 'binary') {
      expect(result.current.size).toBe(4096);
      expect(result.current.head).toEqual(head);
    }
  });

  it('should return too-large kind when contentService reports too-large', () => {
    mockContentService.peekOutcome.mockReturnValue({ kind: 'too-large', size: 9000, limit: 1024 });

    const { result } = renderHook(() => useFileContent('mystery.dat'));

    expect(result.current.kind).toBe('too-large');
    if (result.current.kind === 'too-large') {
      expect(result.current.size).toBe(9000);
      expect(result.current.limit).toBe(1024);
    }
  });

  it('should return orphaned kind when contentService reports orphaned', () => {
    mockContentService.peekOutcome.mockReturnValue({ kind: 'orphaned' });

    const { result } = renderHook(() => useFileContent('missing.ts'));

    expect(result.current).toEqual({ kind: 'orphaned' });
  });

  it('should return error kind with cause when contentService reports error', () => {
    const cause = new Error('disk on fire');
    mockContentService.peekOutcome.mockReturnValue({ kind: 'error', cause });

    const { result } = renderHook(() => useFileContent('main.ts'));

    expect(result.current.kind).toBe('error');
    if (result.current.kind === 'error') {
      expect(result.current.cause).toBe(cause);
    }
  });

  it('should re-render with the new path outcome when path changes', () => {
    const textResult: FileContentResult = { kind: 'text', content: new Uint8Array([1]) };
    const orphanedResult: FileContentResult = { kind: 'orphaned' };
    mockContentService.peekOutcome.mockImplementation((path: string) =>
      path === 'a.ts' ? textResult : orphanedResult,
    );

    const { result, rerender } = renderHook(({ path }) => useFileContent(path), {
      initialProps: { path: 'a.ts' },
    });

    expect(result.current.kind).toBe('text');

    rerender({ path: 'b.ts' });

    expect(result.current.kind).toBe('orphaned');
  });

  it('should re-render after subscriber notification (snapshot recomputed)', () => {
    const loading: FileContentResult = { kind: 'loading' };
    const text: FileContentResult = { kind: 'text', content: new Uint8Array([1, 2, 3]) };
    let registered: (() => void) | undefined;
    mockContentService.subscribe.mockImplementation((_path, callback) => {
      registered = callback;
      return () => {
        /* No-op unsubscribe */
      };
    });
    mockContentService.peekOutcome.mockReturnValue(loading);

    const { result } = renderHook(() => useFileContent('main.ts'));
    expect(result.current.kind).toBe('loading');

    mockContentService.peekOutcome.mockReturnValue(text);
    act(() => {
      registered?.();
    });

    expect(result.current.kind).toBe('text');
  });
});
