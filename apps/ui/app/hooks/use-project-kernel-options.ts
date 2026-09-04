import { useMemo } from 'react';
import { localKernelOptions } from '#constants/desktop-kernel-options.js';
import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import { useRemoteComputePlacement, useRemoteComputeSelectionRevision } from '#lib/remote-compute-placement.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

export type ProjectKernelSelection = {
  readonly kernelOptionsFactory: LazyKernelOptionsFactory;
  readonly key: string;
  readonly isLocal: boolean;
};

/** Select the current host placement for every persistent-project runtime consumer. */
export const useProjectKernelOptions = ({
  projectId,
  nativeKernelId,
}: {
  readonly projectId: string;
  readonly nativeKernelId?: string;
}): ProjectKernelSelection => {
  const placement = useRemoteComputePlacement();
  const selectionRevision = useRemoteComputeSelectionRevision();
  const localOptions = useMemo(() => localKernelOptions(projectId, nativeKernelId), [projectId, nativeKernelId]);
  const isLocal = placement.state === 'local';
  const key = `${isLocal ? 'local' : placement.deviceId}:${String(selectionRevision)}`;

  return useMemo(
    () => ({
      kernelOptionsFactory: isLocal ? localOptions : remoteKernelOptions,
      key,
      isLocal,
    }),
    [isLocal, key, localOptions],
  );
};
