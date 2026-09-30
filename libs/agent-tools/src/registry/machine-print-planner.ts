import type { HostToolResult, JsonObject } from '@taucad/agent-host';
import { exportModelOutputSchema } from '@taucad/chat';
import type { KernelIssue } from '@taucad/runtime';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineObservedMaterial,
  MachineProvider,
  PrintRequest,
  PrintRequestSummary,
} from '@taucad/runtime/machine';
import { bambuPlates, resolveBambuStudioSelection } from '@taucad/slicer/bambu-studio';
import type { BambuStudioInstallation } from '@taucad/slicer/bambu-studio';
import { bambuPlateMember, readBambuContainer, readBambuContainerProducer } from '@taucad/slicer/container';
import type { BambuContainer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';

import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
import {
  applyPrintIntent,
  bambuHints,
  defaultBambuStudioEngine,
  isBambuProvider,
  loadedMaterial,
  printIntentHint,
} from '#registry/print-profiles.js';
import type { BambuStudioEngine, PrintChoices } from '#registry/print-profiles.js';

/** The export target every print goes through (blueprint D3). */
const printFormat = 'gcode.3mf';

/** Bambu Studio's header names the filaments a plate prints, counted from 1: `; filament: 1,2`. */
const printedFilaments = /^;\s*filament:\s*(\d+(?:\s*,\s*\d+)*)\s*$/mu;
/** Bambu Studio writes that header first, so the reader looks no further. */
const headerBytes = 65_536;
const headerDecoder = new TextDecoder();

/**
 * The colours of the filaments a slice prints, in filament order: entry *i* is filament *i* + 1,
 * which the plate prints with `T<i>`. Bambu Studio records a colour for every filament preset it
 * loaded, and a one-part slice loads every preset it is given, so the list stops at the last
 * filament its header says the plate prints. The planner and the Print pane's slice summary read
 * a slice's filaments through it.
 *
 * @param container - The slice as `readBambuContainer` read it.
 * @returns `#RRGGBB` per printed filament; empty when the slice records no colour.
 * @public
 */
export const slicedFilamentColors = ({
  gcode,
  filamentColors,
}: Pick<BambuContainer, 'gcode' | 'filamentColors'>): readonly string[] => {
  const printed = printedFilaments.exec(headerDecoder.decode(gcode.subarray(0, headerBytes)))?.[1];
  if (printed === undefined) {
    return filamentColors;
  }
  let last = 0;
  for (const id of printed.split(',')) {
    last = Math.max(last, Number(id));
  }
  return filamentColors.slice(0, last);
};

/** `#RRGGBB` from a colour as a file or a tray records it; the printer's carries an alpha byte. */
const opaqueColor = (color: string | undefined): string | undefined => {
  const match = /^#?([\dA-F]{6})(?:[\dA-F]{2})?$/iu.exec(color ?? '');
  return match === null ? undefined : `#${match[1]!.toUpperCase()}`;
};

/**
 * The slot each of a model's filaments prints from unless someone chooses: only loaded trays of
 * the print's material count, each once, a tray of the filament's colour first, then the first
 * free one in the machine's order. The planner expects these slots, and the Print pane's Prepare
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
  materials: readonly MachineObservedMaterial[],
  materialId: string,
): ReadonlyArray<number | undefined> => {
  const trays = materials.filter(
    (tray) => tray.state === 'loaded' && tray.materialId?.toLowerCase() === materialId.toLowerCase(),
  );
  const taken = new Set<number>();
  const take = (isWanted: (tray: MachineObservedMaterial) => boolean): number | undefined => {
    const tray = trays.find((candidate) => !taken.has(candidate.slot) && isWanted(candidate));
    if (tray !== undefined) {
      taken.add(tray.slot);
    }
    return tray?.slot;
  };
  // Colour matches first, so no earlier filament's fallback takes a later filament's match.
  const matched = colors.map((color) => {
    const wanted = opaqueColor(color);
    return wanted === undefined ? undefined : take((tray) => opaqueColor(tray.color) === wanted);
  });
  return matched.map((slot) => slot ?? take(() => true));
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
      /** The slicer options `request_print` admitted; the runtime validates them. */
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
 * @public
 */
export const machineSliceOptions = (manifest: MachineManifest, plate: string): JsonObject => ({
  plate,
  nozzleDiameter: manifest.toolhead.nozzles[0]!.diameter.value,
  filamentDiameter: manifest.toolhead.filamentDiameter.value,
  nozzleTemperature: manifest.slicing.recommended.nozzleTemperature.value,
  bedTemperature: manifest.slicing.recommended.bedTemperature.value,
});

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
  const ids = manifest.bed.plates.map(({ id }) => id);
  const observed = machine.snapshot.setup.bedType;
  if (observed !== undefined) {
    return { id: observed, observed: true };
  }
  if (requested === undefined || !ids.includes(requested)) {
    throw new Error(
      `${machine.descriptor.name} does not report its build plate; ask the person which plate is installed, then pass plate as one of ${ids.join(', ')}.`,
    );
  }
  return { id: requested, observed: false };
};

