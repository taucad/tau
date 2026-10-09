/**
 * The machine directory as the printer viewer sees it.
 *
 * Reads this computer's machines facet, as the Print pane does, follows the
 * directory, and reduces it to the one entry the scene follows: an active run when there is
 * one, otherwise the project's selected machine for its light and filament. Live
 * mode follows the run only from the file it prints, which the job ledger
 * names by digest.
 *
 * @module
 */

import { useEffect, useMemo, useState } from 'react';
import { componentValue, fffProcessOf } from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineClient,
  MachineComponent,
  MachineDirectoryEntry,
  MachineDirectorySnapshot,
  MachineJob,
  MachineManifest,
  MachineRun,
} from '@taucad/runtime/machine';
import { convert } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { projectMachineDirectoryFrame, useMachinesFacet } from '#hooks/use-machines.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { firstResync, longestResync, pause, startedRunIdOf, useMachinesJobs } from '#hooks/use-machines-jobs.js';
import { materialSystemValue, toolheadOf } from '#components/print/machine-facts.js';
import type { LiveRunPosition } from '#components/printer/printer-playback.js';

/** What the viewer follows on a machine. */
export type PrinterLiveState = Readonly<{
  machineId: string;
  machineName: string;
  runState: MachineRun['state'] | undefined;
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

const activeRunStates: ReadonlySet<string> = new Set<MachineRun['state']>(['running', 'paused']);

const celsius = (quantity: Quantity | number | undefined): number | undefined => {
  // A bare number carries no unit, so only a quantity is read as a temperature.
  if (quantity === undefined || typeof quantity === 'number') {
    return undefined;
  }
  const result = convert({ quantity, to: 'Cel' });
  return result.status === 'success' && typeof result.value.value === 'number' ? result.value.value : undefined;
};

/** The commanded temperature a component reports, in degrees Celsius. */
const targetOf = (
  components: readonly ComponentObservation[],
  component: MachineComponent | undefined,
): number | undefined =>
  component === undefined
    ? undefined
    : celsius(
        componentValue(components, component.id, 'readings')?.values.find(({ target }) => target !== undefined)?.target,
      );

/** Where the run stands: the layer counter when the machine counts layers, and the fraction done as a percentage. */
const positionOf = (run: MachineRun | undefined): LiveRunPosition => {
  const layer = run?.progress.counters.find(({ id }) => id === 'layer');
  const fraction = run?.progress.fraction;
  return {
    currentLayer: layer?.current,
    totalLayers: layer?.total,
    progress: fraction === undefined ? undefined : fraction * 100,
  };
};

/**
 * The heater under the bed. The contract names no bed heater, so a 3D printer's only heater is its bed; with several,
 * which one heats the bed is unknown, and the scene shows no bed target rather than another heater's.
 */
const bedHeaterOf = (entry: MachineDirectoryEntry): MachineComponent | undefined => {
  const heaters = entry.descriptor.capabilities.components.filter((component) => component.kind === 'heater');
  return fffProcessOf(entry.descriptor.capabilities) !== undefined && heaters.length === 1 ? heaters[0] : undefined;
};

/** The light and heater targets of a machine observed now. */
const currentFacts = (
  entry: MachineDirectoryEntry,
): Pick<PrinterLiveState, 'chamberLight' | 'nozzleTarget' | 'bedTarget'> => {
  const { components } = entry.snapshot;
  const installed = entry.descriptor.capabilities.components;
  const light = installed.find((component) => component.kind === 'light');
  const lightValue = light === undefined ? undefined : componentValue(components, light.id, 'switch');
  return {
    chamberLight: lightValue === undefined ? 'unknown' : lightValue.on ? 'on' : 'off',
    nozzleTarget: targetOf(components, toolheadOf({ components: installed })),
    bedTarget: targetOf(components, bedHeaterOf(entry)),
  };
};

/** The `#RRGGBB` of the first loaded slot; the slot reports `#RRGGBBAA` and the scene paints opaque colours. */
const loadedColor = (entry: MachineDirectoryEntry): string | undefined =>
  materialSystemValue(entry)
    ?.slots.find((slot) => slot.state === 'loaded' && slot.material)
    ?.material?.color.slice(0, 7);

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
  selection?: Readonly<{ machineId?: string; file?: Readonly<{ digest: string; jobs: readonly MachineJob[] }> }>,
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
  const { run } = entry.snapshot;
  const isCurrent = isFollowable(entry);
  const isActive = isCurrent && activeRunStates.has(run?.state ?? '');
  // The job whose start names the active run says which bytes it prints.
  const printsThisFile =
    isActive && run !== undefined && file !== undefined
      ? file.jobs.some((job) => job.artifact.digest === file.digest && startedRunIdOf(job) === run.runId)
      : false;
  return {
    machineId: entry.machineId,
    machineName: entry.name,
    runState: isCurrent ? run?.state : undefined,
    isActive,
    printsThisFile,
    position: positionOf(run),
    ...(isCurrent ? currentFacts(entry) : { chamberLight: 'unknown', nozzleTarget: undefined, bedTarget: undefined }),
    filamentColor: loadedColor(entry),
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
    const { signal } = abort;
    /* Read through a call: the abort lands while awaiting, which narrowing on the property cannot see. */
    const isAborted = (): boolean => signal.aborted;
    /* A watch that ends or fails means resync (R10): list again, then watch again, backing off as the jobs do. */
    const observe = async (): Promise<void> => {
      let wait = firstResync;
      while (!isAborted()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- each resync lists, then watches, in order; never in parallel.
          const initial = await client.list({ signal });
          if (isAborted()) {
            return;
          }
          setState({ client, snapshot: initial });
          // oxlint-disable-next-line no-await-in-loop -- the watch runs until it ends; the next resync follows it.
          for await (const frame of client.watch({ cursor: initial.cursor, signal })) {
            wait = firstResync;
            setState((current) => ({
              client,
              snapshot: projectMachineDirectoryFrame(current?.client === client ? current.snapshot : initial, frame),
            }));
          }
        } catch {
          // The viewer only decorates the simulation: until the resync lands, it keeps what it last saw or file mode.
        }
        // oxlint-disable-next-line no-await-in-loop -- the backoff between resyncs is the point of the loop.
        await pause(wait, signal);
        wait = Math.min(wait * 2, longestResync);
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
  const { jobs } = useMachinesJobs(client, followed?.isActive ? followed.machineId : undefined);
  return useMemo(
    () =>
      digest === undefined ? followed : selectPrinterLive(entries, manifests, { machineId, file: { digest, jobs } }),
    [digest, entries, followed, manifests, jobs, machineId],
  );
};
