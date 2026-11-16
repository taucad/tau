import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getRemoteComputePlacement,
  getRemoteComputeSelectionRevision,
  selectLocalCompute,
  selectRemoteComputeDevice,
  setRemoteComputePlacement,
} from '@taucad/ui-core/lib/remote-compute-placement';
import {
  getComputeReuseMode,
  getComputeReuseRevision,
  setComputeReuseMode,
} from '@taucad/ui-core/lib/compute-reuse-preference';
import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import { useProjectKernelOptions } from '#hooks/use-project-kernel-options.js';
import { selectProjectKernelSelection } from '#runtime/choices-kernel-selection.js';

/** The stores as `choices` reads them. */
const currentChoices = () => ({
  computePlacement: getRemoteComputePlacement(),
  computeSelectionRevision: getRemoteComputeSelectionRevision(),
  computeReuseMode: getComputeReuseMode(),
  computeReuseRevision: getComputeReuseRevision(),
});

/* Each row moves the stores one step from the previous row, so revisions accumulate as they do in a tab. */
const rows: ReadonlyArray<readonly [name: string, step: () => void, nativeKernelId: string | undefined]> = [
  ['local at start', () => undefined, undefined],
  ['local with a native kernel', () => undefined, 'replicad'],
  [
    'local after a reuse change',
    () => {
      setComputeReuseMode('memory');
    },
    undefined,
  ],
  [
    'a device being connected',
    () => {
      selectRemoteComputeDevice('device-a');
    },
    undefined,
  ],
  [
    'the device connected',
    () => {
      setRemoteComputePlacement({ state: 'remote', deviceId: 'device-a' });
    },
    'replicad',
  ],
  [
    'the device offline',
    () => {
      setRemoteComputePlacement({ state: 'device-offline', deviceId: 'device-a' });
    },
    undefined,
  ],
  [
    'a reuse change while remote',
    () => {
      setComputeReuseMode('off');
    },
    undefined,
  ],
  [
    'back to local',
    () => {
      selectLocalCompute();
    },
    undefined,
  ],
  [
    'another device',
    () => {
      selectRemoteComputeDevice('device-b');
    },
    'openscad',
  ],
  [
    'local again after a reuse change',
    () => {
      selectLocalCompute();
      setComputeReuseMode('durable');
    },
    undefined,
  ],
];

describe('selectProjectKernelSelection', () => {
  afterEach(() => {
    selectLocalCompute();
    if (getComputeReuseMode() !== 'durable') {
      setComputeReuseMode('durable');
    }
  });

  it('should return the key and placement useProjectKernelOptions returns for the same inputs, row by row', () => {
    const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
    for (const [name, step, nativeKernelId] of rows) {
      step();
      const { result, unmount } = renderHook(() => useProjectKernelOptions({ projectId, nativeKernelId }));
      const selected = selectProjectKernelSelection(currentChoices(), { projectId, nativeKernelId });
      expect({ name, key: selected.key, isLocal: selected.isLocal }).toEqual({
        name,
        key: result.current.key,
        isLocal: result.current.isLocal,
      });
      if (selected.isLocal) {
        expect(selected.kernelOptionsFactory).toBeTypeOf('function');
        expect(selected.kernelOptionsFactory).not.toBe(remoteKernelOptions);
      } else {
        expect(selected.kernelOptionsFactory).toBe(remoteKernelOptions);
        expect(result.current.kernelOptionsFactory).toBe(remoteKernelOptions);
      }
      unmount();
    }
  });

  it('should key a local runtime by the reuse revision and a remote one by its device', () => {
    const before = selectProjectKernelSelection(currentChoices(), { projectId: 'p' }).key;
    setComputeReuseMode('memory');
    const afterReuse = selectProjectKernelSelection(currentChoices(), { projectId: 'p' }).key;
    expect(afterReuse).not.toBe(before);
    selectRemoteComputeDevice('device-a');
    const remote = selectProjectKernelSelection(currentChoices(), { projectId: 'p' });
    expect(remote.key).toBe(`device-a:${String(getRemoteComputeSelectionRevision())}`);
    expect(remote.isLocal).toBe(false);
  });
});
