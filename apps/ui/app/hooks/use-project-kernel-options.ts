import { useMemo } from 'react';
import {
  useRemoteComputePlacement,
  useRemoteComputeSelectionRevision,
} from '@taucad/ui-core/lib/remote-compute-placement';
import type { RemoteComputePlacement } from '@taucad/ui-core/lib/remote-compute-placement';
import { useComputeReuseMode, useComputeReuseRevision } from '@taucad/ui-core/lib/compute-reuse-preference';
import { selectProjectKernelSelection } from '#runtime/choices-kernel-selection.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

export type ProjectKernelSelection = {
  readonly kernelOptionsFactory: LazyKernelOptionsFactory;
  readonly key: string;
  readonly isLocal: boolean;
};

const localPlacement: RemoteComputePlacement = { state: 'local' };

/**
 * Select the current host placement for a standalone runtime (preview, CAD preview) that is keyed in React.
 *
 * A live project's session reads the same selection from `choices` and replaces its runtime with the session event
 * `replaceRuntime`. Both derive it with {@link selectProjectKernelSelection}, so the two can never disagree on when a
 * runtime must be rebuilt. The selection keeps its identity while only the remote connection's
 * phase moves, because the selection reads the device and not the phase.
 */
export const useProjectKernelOptions = ({
  projectId,
  nativeKernelId,
}: {
  readonly projectId: string;
  readonly nativeKernelId?: string;
}): ProjectKernelSelection => {
  const placement = useRemoteComputePlacement();
  const computeSelectionRevision = useRemoteComputeSelectionRevision();
  const computeReuseMode = useComputeReuseMode();
  const computeReuseRevision = useComputeReuseRevision();
  const deviceId = placement.state === 'local' ? undefined : placement.deviceId;

  return useMemo(
    () =>
      selectProjectKernelSelection(
        {
          computePlacement: deviceId === undefined ? localPlacement : { state: 'remote', deviceId },
          computeSelectionRevision,
          computeReuseMode,
          computeReuseRevision,
        },
        { projectId, ...(nativeKernelId === undefined ? {} : { nativeKernelId }) },
      ),
    [computeReuseMode, computeReuseRevision, computeSelectionRevision, deviceId, nativeKernelId, projectId],
  );
};
