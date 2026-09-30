/**
 * The machine directory as the printer viewer sees it.
 *
 * Reads this computer's machines facet, as the Print pane does, follows the
 * directory, and reduces it to the one entry the scene follows: an active run when there is
 * one, otherwise the project's selected machine for its light and filament. Live
 * mode follows the run only from the file it prints, which the print request
 * ledger names by digest.
 *
 * @module
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectorySnapshot,
  MachineManifest,
  PrintRequest,
} from '@taucad/runtime/machine';
import { convert } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { projectMachineDirectoryFrame, useMachinesFacet } from '#hooks/use-machines.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { startedRunIdOf, useMachinesPrintRequests } from '#hooks/use-machines-print-requests.js';
import type { LiveRunPosition } from '#components/printer/printer-playback.js';

/** What the viewer follows on a machine. */
export type PrinterLiveState = Readonly<{
  machineId: string;
  machineName: string;
  runState: NonNullable<MachineDirectoryEntry['snapshot']['run']>['state'] | undefined;
  /** A run is printing or paused. */
  isActive: boolean;
  /** The active run prints the viewer's file, byte for byte, so Live mode can follow it. */
  printsThisFile: boolean;
  position: LiveRunPosition;
  chamberLight: 'on' | 'off' | 'unknown';
  /** Degrees Celsius. */
  nozzleTarget: number | undefined;
  /** Degrees Celsius. */
  bedTarget: number | undefined;
  /** `#RRGGBB` of the first loaded material, when the machine reports one. */
  filamentColor: string | undefined;
  /** The followed machine's provider manifest, which the scene draws; absent until the providers load. */
  manifest: MachineManifest | undefined;
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

/**
 * Reduce directory entries to the machine the viewer follows.
 *
 * @param entries - The machine directory, when it has loaded.
 * @param manifests - Provider manifests by provider id, when they have loaded.
 * @param selection - The selected printer and the viewer's file facts, once known.
 * @returns The selected machine's identity and current facts; stale machines retain geometry but disable Live.
 */
export const selectPrinterLive = (
  entries: readonly MachineDirectoryEntry[] | undefined,
  manifests?: ReadonlyMap<string, MachineManifest>,
  selection?: Readonly<{ machineId?: string; file?: Readonly<{ digest: string; requests: readonly PrintRequest[] }> }>,
): PrinterLiveState | undefined => {
  const { machineId, file } = selection ?? {};
  const candidates = entries?.filter((entry) => isFollowable(entry)) ?? [];
  const entry =
    machineId === undefined
      ? (candidates.find((candidate) => activeRunStates.has(candidate.snapshot.run?.state ?? '')) ?? candidates[0])
      : entries?.find((candidate) => candidate.machineId === machineId);
  if (!entry) {
    return undefined;
  }
  const { run, temperatures, lights, setup, activeRunId } = entry.snapshot;
  const isCurrent = isFollowable(entry);
  const isActive = isCurrent && activeRunStates.has(run?.state ?? '');
  // The request whose start receipt names the active run says which bytes it prints.
  const printsThisFile =
    isActive && activeRunId !== undefined && file !== undefined
      ? file.requests.some(
          (request) => request.artifact.digest === file.digest && startedRunIdOf(request) === activeRunId,
        )
      : false;
  return {
    machineId: entry.machineId,
    machineName: entry.name,
    runState: isCurrent ? run?.state : undefined,
    isActive,
    printsThisFile,
    position: { currentLayer: run?.currentLayer, totalLayers: run?.totalLayers, progress: run?.progress },
    chamberLight: isCurrent ? (lights?.chamber ?? 'unknown') : 'unknown',
    nozzleTarget: isCurrent ? celsius(temperatures?.nozzleTarget) : undefined,
    bedTarget: isCurrent ? celsius(temperatures?.bedTarget) : undefined,
    filamentColor: setup.materials.find((material) => material.state === 'loaded' && material.color)?.color,
    manifest: manifests?.get(entry.providerId),
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
            snapshot: projectMachineDirectoryFrame(current?.client === client ? current.snapshot : initial, frame),
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

/**
 * Provider manifests by provider id, listed once per client.
 *
 * @param client - The negotiated machines client, when there is one.
 * @returns The manifests, or `undefined` until they load or without a client.
 */
export const useProviderManifests = (
  client: MachineClient | undefined,
): ReadonlyMap<string, MachineManifest> | undefined => {
  // Keyed by client for the same reason as the directory: a replaced client never shows stale manifests.
  const [state, setState] =
    useState<Readonly<{ client: MachineClient; manifests: ReadonlyMap<string, MachineManifest> }>>();
  useEffect(() => {
    if (!client) {
      return undefined;
    }
    const abort = new AbortController();
    const load = async (): Promise<void> => {
      try {
        const providers = await client.listProviders({ signal: abort.signal });
        if (!abort.signal.aborted) {
          setState({ client, manifests: new Map(providers.map((provider) => [provider.id, provider.manifest])) });
        }
      } catch {
        // Without manifests the scene keeps drawing the reference printer.
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the request.
    void load();
    return () => {
      abort.abort();
    };
  }, [client]);
  return state !== undefined && state.client === client ? state.manifests : undefined;
};

/**
 * The machine the printer viewer follows, or `undefined` without machines.
 *
 * @param digest - The `sha256:` digest of the file the viewer shows, once it is read.
 * @returns The followed machine's live facts.
 */
export const usePrinterLive = (digest: string | undefined): PrinterLiveState | undefined => {
  const { projectId } = useProject();
  const machines = useMachinesFacet();
  const client = machines.available ? machines : undefined;
  const entries = useMachineDirectoryEntries(client);
  const manifests = useProviderManifests(client);
  const { selected } = useMachinesSelection(projectId, entries ?? []);
  const machineId = selected?.machineId;
  const followed = useMemo(() => selectPrinterLive(entries, manifests, { machineId }), [entries, manifests, machineId]);
  const { requests } = useMachinesPrintRequests(client, followed?.isActive ? followed.machineId : undefined);
  return useMemo(
    () =>
      digest === undefined
        ? followed
        : selectPrinterLive(entries, manifests, { machineId, file: { digest, requests } }),
    [digest, entries, followed, manifests, requests, machineId],
  );
};
