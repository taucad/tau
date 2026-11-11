import { useMemo } from 'react';
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import {
  useRemoteComputePlacement,
  useRemoteComputeSelectionRevision,
} from '@taucad/ui-core/lib/remote-compute-placement';
import { useComputeReuseMode, useComputeReuseRevision } from '@taucad/ui-core/lib/compute-reuse-preference';
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
  const computeMode = useComputeReuseMode();
  const computeRevision = useComputeReuseRevision();
  const localOptions = useMemo(
    () => localKernelOptions(projectId, nativeKernelId, computeMode),
    [projectId, nativeKernelId, computeMode],
  );
  const isLocal = placement.state === 'local';
  const key = `${isLocal ? `local:${String(computeRevision)}` : placement.deviceId}:${String(selectionRevision)}`;

  return useMemo(
    () => ({
      kernelOptionsFactory: isLocal ? localOptions : remoteKernelOptions,
      key,
      isLocal,
    }),
    [isLocal, key, localOptions],
  );
};