/**
 * The setup the machine must still show when the print starts: what it
 * observes now, completed from the provider manifest. Preflight compares the
 * two again at approval time, so a plate or spool swapped meanwhile refuses.
 *
 * @param provider - The provider that manufactured the descriptor.
 * @param machine - The machine as the directory currently observes it.
 * @param requestedPlate - The plate the agent named, if any.
 * @returns The provider's submission configuration for the loaded slot a
 *   one-filament print uses, the same configuration for other filament
 *   slots, the plate it expects and that loaded slot.
 * @throws When no material is loaded; there is nothing to expect then. When no plate is known.
 */
const expectedSetup = (
  provider: MachineProvider,
  machine: MachineDirectoryEntry,
  requestedPlate: string | undefined,
): Readonly<{
  configuration: PrintRequest['configuration'];
  configure: (
    materials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>,
  ) => PrintRequest['configuration'];
  plate: string;
  loaded: Readonly<{ slot: number; materialId: string }>;
}> => {
  const tray = loadedMaterial(machine);
  if (tray?.materialId === undefined) {
    throw new Error(`No material is loaded in ${machine.descriptor.name}; load one, then ask again.`);
  }
  const loaded = { slot: tray.slot, materialId: tray.materialId };
  const plate = resolvePlate(provider.manifest, machine, requestedPlate);
  const { toolhead } = provider.manifest;
  // ponytail: named keys are the Bambu submission vocabulary; a second provider gets its own mapping here.
  /* One material per filament, in filament order; the mapping names each one's slot. */
  const configure = (materials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>) => ({
    expectedModel: machine.descriptor.model,
    expectedBedType: plate.id,
    ...(plate.observed ? {} : { operatorConfirmedBedType: plate.id }),
    expectedMaterials: materials,
    amsMapping: materials.map(({ slot }) => slot),
    expectedNozzleDiameter: toolhead.nozzles[0]!.diameter.value,
    expectedFilamentDiameter: toolhead.filamentDiameter.value,
  });
  return { configuration: configure([loaded]), configure, plate: plate.id, loaded };
};

/**
 * Advisory facts for the approval prompt.
 *
 * @param bytes - The container the slicer produced.
 * @returns Its producer, layers, seconds (the slicer's own estimate when its
 *   header carries one) and filament; no toolpath facts when the plate cannot
 *   be timed, since preflight refuses a container the machine cannot take anyway.
 */
const summarize = (bytes: Uint8Array<ArrayBuffer>): Omit<PrintRequestSummary, 'fileName'> | undefined => {
  const producer = readBambuContainerProducer(bytes);
  const made = producer === undefined ? undefined : { producer };
  try {
    const program = parseGcode(readBambuContainer(bytes).gcode);
    return {
      ...made,
      layers: program.layerTable.length,
      estimatedDuration: program.headerEstimate?.seconds ?? program.duration,
      filamentLength: program.filamentLength,
    };
  } catch {
    return made;
  }
};

