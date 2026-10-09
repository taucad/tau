import type { HostToolResult, JsonObject } from '@taucad/agent-host';
import { exportModelOutputSchema } from '@taucad/chat';
import type { KernelIssue } from '@taucad/runtime';
import { fffProcessOf } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineProgramSummary,
  MachineProvider,
  MachineRequestJobInput,
} from '@taucad/runtime/machine';
import { bambuPlates, resolveBambuStudioSelection } from '@taucad/slicer/bambu-studio';
import type { BambuStudioInstallation } from '@taucad/slicer/bambu-studio';
import { slicedFilamentColors, readBambuContainer, readBambuContainerProducer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';

import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
import {
  applyMachinePreferences,
  bambuHints,
  defaultBambuStudioEngine,
  externalSpoolSlotOf,
  isBambuProvider,
  loadedMaterial,
  machinePreferencesHint,
  nozzleDiameterOf,
  observedPlate,
  observedTrays,
  withOnlyTray,
} from '#registry/print-profiles.js';
import type {
  BambuStudioEngine,
  ObservedTray,
  PrintChoices,
  ResolvedMachinePreferences,
} from '#registry/print-profiles.js';

/** The export target every print goes through (blueprint D3). */
const printFormat = 'gcode.3mf';

/** `#RRGGBB` from a colour as a file or a tray records it; the printer's carries an alpha byte. */
const opaqueColor = (color: string | undefined): string | undefined => {
  const hex = /^#?([\dA-F]{6})(?:[\dA-F]{2})?$/iu.exec(color ?? '')?.[1];
  return hex === undefined ? undefined : `#${hex.toUpperCase()}`;
};

/**
 * How far apart two `#RRGGBB` colours look: the "redmean" weighted RGB distance, close enough to
 * perception to pick a spool without a colour-space conversion.
 */
const colorDistance = (a: string | undefined, b: string | undefined): number | undefined => {
  if (a === undefined || b === undefined) {
    return undefined;
  }
  const [r1, g1, b1] = [1, 3, 5].map((at) => Number.parseInt(a.slice(at, at + 2), 16)) as [number, number, number];
  const [r2, g2, b2] = [1, 3, 5].map((at) => Number.parseInt(b.slice(at, at + 2), 16)) as [number, number, number];
  const redMean = (r1 + r2) / 2;
  return (2 + redMean / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - redMean) / 256) * (b1 - b2) ** 2;
};

/**
 * The slot each of a model's filaments prints from unless someone chooses: only loaded trays of
 * the print's material count, each once, the tray nearest the filament's colour first (an exact
 * colour is nearest), then the first free one in the machine's order. The planner expects these slots, and the Print pane's Prepare
 * step starts its filament rows from them.
 *
 * ponytail: "the print's material" is one material type, compared case-insensitively; families
 * that print together (PLA with PLA-CF) need a compatibility table.
 *
 * @param colors - The filaments' colours in filament order, as {@link slicedFilamentColors} reads them.
 * @param materials - The trays as the machine observes them.
 * @param materialId - The material the print is sliced for.
 * @returns One slot per filament; `undefined` for a filament no free tray can take.
 * @public
 */
export const defaultFilamentSlots = (
  colors: readonly string[],
  materials: ReadonlyArray<Pick<ObservedTray, 'slot' | 'state' | 'materialId' | 'color'>>,
  materialId: string,
): ReadonlyArray<number | undefined> => {
  const trays = materials.filter(
    (tray) => tray.state === 'loaded' && tray.materialId?.toLowerCase() === materialId.toLowerCase(),
  );
  const taken = new Set<number>();
  const slots: Array<number | undefined> = colors.map(() => undefined);
  // Closest pairs first, so an exact match is never taken by another filament's near one.
  const pairs = colors
    .flatMap((color, filament) =>
      trays.flatMap((tray) => {
        const distance = colorDistance(opaqueColor(color), opaqueColor(tray.color));
        return distance === undefined ? [] : [{ filament, slot: tray.slot, distance }];
      }),
    )
    .toSorted((a, b) => a.distance - b.distance);
  for (const { filament, slot } of pairs) {
    if (slots[filament] === undefined && !taken.has(slot)) {
      slots[filament] = slot;
      taken.add(slot);
    }
  }
  // A filament or tray without a colour takes the first free tray in the machine's order.
  return slots.map((slot) => {
    if (slot !== undefined) {
      return slot;
    }
    const free = trays.find((tray) => !taken.has(tray.slot));
    if (free !== undefined) {
      taken.add(free.slot);
    }
    return free?.slot;
  });
};

