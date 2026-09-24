import { useCallback, useEffect, useState } from 'react';
import { useSelector } from '@xstate/react';
import type {
  MachineClient,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineProvider,
} from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { useProject } from '#hooks/use-project.js';

/**
 * Reduce one admitted directory frame without introducing a second machine state authority.
 *
 * @param current - The projection before the frame.
 * @param frame - One frame from `MachineClient.watch`.
 * @returns The projection after the frame.
 * @public
 */
export const projectMachineDirectoryFrame = (
  current: MachineDirectorySnapshot,
  frame: MachineDirectoryFrame,
): MachineDirectorySnapshot => {
  if (frame.type === 'snapshot' || frame.type === 'resync-required') {
    return frame.snapshot;
  }
  if (frame.event.type === 'machine-directory-stale') {
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.map((entry) => ({ ...entry, freshness: 'stale' })),
    };
  }
  if (frame.event.type === 'machine-directory-removed') {
    const { machineId } = frame.event;
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.filter((entry) => entry.machineId !== machineId),
    };
  }
  const { entry } = frame.event;
  return {
    ...current,
    cursor: frame.cursor,
    entries: [entry, ...current.entries.filter(({ machineId }) => machineId !== entry.machineId)],
  };
};

/** What the Print pane reads from the workspace machine directory. @public */
export type MachineDirectoryView = Readonly<{
  snapshot: MachineDirectorySnapshot | undefined;
  providers: readonly MachineProvider[];
  error: string | undefined;
  refresh: () => void;
}>;

/**
 * Subscribe to the workspace machine directory and the admitted providers.
 *
 * The host journal is the only authority: the initial list seeds the
 * projection and every later frame folds into it through
 * {@link projectMachineDirectoryFrame}. Unmount aborts the watch.
 *
 * @param client - The negotiated machines facet.
 * @returns The live directory projection.
 * @public
 */
export const useMachineDirectory = (client: MachineClient): MachineDirectoryView => {
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<MachineDirectorySnapshot>();
  const [providers, setProviders] = useState<readonly MachineProvider[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        setError(undefined);
        const [initial, availableProviders] = await Promise.all([
          client.list({ signal: abort.signal }),
          client.listProviders({ signal: abort.signal }),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        setSnapshot(initial);
        setProviders(availableProviders);
        for await (const frame of client.watch({ cursor: initial.cursor, signal: abort.signal })) {
          setSnapshot((current) => projectMachineDirectoryFrame(current ?? initial, frame));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the observation loop.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client, generation]);

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  return { snapshot, providers, error, refresh };
};

const unavailableFacet: RuntimeTransportFacet<MachineClient> = { available: false, reason: 'unsupported' };

/**
 * The machines facet the main geometry unit's runtime negotiated.
 *
 * @returns The facet, or an `unsupported` refusal while no runtime is connected.
 * @public
 */
export const useMachinesFacet = (): RuntimeTransportFacet<MachineClient> => {
  const { geometryUnits, mainEntryPath } = useProject();
  const machines = useSelector(geometryUnits.get(mainEntryPath), (state) => state?.context.kernelClient?.machines);
  return machines ?? unavailableFacet;
};