/**
 * The export options for one print. A Bambu printer slices through Bambu
 * Studio when this host has it: its presets own temperatures and the rest, so
 * the machine's reference options stay out and the call's `options` refuse.
 * Anything else, or no Bambu Studio, slices with the reference engine exactly
 * as before; a real Bambu printer then refuses the file at preflight.
 *
 * @param provider - The machine's provider.
 * @param input - The choices to slice with, the project's print intent
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
        `Bambu Studio does not slice for ${machine.descriptor.name} on this host, so profiles and settings do not apply; use options instead (get_print_profiles says why).`,
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
      `Bambu Studio slices for ${machine.descriptor.name}, so options do not apply; set Bambu Studio settings instead, with keys from get_print_profiles.`,
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
 * @param options - The slicer options, and what the print intent contributed for a failure to name.
 * @returns The recorded file and its bytes.
 * @throws When the export fails or produces no artifact.
 */
const exportSlice = async (
  deps: MachinePrintPlannerDependencies,
  input: PlanInput,
  options: Readonly<{ exportOptions: JsonObject; printIntent: JsonObject | undefined }>,
): Promise<Slice> => {
  const result = await deps.exportModel({
    toolCallId: input.toolCallId,
    targetFile: input.targetFile,
    to: printFormat,
    options: options.exportOptions,
    signal: input.signal,
  });
  const success = result.isError ? undefined : exported.safeParse(result.content).data;
  const file = success?.files[0];
  if (file === undefined) {
    const reason = failure.safeParse(result.content).data?.message ?? 'no artifact was produced';
    throw new Error(`Slicing ${input.targetFile} failed: ${reason}${printIntentHint(options.printIntent)}`);
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
  print: Readonly<{ materialId: string; externalSpoolSlot: number | undefined }>,
): ReadonlyArray<Readonly<{ slot: number; materialId: string }>> => {
  const { materials } = machine.snapshot.setup;
  const trays = materials.filter((tray) => tray.slot !== print.externalSpoolSlot);
  const slots = defaultFilamentSlots(colors, trays, print.materialId);
  const missing = colors.filter((_color, index) => slots[index] === undefined);
  if (missing.length > 0) {
    const named = `${missing.length === 1 ? 'colour' : 'colours'} ${missing.join(' and ')}`;
    throw new Error(
      `No free ${print.materialId} slot in ${machine.descriptor.name} for the model's ${named}; load one for each, then ask again.`,
    );
  }
  return slots
    .filter((slot) => slot !== undefined)
    .map((slot) => ({
      slot,
      /* The tray's own spelling, which the machine compares. */
      materialId: materials.find((tray) => tray.slot === slot)?.materialId ?? print.materialId,
    }));
};

/**
 * What the print intent contributed, with its filaments replaced by those it
 * supplied to the model's filaments.
 *
 * @param printIntent - The report `applyPrintIntent` made for a one-filament print.
 * @param supplied - The file's filament presets, by slot, that this print uses.
 * @returns The report; unchanged when the file was ignored or absent.
 */
const withSuppliedFilaments = (
  printIntent: JsonObject | undefined,
  supplied: Readonly<Record<string, string>>,
): JsonObject | undefined => {
  const applied = printIntent?.['applied'];
  if (printIntent === undefined || typeof applied !== 'object' || applied === null || Array.isArray(applied)) {
    return printIntent;
  }
  const rest = Object.fromEntries(Object.entries(applied).filter(([key]) => key !== 'filaments'));
  return {
    ...printIntent,
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
    printIntent: JsonObject | undefined;
    sliced: number;
    slots: readonly number[];
  }>,
): Promise<Readonly<{ sliced: string; filaments: readonly string[]; printIntent: JsonObject | undefined }>> => {
  const { provider, input, plate } = context;
  const { machine } = input;
  const fromSlot = (slot: number) => {
    /* The machine as a one-filament print from this slot sees it. */
    const materials = machine.snapshot.setup.materials.filter((tray) => tray.slot === slot);
    const view = { ...machine, snapshot: { ...machine.snapshot, setup: { ...machine.snapshot.setup, materials } } };
    const { choices } = applyPrintIntent(input.intentFile, { provider, machine: view, bambuStudio: true }, input);
    return { choices, hints: bambuHints(provider, view, { preset: choices.preset, plate }) };
  };
  const sliced = fromSlot(context.sliced);
  const perSlot = context.slots.map((slot) => fromSlot(slot));
  /* The call names no filaments here, so every one named is the file's. */
  const supplied = Object.fromEntries(
    context.slots.flatMap((slot, index) => {
      const name = perSlot[index]!.choices.profiles?.filaments?.[0];
      return name === undefined ? [] : [[String(slot), name]];
    }),
  );
  const printIntent = withSuppliedFilaments(context.printIntent, supplied);
  const { printer } = sliced.choices.profiles ?? {};
  const { model, nozzleDiameter } = sliced.hints;
  const catalog = await engine.loadBambuStudioCatalog(
    install,
    printer === undefined ? { model, ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }) } : { printer },
  );
  const presetOf = ({ choices, hints }: ReturnType<typeof fromSlot>): string =>
    resolveBambuStudioSelection(catalog, hints, choices.profiles).filaments[0]!;
  try {
    return { sliced: presetOf(sliced), filaments: perSlot.map((slot) => presetOf(slot)), printIntent };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${printIntentHint(printIntent)}`, {
      cause: error,
    });
  }
};

/**
 * Build the planner `request_print` slices with.
 *
 * Refuses before slicing when the request could never be accepted (no loaded
 * material, no provider), then exports through the host's own route, reads the
 * bytes back for the digest the machine host verifies, and names the artifact
 * by this project, its path and that digest.
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
    const { machine, signal } = input;
    const providers = await deps.machines.listProviders({ signal });
    const provider = providers.find((candidate) => candidate.id === machine.providerId);
    if (provider === undefined) {
      throw new Error(`No provider ${machine.providerId} backs ${machine.descriptor.name}.`);
    }
    const engine = deps.bambuStudio ?? defaultBambuStudioEngine;
    const install = isBambuProvider(provider) ? await engine.findBambuStudio() : undefined;
    const bambuStudio = install !== undefined;
    /* The call's own choices over the project's print intent, over the defaults. */
    const intent = applyPrintIntent(input.intentFile, { provider, machine, bambuStudio }, input);
    const { choices } = intent;
    const { configuration: oneFilament, configure, plate, loaded } = expectedSetup(provider, machine, choices.plate);
    const slice = async (profiles: PrintChoices['profiles'], printIntent: JsonObject | undefined): Promise<Slice> =>
      exportSlice(deps, input, {
        exportOptions: sliceOptions(provider, { ...choices, profiles, machine, plate }, bambuStudio),
        printIntent,
      });
    const first = await slice(choices.profiles, intent.printIntent);
    const colors = colorsOf(first.bytes);
    const filaments =
      colors.length > 1
        ? mapFilaments(colors, machine, {
            materialId: loaded.materialId,
            externalSpoolSlot: provider.manifest.materialSystem.externalSpoolSlot,
          })
        : undefined;
    /* A call naming its own filaments keeps them, as it does for one filament. */
    const presets =
      filaments !== undefined && install !== undefined && input.profiles?.filaments === undefined
        ? await filamentPresets(engine, install, {
            provider,
            input,
            plate,
            printIntent: intent.printIntent,
            sliced: loaded.slot,
            slots: filaments.map(({ slot }) => slot),
          })
        : undefined;
    const printIntent = presets?.printIntent ?? intent.printIntent;
    const { file, bytes, warnings } =
      presets?.filaments.some((name) => name !== presets.sliced) === true
        ? await slice({ ...choices.profiles, filaments: [...presets.filaments] }, printIntent)
        : first;
    const configuration = filaments === undefined ? oneFilament : configure(filaments);
    // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
    const digest = `sha256:${await sha256Bytes(bytes)}` as MachineArtifactReference['digest'];
    /* Preflight checks the artifact against the descriptor's list, so choose from it. */
    const accepted =
      machine.descriptor.accepts.find((container) => container.mediaType === file.mimeType) ??
      machine.descriptor.accepts[0];
    if (accepted === undefined) {
      throw new Error(`${machine.descriptor.name} declares no accepted container.`);
    }
    return {
      artifact: {
        projectId: deps.projectId,
        path: file.artifactPath,
        digest,
        length: bytes.byteLength,
        mediaType: accepted.mediaType,
        contract: accepted.contract,
        selectedMember: accepted.requiredMembers[0] ?? bambuPlateMember,
      },
      configuration,
      summary: summarize(bytes),
      ...(printIntent === undefined ? {} : { printIntent }),
      ...(warnings.length === 0 ? {} : { warnings }),
    };
  };