/** What {@link createMachinePrintPlanner} borrows from its host. @public */
export type MachinePrintPlannerDependencies = Readonly<{
  /**
   * The `tau.json` id of the project the agent works in. Every artifact
   * reference the planner builds names it, and the machine host reads the
   * slice from that project only. A host that cannot name its project passes
   * no print context at all, so nothing guesses one.
   */
  projectId: string;
  /** Supplies the provider manifest the expected setup is composed from. */
  machines: Pick<MachineClient, 'listProviders'>;
  /**
   * Decides whether Bambu Studio slices for a Bambu printer, and names the filament preset each
   * slot of a model with several colours prints with; defaults to this host's `@taucad/slicer/bambu-studio`.
   */
  bambuStudio?: Pick<BambuStudioEngine, 'findBambuStudio' | 'loadBambuStudioCatalog'> | undefined;
  /**
   * The registry's own `export_model` route, which also carries the slicer
   * options the model-facing tool cannot. Going through it records the slice
   * under `.tau/artifacts` exactly as a person's export is recorded.
   */
  exportModel(
    input: Readonly<{
      toolCallId: string;
      targetFile: string;
      to: typeof printFormat;
      /** The slicer options `request_job` admitted; the runtime validates them. */
      options?: JsonObject | undefined;
      signal: AbortSignal;
    }>,
  ): Promise<HostToolResult>;
  /** Read the exported bytes back from the project by their recorded path. */
  readArtifact(input: Readonly<{ path: string; signal: AbortSignal }>): Promise<Uint8Array<ArrayBuffer>>;
}>;

const exported = z.object({
  success: z.literal(true),
  files: z.array(z.object({ artifactPath: z.string().min(1), mimeType: z.string().min(1) })).min(1),
  /* What the slice could not honour although it was made, such as a model's colours printing as one. */
  warnings: exportModelOutputSchema.shape.warnings,
});
const failure = z.object({ message: z.string().min(1) });

/**
 * The FFF process of a machine that prints.
 * @param manifest - The machine's manifest.
 * @returns The process facts.
 * @throws When the machine is not a 3D printer.
 */
const fffOf = (manifest: MachineManifest) => {
  const fff = fffProcessOf(manifest);
  if (fff === undefined) {
    throw new Error(
      `${manifest.identity.displayName} is not a 3D printer, so Tau cannot slice a job for it; name a finished program with artifact instead.`,
    );
  }
  return fff;
};

/**
 * Slicer options the machine fixes rather than the print: its plate, nozzle,
 * filament and the manifest's recommended temperatures. Callers spread their
 * own options over these, so a person or agent can still set temperatures.
 *
 * ponytail: temperatures are the manifest's machine-wide recommendation (Bambu:
 * 250 °C / 70 °C, PETG on a smooth plate); per-material recommendations belong
 * in the manifest when a second material family is printed.
 *
 * @param manifest - The machine's manifest; quantities are in mm and °C.
 * @param plate - The manifest plate id installed.
 * @returns Slicer option values.
 * @throws When the machine has no FFF process.
 * @public
 */
export const machineSliceOptions = (manifest: MachineManifest, plate: string): JsonObject => {
  const fff = fffOf(manifest);
  const nozzleDiameter = nozzleDiameterOf(manifest);
  return {
    plate,
    ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }),
    filamentDiameter: fff.filamentDiameter.value,
    nozzleTemperature: fff.slicing.recommended.nozzleTemperature.value,
    bedTemperature: fff.slicing.recommended.bedTemperature.value,
  };
};

