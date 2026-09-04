import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

type MockPlacement = { state: 'local' } | { state: 'connecting' | 'remote'; deviceId: string };

const mocks = vi.hoisted(() => {
  let placement: MockPlacement = { state: 'local' };
  const localFactory: LazyKernelOptionsFactory = vi.fn();
  const remoteFactory: LazyKernelOptionsFactory = vi.fn();
  return {
    get placement(): MockPlacement {
      return placement;
    },
    set placement(value: MockPlacement) {
      placement = value;
    },
    revision: 0,
    localFactory,
    remoteFactory,
    localKernelOptions: vi.fn(),
  };
});

vi.mock('#constants/desktop-kernel-options.js', () => ({
  localKernelOptions: mocks.localKernelOptions,
}));

vi.mock('#constants/remote-kernel-options.js', () => ({
  remoteKernelOptions: mocks.remoteFactory,
}));

vi.mock('#lib/remote-compute-placement.js', () => ({
  useRemoteComputePlacement: () => mocks.placement,
  useRemoteComputeSelectionRevision: () => mocks.revision,
}));

const { useProjectKernelOptions } = await import('#hooks/use-project-kernel-options.js');

describe('useProjectKernelOptions', () => {
  beforeEach(() => {
    mocks.placement = { state: 'local' };
    mocks.revision = 0;
    mocks.localKernelOptions.mockReset();
    mocks.localKernelOptions.mockReturnValue(mocks.localFactory);
  });

  it('selects the rooted local factory and native trust requirement', () => {
    const { result } = renderHook(() =>
      useProjectKernelOptions({ projectId: 'project-python', nativeKernelId: 'build123d' }),
    );

    expect(mocks.localKernelOptions).toHaveBeenCalledWith('project-python', 'build123d');
    expect(result.current).toEqual({
      kernelOptionsFactory: mocks.localFactory,
      key: 'local:0',
      isLocal: true,
    });
  });

  it('selects the remote factory and keeps identity stable across connection phases', () => {
    mocks.placement = { state: 'connecting', deviceId: 'device-7' };
    mocks.revision = 4;
    const { result, rerender } = renderHook(() => useProjectKernelOptions({ projectId: 'project-remote' }));
    const connectingSelection = result.current;

    expect(connectingSelection).toEqual({
      kernelOptionsFactory: mocks.remoteFactory,
      key: 'device-7:4',
      isLocal: false,
    });

    mocks.placement = { state: 'remote', deviceId: 'device-7' };
    rerender();

    expect(result.current).toBe(connectingSelection);
  });

  it('changes the selection key when the explicit selection revision changes', () => {
    const { result, rerender } = renderHook(() => useProjectKernelOptions({ projectId: 'project-local' }));
    expect(result.current.key).toBe('local:0');

    mocks.revision = 1;
    rerender();

    expect(result.current.key).toBe('local:1');
  });
});
