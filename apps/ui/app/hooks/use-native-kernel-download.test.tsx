import { act, renderHook } from '@testing-library/react';
import type { KernelIssue } from '@taucad/runtime';
import type {
  DesktopKernelPreparation,
  DesktopKernelProgress,
  DesktopNativeKernelBridge,
} from '@taucad/types/desktop-native-kernels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { unpreparedKernelOf, useNativeKernelDownload } from '#hooks/use-native-kernel-download.js';

const bridge = vi.hoisted(() => ({ current: undefined as DesktopNativeKernelBridge | undefined }));

vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopNativeKernels: () => bridge.current,
}));

const unprepared = (kernel: string): KernelIssue => ({
  message: `The ${kernel} kernel is not prepared.`,
  severity: 'error',
  type: 'runtime',
  code: 'KERNEL_NOT_PREPARED',
  details: { kernel, package: `@taucad/${kernel}`, extension: '.py', byteLength: 300_000_000 },
});

/** A bridge whose preparations the test settles, and whose progress it reports. */
const fakeBridge = () => {
  const outcomes: Array<(outcome: DesktopKernelPreparation) => void> = [];
  const listeners = new Set<(progress: DesktopKernelProgress) => void>();
  const value = {
    prepare: vi.fn(
      async (_kernel: string) =>
        new Promise<DesktopKernelPreparation>((resolve) => {
          outcomes.push(resolve);
        }),
    ),
    cancel: vi.fn(async (_kernel: string) => undefined),
    subscribe: vi.fn((listener: (progress: DesktopKernelProgress) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  } satisfies DesktopNativeKernelBridge;
  return {
    value,
    settle: (outcome: DesktopKernelPreparation) => outcomes.shift()?.(outcome),
    report: (progress: DesktopKernelProgress) => {
      for (const listener of listeners) {
        listener(progress);
      }
    },
  };
};

describe('unpreparedKernelOf', () => {
  it('should name the kernel and size of the first KERNEL_NOT_PREPARED issue', () => {
    expect(
      unpreparedKernelOf([
        { message: 'x', severity: 'warning', type: 'runtime', code: 'DISPLAY_SIMPLIFIED' },
        unprepared('picogk'),
      ]),
    ).toEqual({
      kernel: 'picogk',
      byteLength: 300_000_000,
    });
    expect(unpreparedKernelOf([])).toBeUndefined();
  });
});

describe('useNativeKernelDownload', () => {
  beforeEach(() => {
    bridge.current = undefined;
  });

  it('should do nothing off the desktop', () => {
    const { result } = renderHook(() => useNativeKernelDownload([unprepared('build123d')], vi.fn()));

    expect(result.current).toBeUndefined();
  });

  it('should download an unprepared kernel at once, report progress and render again when ready', async () => {
    const fake = fakeBridge();
    bridge.current = fake.value;
    const onReady = vi.fn();
    const { result } = renderHook(() => useNativeKernelDownload([unprepared('build123d')], onReady));

    expect(fake.value.prepare).toHaveBeenCalledWith('build123d');
    expect(result.current).toMatchObject({ status: 'downloading', kernel: 'build123d', byteLength: 300_000_000 });

    act(() => {
      fake.report({ kernel: 'build123d', progress: 150, total: 300, message: 'Downloading' });
    });
    expect(result.current).toMatchObject({ progress: { done: 150, total: 300 } });

    await act(async () => {
      fake.settle({ status: 'ready', kernel: 'build123d', byteLength: 300 });
    });
    expect(onReady).toHaveBeenCalledOnce();
    expect(result.current).toBeUndefined();
  });

  it('should stop on a failed download and start it again on retry, without starting it twice on its own', async () => {
    const fake = fakeBridge();
    bridge.current = fake.value;
    const issues = [unprepared('picogk')];
    const { result, rerender } = renderHook(() => useNativeKernelDownload(issues, vi.fn()));

    await act(async () => {
      fake.settle({ status: 'failed', kernel: 'picogk', code: 'PREPARE_KERNEL_FAILED', message: 'Offline.' });
    });
    rerender();
    expect(result.current).toMatchObject({ status: 'stopped', message: 'Offline.' });
    expect(fake.value.prepare).toHaveBeenCalledTimes(1);

    act(() => {
      if (result.current?.status === 'stopped') {
        result.current.retry();
      }
    });
    expect(fake.value.prepare).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ status: 'downloading', kernel: 'picogk' });
  });

  it('should cancel through the bridge', () => {
    const fake = fakeBridge();
    bridge.current = fake.value;
    const { result } = renderHook(() => useNativeKernelDownload([unprepared('picogk')], vi.fn()));

    act(() => {
      if (result.current?.status === 'downloading') {
        result.current.cancel();
      }
    });
    expect(fake.value.cancel).toHaveBeenCalledWith('picogk');
  });
});