/**
 * The plate a print is for: what the machine reports, else what the agent
 * was told. A plate the machine does not report is carried as operator
 * confirmed; the person confirms it on the start card before anything is sent.
 *
 * @param manifest - The machine's manifest, whose plate ids are the vocabulary.
 * @param machine - The machine as observed.
 * @param requested - The plate the agent named, if any.
 * @returns The plate id and whether the machine observed it.
 * @throws When neither names a plate, or the named one is not the machine's.
 */
const resolvePlate = (
  manifest: MachineManifest,
  machine: MachineDirectoryEntry,
  requested: string | undefined,
): Readonly<{ id: string; observed: boolean }> => {
  const ids = fffOf(manifest).bed.plates.map(({ id }) => id);
  const observed = observedPlate(machine);
  if (observed !== undefined) {
    return { id: observed, observed: true };
  }
  if (requested === undefined || !ids.includes(requested)) {
    throw new Error(
      `${machine.name} does not report its build plate; ask the person which plate is installed, then pass plate as one of ${ids.join(', ')}.`,
    );
  }
  return { id: requested, observed: false };
};

/**
 * What this call chose of the start form: the plate the slice was made for (and that a person stated it, when the
 * machine does not report one), the slots the filaments print from, and the person's saved start choices. The
 * provider completes the rest (model, nozzle, materials) from what the machine reports when `checkJob` runs, and
 * preflight compares them again at approval, so a plate or spool swapped meanwhile refuses.
 *
 * ponytail: the keys are the Bambu submission's words for these choices, as the saved settings are Bambu's; a second
 * fff provider with its own start form names them through its own settings configuration.
 *
 * @param provider - The provider that manufactured the descriptor.
 * @param machine - The machine as the directory currently observes it.
 * @param choices - The requested plate and captured saved settings.
 * @returns The configuration for the slots each filament prints from, the plate it was sliced for and the loaded
 *   slot a one-filament print uses.
 * @throws When no material is loaded; there is nothing to print with then. When no plate is known.
 */
const chosenSetup = (
  provider: MachineProvider,
  machine: MachineDirectoryEntry,
  {
    requestedPlate,
    preferences,
  }: Readonly<{ requestedPlate: string | undefined; preferences: ResolvedMachinePreferences['machine'] | undefined }>,
): Readonly<{
  configure: (slots: readonly number[]) => MachineRequestJobInput['configuration'];
  plate: string;
  loaded: Readonly<{ slot: number; materialId: string }>;
}> => {
  const slot = preferences?.material?.defaultSlot;
  const tray =
    slot === undefined
      ? loadedMaterial(machine)
      : observedTrays(machine).find(
          (value) => value.slot === slot && value.state === 'loaded' && value.materialId !== undefined,
        );
  if (tray?.materialId === undefined) {
    throw new Error(`No material is loaded in ${machine.name}; load one, then ask again.`);
  }
  const plate = resolvePlate(provider.manifest, machine, requestedPlate);
  const configure = (slots: readonly number[]) => ({
    ...(preferences?.bedLeveling === undefined ? {} : { bedLeveling: preferences.bedLeveling }),
    ...(preferences?.flowCalibration === undefined ? {} : { flowCalibration: preferences.flowCalibration }),
    ...(preferences?.timelapse === undefined ? {} : { timelapse: preferences.timelapse }),
    expectedBedType: plate.id,
    ...(plate.observed ? {} : { operatorConfirmedBedType: plate.id }),
    amsMapping: [...slots],
  });
  return { configure, plate: plate.id, loaded: { slot: tray.slot, materialId: tray.materialId } };
};

/** The Bambu print-ready container, the one program format this host reads itself. */
const bambuContainerContract = 'manufacturing.toolpath.bambu-gcode-3mf';

/** Program readers by container contract; a contract without one is read by the machine host alone. */
const programReaders: Readonly<Record<string, (bytes: Uint8Array<ArrayBuffer>) => Partial<MachineProgramSummary>>> = {
  /* Its producer, layers, duration in milliseconds (the slicer's own estimate when its header carries one) and
   * filament. */
  [bambuContainerContract]: (bytes) => {
    const producer = readBambuContainerProducer(bytes);
    const program = parseGcode(readBambuContainer(bytes).gcode);
    return {
      ...(producer === undefined ? {} : { producer }),
      estimatedDuration: Math.round((program.headerEstimate?.seconds ?? program.duration) * 1000),
      facts: { process: 'fff', layers: program.layerTable.length, filamentLength: program.filamentLength },
    };
  },
};

