import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useViewPing } from '#components/share/use-view-ping.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useViewPing', () => {
  it('does not call fetch before the dwell window has elapsed', async () => {
    renderHook(() => {
      useViewPing({ publicationId: 'pub_x', apiBaseUrl: 'https://api.example' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch after dwell elapses with no interaction', async () => {
    renderHook(() => {
      useViewPing({ publicationId: 'pub_x', apiBaseUrl: 'https://api.example' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires a single PATCH after dwell + at least one interaction', async () => {
    renderHook(() => {
      useViewPing({ publicationId: 'pub_x', apiBaseUrl: 'https://api.example/' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    act(() => {
      globalThis.dispatchEvent(new Event('pointerdown'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call?.[0] as string | undefined;
    const init = call?.[1] as RequestInit | undefined;
    expect(url).toBe('https://api.example/v1/publications/pub_x/views');
    expect(init?.method).toBe('PATCH');
    expect(init?.credentials).toBe('include');
  });
  it('counts a parameter change after initial resolution as an interaction', async () => {
    const initial = { radius: 4 };
    const { rerender } = renderHook(
      ({ parameters }: { parameters: Record<string, unknown> | undefined }) => {
        useViewPing({ publicationId: 'pub_x', apiBaseUrl: 'https://api.example', parameters });
      },
      { initialProps: { parameters: undefined as Record<string, unknown> | undefined } },
    );
    rerender({ parameters: initial });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ parameters: { radius: 5 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
