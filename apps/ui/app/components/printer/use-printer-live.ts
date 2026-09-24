/**
 * The machine directory as the printer viewer sees it.
 *
 * Reads the negotiated machines facet the way the Print pane does (main
 * geometry unit → kernel client → `machines`), follows the directory, and
 * reduces it to the one entry the scene follows: an active run when there is
 * one, otherwise the first connected machine for its light and filament.
 *
 * @module
 */

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
} from '@taucad/runtime/machine';
import { convert } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { useProject } from '#hooks/use-project.js';
import type { LiveRunPosition } from '#components/printer/printer-playback.js';

/** What the viewer follows on a machine. */
export type PrinterLiveState = Readonly<{
  machineName: string;
  runState: NonNullable<MachineDirectoryEntry['snapshot']['run']>['state'] | undefined;
  /** A run is printing or paused, so Live mode can follow it. */
  isActive: boolean;
  position: LiveRunPosition;
  chamberLight: 'on' | 'off' | 'unknown';
  /** Degrees Celsius. */
  nozzleTarget: number | undefined;
  /** Degrees Celsius. */
  bedTarget: number | undefined;
  /** `#RRGGBB` of the first loaded material, when the machine reports one. */
  filamentColor: string | undefined;
}>;

const activeRunStates = new Set(['printing', 'paused']);

const celsius = (quantity: Quantity | undefined): number | undefined => {
  if (!quantity) {
    return undefined;
  }
  const result = convert({ quantity, to: 'Cel' });
  return result.status === 'success' && typeof result.value.value === 'number' ? result.value.value : undefined;
};

const isFollowable = (entry: MachineDirectoryEntry): boolean =>
  entry.freshness === 'current' && entry.snapshot.connection === 'connected';

/** Reduce directory entries to the machine the viewer follows. */
export const selectPrinterLive = (
  entries: readonly MachineDirectoryEntry[] | undefined,
): PrinterLiveState | undefined => {
  const candidates = entries?.filter((entry) => isFollowable(entry)) ?? [];
  const entry =
    candidates.find((candidate) => activeRunStates.has(candidate.snapshot.run?.state ?? '')) ?? candidates[0];
  if (!entry) {
    return undefined;
  }
  const { run, temperatures, lights, setup } = entry.snapshot;
  return {
    machineName: entry.descriptor.name,
    runState: run?.state,
    isActive: activeRunStates.has(run?.state ?? ''),
    position: { currentLayer: run?.currentLayer, totalLayers: run?.totalLayers, progress: run?.progress },
    chamberLight: lights?.chamber ?? 'unknown',
    nozzleTarget: celsius(temperatures?.nozzleTarget),
    bedTarget: celsius(temperatures?.bedTarget),
    filamentColor: setup.materials.find((material) => material.state === 'loaded' && material.color)?.color,
  };
};

// ponytail: the same frame reduction the Print pane applies; fold into its shared machines hook once that lands.
const applyFrame = (current: MachineDirectorySnapshot, frame: MachineDirectoryFrame): MachineDirectorySnapshot => {
  if (frame.type === 'snapshot' || frame.type === 'resync-required') {
    return frame.snapshot;
  }
  const { event } = frame;
  if (event.type === 'machine-directory-stale') {
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.map((entry) => ({ ...entry, freshness: 'stale' })),
    };
  }
  if (event.type === 'machine-directory-removed') {
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.filter(({ machineId }) => machineId !== event.machineId),
    };
  }
  return {
    ...current,
    cursor: frame.cursor,
    entries: [event.entry, ...current.entries.filter(({ machineId }) => machineId !== event.entry.machineId)],
  };
};

/** Follow one machine client's directory. */
export const useMachineDirectoryEntries = (
  client: MachineClient | undefined,
): readonly MachineDirectoryEntry[] | undefined => {
  // Keyed by client so a replaced client never shows the previous directory while its own loads.
  const [state, setState] = useState<Readonly<{ client: MachineClient; snapshot: MachineDirectorySnapshot }>>();
  useEffect(() => {
    if (!client) {
      return undefined;
    }
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        const initial = await client.list({ signal: abort.signal });
        if (abort.signal.aborted) {
          return;
        }
        setState({ client, snapshot: initial });
        for await (const frame of client.watch({ cursor: initial.cursor, signal: abort.signal })) {
          setState((current) => ({
            client,
            snapshot: applyFrame(current?.client === client ? current.snapshot : initial, frame),
          }));
        }
      } catch {
        // The viewer only decorates the simulation; a lost directory leaves it in file mode.
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the observation loop.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client]);
  return state !== undefined && state.client === client ? state.snapshot.entries : undefined;
};

/** The machine the printer viewer follows, or `undefined` outside a project or without machines. */
export const usePrinterLive = (): PrinterLiveState | undefined => {
  const project = useProject({ enableNoContext: true });
  const unit = project?.geometryUnits.get(project.mainEntryPath);
  const machines = useSelector(unit, (state) => state?.context.kernelClient?.machines);
  const client = machines?.available ? machines : undefined;
  const entries = useMachineDirectoryEntries(client);
  return useMemo(() => selectPrinterLive(entries), [entries]);
};