/**
 * What the program is, for the approval prompt; the host's own parse wins where both exist.
 *
 * @param bytes - The program as the project holds it.
 * @param artifact - Its container contract and name.
 * @returns The facts its contract's reader found; none for a contract this host does not read. A program its reader
 *   cannot read is `other`, with a warning saying so, never silently.
 */
const summarize = (
  bytes: Uint8Array<ArrayBuffer>,
  artifact: Readonly<{ contract: MachineArtifactReference['contract']; name: string }>,
): Readonly<{ program: Partial<MachineProgramSummary>; warnings: readonly KernelIssue[] }> => {
  const read = programReaders[artifact.contract.id];
  if (read === undefined) {
    return { program: {}, warnings: [] };
  }
  try {
    return { program: read(bytes), warnings: [] };
  } catch (error) {
    return {
      program: { facts: { process: 'other' } },
      warnings: [
        {
          code: 'RUNTIME_CONTENT_UNSUPPORTED',
          severity: 'warning',
          message: `Tau could not read ${artifact.name} as ${artifact.contract.id} (${error instanceof Error ? error.message : String(error)}), so its layers and time are unknown; the machine checks it again before anything starts.`,
        },
      ],
    };
  }
};

/**
 * Program formats by file name, each with the media types that name it: a container's declared media type matches the
 * file's. ponytail: G-code is spelled two ways by providers today; add a row when a provider declares a new format.
 */
const programFormats: ReadonlyArray<Readonly<{ name: RegExp; mediaTypes: readonly string[] }>> = [
  { name: /\.gcode\.3mf$/iu, mediaTypes: ['application/vnd.bambulab.gcode-3mf'] },
  { name: /\.(?:gcode|nc|ngc|tap|cnc)$/iu, mediaTypes: ['text/x-gcode', 'text/x.gcode'] },
];

/**
 * The artifact reference a job names: the program's project path and digest, in the container the machine accepts.
 * The program's media type, stated by the slicer or read from its name, picks the container.
 *
 * @param deps - The project the program is in.
 * @param machine - The machine as observed; its `accepts` are what preflight checks.
 * @param file - The program's path, bytes and media type when known.
 * @returns The reference.
 * @throws When the machine takes no jobs, accepts no container of this format, or names no plate to run.
 */
const artifactReference = async (
  deps: Pick<MachinePrintPlannerDependencies, 'projectId'>,
  machine: MachineDirectoryEntry,
  file: Readonly<{ path: string; bytes: Uint8Array<ArrayBuffer>; mediaType?: string }>,
): Promise<MachineArtifactReference> => {
  const { jobs } = machine.descriptor.capabilities;
  const accepts = jobs.type === 'supported' ? jobs.accepts : [];
  if (accepts.length === 0) {
    throw new Error(`${machine.name} takes no jobs.`);
  }
  const { mediaType } = file;
  const mediaTypes =
    programFormats.find((format) =>
      mediaType === undefined ? format.name.test(file.path) : format.mediaTypes.includes(mediaType),
    )?.mediaTypes ?? (mediaType === undefined ? [] : [mediaType]);
  const accepted = accepts.find((container) => mediaTypes.includes(container.mediaType));
  if (accepted === undefined) {
    throw new Error(
      `${machine.name} accepts ${accepts.map(({ technology, mediaType: accepting }) => `${technology} (${accepting})`).join(', ')}; ${file.path} is not one of them.`,
    );
  }
  const selectedMember = accepted.payloadSelection === 'single' ? file.path : accepted.requiredMembers[0];
  if (selectedMember === undefined) {
    throw new Error(`${machine.name} names no plate to run in ${accepted.mediaType}.`);
  }
  // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
  const digest = `sha256:${await sha256Bytes(file.bytes)}` as MachineArtifactReference['digest'];
  return {
    projectId: deps.projectId,
    path: file.path,
    digest,
    length: file.bytes.byteLength,
    mediaType: accepted.mediaType,
    contract: accepted.contract,
    selectedMember,
  };
};

