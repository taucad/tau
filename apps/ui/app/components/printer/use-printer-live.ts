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

import { useMemo } from 'react';
import { componentValue, fffProcessOf } from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineClient,
  MachineComponent,
  MachineDirectoryEntry,
  MachineJob,
  MachineManifest,
  MachineRun,
} from '@taucad/runtime/machine';
import { convert } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { startedRunIdOf, useMachinesJobs } from '#hooks/use-machines-jobs.js';
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
 * The heater under the bed: the one the FFF process names (`bed.heater`). A process that names none falls back to a 3D
 * printer's only heater; with several and none named, the scene shows no bed target rather than another heater's.
 */
const bedHeaterOf = (entry: MachineDirectoryEntry): MachineComponent | undefined => {
  const process = fffProcessOf(entry.descriptor.capabilities);
  if (process === undefined) {
    return undefined;
  }
  const heaters = entry.descriptor.capabilities.components.filter((component) => component.kind === 'heater');
  if (process.bed.heater !== undefined) {
    return heaters.find((component) => component.id === process.bed.heater);
  }
  return heaters.length === 1 ? heaters[0] : undefined;
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

/** Read the shared directory projection used by every machine surface. */
export const useMachineDirectoryEntries = (
  client: MachineClient | undefined,
): readonly MachineDirectoryEntry[] | undefined => useMachineDirectory(client).snapshot?.entries;

/** Provider manifests from the same shared observation owner. */
export const useProviderManifests = (
  client: MachineClient | undefined,
): ReadonlyMap<string, MachineManifest> | undefined => {
  const { snapshot, providers } = useMachineDirectory(client);
  const isLoaded = snapshot !== undefined;
  return useMemo(
    () => (isLoaded ? new Map(providers.map((provider) => [provider.id, provider.manifest])) : undefined),
    [isLoaded, providers],
  );
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
  const directory = useMachineDirectory(client);
  const entries = directory.snapshot?.entries;
  const manifests = useProviderManifests(client);
  const { selected } = useMachinesSelection(projectId, entries ?? [], directory.snapshot?.cursor.hostId);
  const machineId = selected?.machineId;
  const followed = useMemo(() => selectPrinterLive(entries, manifests, { machineId }), [entries, manifests, machineId]);
  const { jobs } = useMachinesJobs(
    client,
    followed?.isActive ? followed.machineId : undefined,
    directory.snapshot?.cursor.hostId,
  );
  return useMemo(
    () =>
      digest === undefined ? followed : selectPrinterLive(entries, manifests, { machineId, file: { digest, jobs } }),
    [digest, entries, followed, manifests, jobs, machineId],
  );
};
