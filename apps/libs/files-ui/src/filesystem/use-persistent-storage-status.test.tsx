import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePersistentStorageStatus } from '#filesystem/use-persistent-storage-status.js';
import type { PersistentStorageStatus } from '#filesystem/handle-store.js';

const state = vi.hoisted(() => ({
  status: 'best-effort' as PersistentStorageStatus,
  refresh: vi.fn(async () => undefined),
  listener: undefined as (() => void) | undefined,
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getPersistentStorageStatus: () => state.status,
  refreshPersistentStorageStatus: state.refresh,
  subscribePersistentStorageStatus: (listener: () => void) => {
    state.listener = listener;
    return () => {
      state.listener = undefined;
    };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
});

describe('storage status settings lifecycle', () => {
  it('should passively check on mount and focus, render changes, and clean up', async () => {
    const { result, unmount } = renderHook(() => usePersistentStorageStatus(), { wrapper: StrictMode });
    await waitFor(() => {
      expect(state.refresh).toHaveBeenCalled();
    });
    state.refresh.mockClear();
    act(() => {
      globalThis.dispatchEvent(new Event('focus'));
      state.status = 'persistent';
      state.listener?.();
    });
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(result.current).toBe('persistent');
    unmount();
    globalThis.dispatchEvent(new Event('focus'));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
});