/**
 * A finished program run as is: read it from the project and name it for the machine.
 *
 * @param deps - The planner's host seams.
 * @param input - The call; its plate is the person's statement when the machine reports none.
 * @param path - The program's project path.
 * @returns The plan.
 */
const planProgram = async (
  deps: MachinePrintPlannerDependencies,
  input: PlanInput,
  path: string,
): ReturnType<MachinePrintPlanner> => {
  const { machine, signal } = input;
  const bytes = await deps.readArtifact({ path, signal });
  const name = path.split('/').at(-1) ?? path;
  const artifact = await artifactReference(deps, machine, { path, bytes });
  const { program, warnings } = summarize(bytes, { contract: artifact.contract, name });
  const stated = input.plate !== undefined && observedPlate(machine) === undefined ? input.plate : undefined;
  return {
    artifact,
    configuration: stated === undefined ? {} : { operatorConfirmedBedType: stated },
    program: { name, ...program },
    ...(warnings.length === 0 ? {} : { warnings }),
  };
};

/**
 * The export options for one print. A Bambu printer slices through Bambu
 * Studio when this host has it: its presets own temperatures and the rest, so
 * the machine's reference options stay out and the call's `options` refuse.
 * Anything else, or no Bambu Studio, slices with the reference engine exactly
 * as before; a real Bambu printer then refuses the file at preflight.
 *
 * @param provider - The machine's provider.
 * @param input - The choices to slice with, the project's selected profile
 *   already applied, and the machine with its plate resolved.
 * @param bambuStudio - Whether Bambu Studio slices for this machine on this host.
 * @returns Slicer options for the export route.
 * @throws When the call's slicer fields do not fit the engine that slices.
 */
const sliceOptions = (
  provider: MachineProvider,
  input: PrintChoices & Readonly<{ machine: MachineDirectoryEntry; plate: string }>,
  bambuStudio: boolean,
): JsonObject => {
  const { machine, options, profiles, settings, preset, plate } = input;
  if (!bambuStudio) {
    if (profiles !== undefined || settings !== undefined) {
      throw new Error(
        `Bambu Studio does not slice for ${machine.name} on this host, so profiles and settings do not apply; use options instead (get_print_profiles says why).`,
      );
    }
    /* The machine's own options first, then the call's keys, the preset from
     * its own field (the registry refuses one inside `options`). */
    return {
      ...machineSliceOptions(provider.manifest, plate),
      ...options,
      ...(preset === undefined ? {} : { preset }),
    };
  }
  if (options !== undefined && Object.keys(options).length > 0) {
    throw new Error(
      `Bambu Studio slices for ${machine.name}, so options do not apply; set Bambu Studio settings instead, with keys from get_print_profiles.`,
    );
  }
  const bambuPlate = bambuPlates.find(({ id }) => id === plate)?.id;
  if (bambuPlate === undefined) {
    throw new Error(
      `Bambu Studio has no build plate "${plate}"; ask the person which plate is installed, then pass plate as one of ${bambuPlates.map(({ id }) => id).join(', ')}.`,
    );
  }
  return {
    engine: 'bambu-studio',
    bambuStudio: {
      ...profiles,
      plate: bambuPlate,
      ...(settings === undefined ? {} : { settings }),
      hints: bambuHints(provider, machine, { preset, plate }),
    },
  };
};

type PlanInput = Parameters<MachinePrintPlanner>[0];

/** One slice through the export route, as the project recorded it, with what the export warned about it. */
type Slice = Readonly<{
  file: z.infer<typeof exported>['files'][number];
  bytes: Uint8Array<ArrayBuffer>;
  warnings: readonly KernelIssue[];
}>;

/**
 * Slice through the host's own export route and read the bytes back.
 *
 * @param deps - The planner's host seams.
 * @param input - The call; its tool call id names the artifact directory.
 * @param options - The CAD source to slice, the slicer options, and what the print intent contributed for a failure to name.
 * @returns The recorded file and its bytes.
 * @throws When the export fails or produces no artifact.
 */
const exportSlice = async (
  deps: MachinePrintPlannerDependencies,
  input: PlanInput,
  options: Readonly<{ targetFile: string; exportOptions: JsonObject; machinePreferences: JsonObject | undefined }>,
): Promise<Slice> => {
  const { targetFile } = options;
  const result = await deps.exportModel({
    toolCallId: input.toolCallId,
    targetFile,
    to: printFormat,
    options: options.exportOptions,
    signal: input.signal,
  });
  const success = result.isError ? undefined : exported.safeParse(result.content).data;
  const file = success?.files[0];
  if (file === undefined) {
    const reason = failure.safeParse(result.content).data?.message ?? 'no artifact was produced';
    throw new Error(`Slicing ${targetFile} failed: ${reason}${machinePreferencesHint(options.machinePreferences)}`);
  }
  const bytes = await deps.readArtifact({ path: file.artifactPath, signal: input.signal });
  return { file, bytes, warnings: success?.warnings ?? [] };
};

/** The printed filaments' colours; none when the bytes are no container, which preflight refuses anyway. */
const colorsOf = (bytes: Uint8Array<ArrayBuffer>): readonly string[] => {
  try {
    return slicedFilamentColors(readBambuContainer(bytes));
  } catch {
    return [];
  }
};

/**
 * Map a slice's filaments to loaded slots, in filament order.
 *
 * @param colors - The printed filaments' colours.
 * @param machine - The machine as observed.
 * @param print - The print's material, and the manifest's external spool, which cannot change filament mid-print
 *   and so feeds one-filament prints only.
 * @returns Each filament's slot, and the material the machine reports in it.
 * @throws When a filament has no free slot of the print's material, naming its colour.
 */
const mapFilaments = (
  colors: readonly string[],
  machine: MachineDirectoryEntry,
  print: Readonly<{
    materialId: string;
    externalSpoolSlot: number | undefined;
    slotsByColor?: Readonly<Record<string, number>>;
  }>,
): ReadonlyArray<Readonly<{ slot: number; materialId: string }>> => {
  const materials = observedTrays(machine);
  const selected = colors.map((color) => {
    const slot = print.slotsByColor?.[color.toLowerCase()];
    if (slot === undefined) {
      return undefined;
    }
    const material = materials.find(
      (value) => value.slot === slot && value.state === 'loaded' && value.materialId !== undefined,
    );
    if (!material?.materialId || slot === print.externalSpoolSlot) {
      throw new Error(`Saved material slot ${slot} is unavailable for this multi-filament print.`);
    }
    return { slot, materialId: material.materialId };
  });
  const reserved = selected.flatMap((value) => (value ? [value.slot] : []));
  if (new Set(reserved).size !== reserved.length) {
    throw new Error('Saved material mapping repeats a slot. Choose a distinct loaded slot for each filament.');
  }
  const missing = colors.filter((_color, index) => selected[index] === undefined);
  const trays = materials.filter((tray) => tray.slot !== print.externalSpoolSlot && !reserved.includes(tray.slot));
  const slots = defaultFilamentSlots(missing, trays, print.materialId);
  const unavailable = missing.filter((_color, index) => slots[index] === undefined);
  if (unavailable.length > 0) {
    const named = `${unavailable.length === 1 ? 'colour' : 'colours'} ${unavailable.join(' and ')}`;
    throw new Error(
      `No free ${print.materialId} slot in ${machine.name} for the model's ${named}; load one for each, then ask again.`,
    );
  }
  let fallbackIndex = 0;
  return selected.map((value) => {
    if (value) {
      return value;
    }
    const slot = slots[fallbackIndex++];
    if (slot === undefined) {
      throw new Error(`No free ${print.materialId} slot in ${machine.name}; load one, then ask again.`);
    }
    return {
      slot,
      materialId: materials.find((tray) => tray.slot === slot)?.materialId ?? print.materialId,
    };
  });
};

/**
 * What the print intent contributed, with its filaments replaced by those it
 * supplied to the model's filaments.
 *
 * @param machinePreferences - The report `applyMachinePreferences` made for a one-filament print.
 * @param supplied - The file's filament presets, by slot, that this print uses.
 * @returns The report; unchanged when the file was ignored or absent.
 */
const withSuppliedFilaments = (
  machinePreferences: JsonObject | undefined,
  supplied: Readonly<Record<string, string>>,
): JsonObject | undefined => {
  const applied = machinePreferences?.['applied'];
  if (machinePreferences === undefined || typeof applied !== 'object' || applied === null || Array.isArray(applied)) {
    return machinePreferences;
  }
  const rest = Object.fromEntries(Object.entries(applied).filter(([key]) => key !== 'filaments'));
  return {
    ...machinePreferences,
    applied: { ...rest, ...(Object.keys(supplied).length === 0 ? {} : { filaments: { ...supplied } }) },
  };
};

/**
 * The filament preset each filament's slot prints with, chosen exactly as a
 * one-filament print from that slot chooses it: the call's printer and
 * process, the project's print intent for that slot, else Bambu Studio's
 * default for the tray's filament id or type.
 *
 * @param engine - Loads Bambu Studio's presets.
 * @param install - This host's Bambu Studio.
 * @param context - The provider, the call, the plate, the print intent's
 *   report, the slot the first slice was made for and each filament's slot.
 * @returns The first slice's preset, each filament's, and the print intent's report for them.
 * @throws When a preset the file names for a slot is not Bambu Studio's, naming the file.
 */
const filamentPresets = async (
  engine: Pick<BambuStudioEngine, 'loadBambuStudioCatalog'>,
  install: BambuStudioInstallation,
  context: Readonly<{
    provider: MachineProvider;
    input: PlanInput;
    plate: string;
    machinePreferences: JsonObject | undefined;
    sliced: number;
    slots: readonly number[];
  }>,
): Promise<Readonly<{ sliced: string; filaments: readonly string[]; machinePreferences: JsonObject | undefined }>> => {
  const { provider, input, plate } = context;
  const { machine } = input;
  const fromSlot = (slot: number) => {
    /* The machine as a one-filament print from this slot sees it. */
    const view = withOnlyTray(machine, slot);
    const { choices } = applyMachinePreferences(
      input.preferences,
      { provider, machine: view, bambuStudio: true },
      input,
    );
    return { choices, hints: bambuHints(provider, view, { preset: choices.preset, plate }) };
  };
  const sliced = fromSlot(context.sliced);
  const perSlot = context.slots.map((slot) => ({ slot, ...fromSlot(slot) }));
  /* The call names no filaments here, so every one named is the file's. */
  const supplied = Object.fromEntries(
    perSlot.flatMap(({ slot, choices }) => {
      const name = choices.profiles?.filaments?.[0];
      return name === undefined ? [] : [[String(slot), name]];
    }),
  );
  const machinePreferences = withSuppliedFilaments(context.machinePreferences, supplied);
  const { printer } = sliced.choices.profiles ?? {};
  const { model, nozzleDiameter } = sliced.hints;
  const catalog = await engine.loadBambuStudioCatalog(
    install,
    printer === undefined ? { model, ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }) } : { printer },
  );
  const presetOf = ({ choices, hints }: ReturnType<typeof fromSlot>): string => {
    const [name] = resolveBambuStudioSelection(catalog, hints, choices.profiles).filaments;
    if (name === undefined) {
      throw new Error(`Bambu Studio has no filament preset for ${hints.materials[0]?.materialId ?? 'this slot'}.`);
    }
    return name;
  };
  try {
    return { sliced: presetOf(sliced), filaments: perSlot.map((slot) => presetOf(slot)), machinePreferences };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${machinePreferencesHint(machinePreferences)}`,
      {
        cause: error,
      },
    );
  }
};

/**
 * Build the planner `request_job` and `check_job` prepare jobs with.
 *
 * A finished `artifact` is read from the project and named in the container the
 * machine accepts. A `targetFile` is sliced: the planner refuses before slicing
 * when the request could never be accepted (no loaded material, no provider),
 * then exports through the host's own route, reads the bytes back for the digest
 * the machine host verifies, and names the artifact by this project, its path
 * and that digest. Either way it returns only what the call chose of the start
 * form; the provider completes the rest when the registry checks the job.
 *
 * A slice that prints several filaments expects one loaded slot per filament
 * ({@link defaultFilamentSlots}), and refuses when a filament has none. Each
 * filament prints with its slot's preset, so the model is sliced again when
 * one differs from the preset the first slice used for all of them.
 *
 * @param deps - The host seams the planner borrows.
 * @returns The planner to pass as `planPrint`.
 * @public
 */
export const createMachinePrintPlanner =
  (deps: MachinePrintPlannerDependencies): MachinePrintPlanner =>
  async (input) => {
    if (input.artifact !== undefined) {
      return planProgram(deps, input, input.artifact);
    }
    const { machine, signal, targetFile } = input;
    const providers = await deps.machines.listProviders({ signal });
    const provider = providers.find((candidate) => candidate.id === machine.providerId);
    if (provider === undefined) {
      throw new Error(`No provider ${machine.providerId} backs ${machine.name}.`);
    }
    const engine = deps.bambuStudio ?? defaultBambuStudioEngine;
    const install = isBambuProvider(provider) ? await engine.findBambuStudio() : undefined;
    const bambuStudio = install !== undefined;
    /* The call's own choices over the project's print intent, over the defaults. */
    const intent = applyMachinePreferences(input.preferences, { provider, machine, bambuStudio }, input);
    const { choices } = intent;
    const { configure, plate, loaded } = chosenSetup(provider, machine, {
      requestedPlate: choices.plate,
      preferences: input.preferences?.machine,
    });
    const slice = async (
      profiles: PrintChoices['profiles'],
      machinePreferences: JsonObject | undefined,
    ): Promise<Slice> =>
      exportSlice(deps, input, {
        targetFile,
        exportOptions: sliceOptions(provider, { ...choices, profiles, machine, plate }, bambuStudio),
        machinePreferences,
      });
    const first = await slice(choices.profiles, intent.machinePreferences);
    const colors = colorsOf(first.bytes);
    const filaments =
      colors.length > 1
        ? mapFilaments(colors, machine, {
            materialId: loaded.materialId,
            externalSpoolSlot: externalSpoolSlotOf(provider.manifest),
            slotsByColor: input.preferences?.machine.material?.slotsByColor,
          })
        : undefined;
    /* A call naming its own filaments keeps them, as it does for one filament. */
    const presets =
      filaments !== undefined && install !== undefined && input.profiles?.filaments === undefined
        ? await filamentPresets(engine, install, {
            provider,
            input,
            plate,
            machinePreferences: intent.machinePreferences,
            sliced: loaded.slot,
            slots: filaments.map(({ slot }) => slot),
          })
        : undefined;
    const machinePreferences = presets?.machinePreferences ?? intent.machinePreferences;
    const { file, bytes, warnings } =
      presets?.filaments.some((name) => name !== presets.sliced) === true
        ? await slice({ ...choices.profiles, filaments: [...presets.filaments] }, machinePreferences)
        : first;
    const name = file.artifactPath.split('/').at(-1) ?? file.artifactPath;
    /* Preflight checks the artifact against the descriptor's list, so choose from it. */
    const artifact = await artifactReference(deps, machine, {
      path: file.artifactPath,
      bytes,
      mediaType: file.mimeType,
    });
    const summary = summarize(bytes, { contract: artifact.contract, name });
    const allWarnings = [...warnings, ...summary.warnings];
    return {
      artifact,
      configuration: configure(filaments === undefined ? [loaded.slot] : filaments.map(({ slot }) => slot)),
      program: {
        name,
        ...summary.program,
        ...(input.preferences
          ? {
              preferences: {
                scope: 'project',
                typeId: provider.manifest.identity.typeId,
                profileId: input.preferences.profileId,
                configurationVersions: Object.fromEntries(
                  Object.entries(
                    input.preferences.record.profiles[input.preferences.profileId]?.configurations ?? {},
                  ).flatMap(([id, block]) => (block ? [[id, block.version]] : [])),
                ),
              },
            }
          : {}),
      },
      ...(machinePreferences === undefined ? {} : { machinePreferences }),
      ...(allWarnings.length === 0 ? {} : { warnings: allWarnings }),
    };
  };
