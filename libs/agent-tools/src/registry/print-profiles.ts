import type { JsonObject } from '@taucad/agent-host';
import type { RequestPrintInput } from '@taucad/chat';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import type { MachineDirectoryEntry, MachineObservedMaterial, MachineProvider } from '@taucad/runtime/machine';
import { printIntentPath, readPrintIntent } from '@taucad/slicer';
import type { PrintIntent } from '@taucad/slicer';
import {
  bambuPlates,
  describeBambuStudioSettings,
  findBambuStudio,
  loadBambuStudioCatalog,
  resolveBambuStudioSelection,
} from '@taucad/slicer/bambu-studio';
import type { BambuMachineHints, BambuPresetSummary, BambuStudioSelection } from '@taucad/slicer/bambu-studio';
import { getErrno } from '@taucad/utils/error';

/**
 * The Bambu Studio functions the print tools use. `@taucad/slicer/bambu-studio`
 * resolves to the real engine under Node (desktop services utility, `tau
 * serve`) and to a stub that finds nothing in a browser, so the default needs
 * no host wiring; tests pass a fake.
 *
 * @public
 */
export type BambuStudioEngine = Readonly<{
  findBambuStudio: typeof findBambuStudio;
  loadBambuStudioCatalog: typeof loadBambuStudioCatalog;
  describeBambuStudioSettings: typeof describeBambuStudioSettings;
}>;

/** The engine `@taucad/slicer/bambu-studio` resolves to in this host. @internal */
export const defaultBambuStudioEngine: BambuStudioEngine = {
  findBambuStudio,
  loadBambuStudioCatalog,
  describeBambuStudioSettings,
};

/** Both Bambu providers, the printer and its simulator, declare this vendor. */
const bambuVendor = 'Bambu Lab';

/**
 * Whether Bambu Studio can slice for this provider's machines.
 *
 * @param provider - The provider that manufactured the machine's descriptor.
 * @returns True for the Bambu printer and its simulator.
 * @internal
 */
export const isBambuProvider = (provider: MachineProvider): boolean => provider.vendor === bambuVendor;

/**
 * The material a single-material print uses: the first loaded slot.
 *
 * @param machine - The machine as observed.
 * @returns That slot, when one is loaded with a known material.
 * @internal
 */
export const loadedMaterial = (machine: MachineDirectoryEntry): MachineObservedMaterial | undefined =>
  machine.snapshot.setup.materials.find((material) => material.state === 'loaded' && material.materialId !== undefined);

/**
 * What the printer reports, as Bambu Studio's preset defaults read it.
 *
 * @param provider - The machine's provider; its manifest names the nozzle.
 * @param machine - The machine as observed.
 * @param choices - The quality preset and the plate the print is for, when known.
 * @returns Hints naming the model, nozzle, plate and the loaded material's filament id.
 * @internal
 */
export const bambuHints = (
  provider: MachineProvider,
  machine: MachineDirectoryEntry,
  choices: Readonly<{ preset?: BambuMachineHints['preset']; plate?: string }> = {},
): BambuMachineHints => {
  const material = loadedMaterial(machine);
  const plate = bambuPlates.find(({ id }) => id === choices.plate)?.id;
  return {
    model: machine.descriptor.model,
    nozzleDiameter: provider.manifest.toolhead.nozzles[0]!.diameter.value,
    ...(choices.preset === undefined ? {} : { preset: choices.preset }),
    ...(plate === undefined ? {} : { plate }),
    materials:
      material === undefined
        ? []
        : [
            {
              slot: material.slot,
              ...(material.materialId === undefined ? {} : { materialId: material.materialId }),
              ...(material.profileId === undefined ? {} : { profileId: material.profileId }),
            },
          ],
  };
};

/** The same record without its undefined fields, so it reads as JSON. */
const defined = (record: Readonly<Record<string, unknown>>): JsonObject =>
  // SAFETY: every field left is a JSON value taken from a JSON Schema leaf, the preset values or a validated print intent.
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as JsonObject;

/** The project's print intent file as one call read it. @internal */
export type PrintIntentFile = ReturnType<typeof readPrintIntent>;

/** The slicing choices a call makes itself: `request_print`'s own arguments. @internal */
export type PrintChoices = Readonly<
  Pick<RequestPrintInput, 'preset' | 'plate' | 'profiles'> & {
    options?: JsonObject | undefined;
    settings?: JsonObject | undefined;
  }
>;

const textEncoder = new TextEncoder();
/** The reader's own cap, so a larger file is refused without being read. */
const maximumPrintIntentBytes = 65_536;

/**
 * Read the project's print intent through the agent's own view of the
 * project, the same view the agent edits the file through.
 *
 * @param fileSystem - The agent's project filesystem.
 * @param signal - Cancels the call; an abort is rethrown, never read as no file.
 * @returns The file as read, where one that cannot be read counts as invalid,
 *   or undefined when the project has none.
 * @internal
 */
export const readProjectPrintIntent = async (
  fileSystem: RpcFileSystem,
  signal: AbortSignal,
): Promise<PrintIntentFile | undefined> => {
  try {
    const stat = await fileSystem.stat(printIntentPath);
    if (stat.isDirectory || stat.size > maximumPrintIntentBytes) {
      return { status: 'invalid-preserved' };
    }
    return readPrintIntent(textEncoder.encode(await fileSystem.readFile(printIntentPath)));
  } catch (error) {
    signal.throwIfAborted();
    return getErrno(error) === 'ENOENT' ? undefined : { status: 'invalid-preserved' };
  }
};

/** The file's entries a call does not set itself, or undefined when there are none. */
const unsetEntries = (
  fromFile: Readonly<Record<string, unknown>> | undefined,
  own: Readonly<Record<string, unknown>> | undefined,
): JsonObject | undefined => {
  const kept = Object.entries(fromFile ?? {}).filter(([key]) => own?.[key] === undefined);
  // SAFETY: the entries come from a print intent the strict schema validated, so every value is JSON.
  return kept.length === 0 ? undefined : (Object.fromEntries(kept) as JsonObject);
};

/**
 * The file's options under the call's own, for the reference engine.
 *
 * @param intent - The project's print intent.
 * @param choices - What the call chose itself.
 * @returns The file's values used, and the choices they change.
 */
const referenceIntent = (intent: PrintIntent, choices: PrintChoices) => {
  const options = unsetEntries(intent.options, choices.options);
  return {
    supplied: { options },
    merged: options === undefined ? {} : { options: { ...options, ...choices.options } },
  };
};

/**
 * The file's filament for the slot a print uses, the first loaded one.
 *
 * @param intent - The project's print intent.
 * @param machine - The machine as observed.
 * @returns The slot's key in the file and the preset it names, when it names one.
 */
const slotFilament = (
  intent: PrintIntent,
  machine: MachineDirectoryEntry,
): Readonly<{ key: string; name: string }> | undefined => {
  const slot = loadedMaterial(machine)?.slot;
  const name = slot === undefined ? undefined : intent.filaments?.[String(slot)];
  return name === undefined ? undefined : { key: String(slot), name };
};

/**
 * The file's presets, the loaded slot's filament and its settings under the
 * call's own, for Bambu Studio.
 *
 * @param intent - The project's print intent.
 * @param choices - What the call chose itself.
 * @param machine - The machine as observed; its first loaded slot is the one a print uses.
 * @returns The file's values used, and the choices they change.
 */
const bambuIntent = (intent: PrintIntent, choices: PrintChoices, machine: MachineDirectoryEntry) => {
  const own = choices.profiles ?? {};
  /* Presets are picked for one printer: a call naming another keeps none of
   * the file's process or filaments, as the Print pane clears them. */
  const samePrinter = own.printer === undefined || own.printer === intent.printer;
  const filament = samePrinter && own.filaments === undefined ? slotFilament(intent, machine) : undefined;
  const supplied = {
    printer: own.printer === undefined ? intent.printer : undefined,
    process: samePrinter && own.process === undefined ? intent.process : undefined,
    filaments: filament === undefined ? undefined : { [filament.key]: filament.name },
    settings: unsetEntries(intent.settings, choices.settings),
  };
  const printer = own.printer ?? supplied.printer;
  const process = own.process ?? supplied.process;
  const filaments = own.filaments ?? (filament === undefined ? undefined : [filament.name]);
  return {
    supplied,
    merged: {
      profiles: {
        ...(printer === undefined ? {} : { printer }),
        ...(process === undefined ? {} : { process }),
        ...(filaments === undefined ? {} : { filaments }),
      },
      ...(supplied.settings === undefined ? {} : { settings: { ...supplied.settings, ...choices.settings } }),
    },
  };
};

/**
 * A call's own choices over the project's print intent.
 *
 * Precedence is the parameters rule: resolved defaults, then the file, then
 * the call. The file applies only to the model it names, and only with the
 * values the slicing engine reads: the quality preset and plate for either
 * engine, presets, the loaded slot's filament and settings for Bambu Studio,
 * options for the reference engine. A plate the printer reports wins over the
 * file as it does over the call.
 *
 * @param file - The file as read, or undefined when the project has none.
 * @param target - The machine, its provider, and whether Bambu Studio slices for it.
 * @param choices - What the call chose itself.
 * @returns The choices to slice with and, when the project has the file, what
 *   it contributed, for the tool result.
 * @internal
 */
export const applyPrintIntent = (
  file: PrintIntentFile | undefined,
  target: Readonly<{ provider: MachineProvider; machine: MachineDirectoryEntry; bambuStudio: boolean }>,
  choices: PrintChoices,
): Readonly<{ choices: PrintChoices; printIntent?: JsonObject }> => {
  if (file === undefined) {
    return { choices };
  }
  const ignore = (reason: string) => ({ choices, printIntent: { path: printIntentPath, ignored: reason } });
  if (file.status !== 'current') {
    return ignore(
      'It is not a valid print intent (broken JSON, an unknown key or a bad value), so none of its values apply.',
    );
  }
  const { intent } = file;
  const { model } = target.provider.manifest.identity;
  if (intent.model !== model) {
    return ignore(`It is for model ${intent.model}, not this printer's ${model}, so none of its values apply.`);
  }
  const { machine, bambuStudio } = target;
  /* What the file supplies either engine: each value the call leaves unset. */
  const preset = choices.preset === undefined ? intent.preset : undefined;
  const plate = choices.plate === undefined && machine.snapshot.setup.bedType === undefined ? intent.plate : undefined;
  const { supplied, merged } = bambuStudio ? bambuIntent(intent, choices, machine) : referenceIntent(intent, choices);
  return {
    choices: { ...choices, ...merged, preset: choices.preset ?? preset, plate: choices.plate ?? plate },
    printIntent: { path: printIntentPath, applied: defined({ preset, plate, ...supplied }) },
  };
};

/**
 * One sentence for a failure the project's print intent may have caused, so
 * the agent can edit the file or pass its own values instead.
 *
 * @param printIntent - What the file contributed to the call, when it did.
 * @returns The sentence, with a leading space, or '' when the file supplied nothing.
 * @internal
 */
export const printIntentHint = (printIntent: JsonObject | undefined): string => {
  const applied = Object.keys(printIntent?.['applied'] ?? {});
  return applied.length === 0
    ? ''
    : ` The project's ${printIntentPath} supplied ${applied.join(', ')}; edit it there, or pass your own.`;
};

/** One preset as an agent chooses it: its name and the facts that tell presets apart. */
const presetEntry = ({ name, source, layerHeight, filamentId, filamentType }: BambuPresetSummary): JsonObject => ({
  name,
  /* System presets are the norm; only the person's own are marked. */
  ...(source === 'user' ? { source } : {}),
  ...(layerHeight === undefined ? {} : { layerHeight }),
  ...(filamentType === undefined ? {} : { filamentType }),
  ...(filamentId === undefined ? {} : { filamentId }),
});

type Leaf = Readonly<{
  type?: unknown;
  items?: Readonly<{ type?: unknown; oneOf?: ReadonlyArray<Readonly<{ const?: unknown; title?: string }>> }>;
  oneOf?: ReadonlyArray<Readonly<{ const?: unknown; title?: string }>>;
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  'x-tau-unit'?: string;
}>;
type Node = Readonly<{ properties?: Readonly<Record<string, Node & Leaf>> }>;

/**
 * The settings of a selection, compact: values by group, choices by key, and
 * full descriptors only for the keys asked about.
 *
 * @param described - Schema and values from `describeBambuStudioSettings`.
 * @param keys - Keys to describe in full.
 * @returns The `settings`, `choices` and, when asked, `details` and `unknownKeys` fields.
 */
const compactSettings = (
  described: Awaited<ReturnType<BambuStudioEngine['describeBambuStudioSettings']>>,
  keys: readonly string[],
): JsonObject => {
  const wanted = new Set(keys);
  const settings: Record<string, JsonObject> = {};
  const choices: Record<string, string[]> = {};
  const details: Record<string, JsonObject> = {};
  // SAFETY: `buildBambuSettingsSchema` nests values and schema leaves alike as scope → group → key.
  const values = described.values as Readonly<Record<string, Readonly<Record<string, JsonObject>>>>;
  const scopes = (described.schema as Node).properties ?? {};
  for (const [scope, scopeNode] of Object.entries(scopes)) {
    for (const [group, groupNode] of Object.entries(scopeNode.properties ?? {})) {
      const groupValues = values[scope]?.[group] ?? {};
      settings[group] = groupValues;
      for (const [key, leaf] of Object.entries(groupNode.properties ?? {})) {
        const options = (leaf.oneOf ?? leaf.items?.oneOf)?.filter((choice) => typeof choice.const === 'string');
        if (options !== undefined) {
          choices[key] = options.map((choice) => String(choice.const));
        }
        if (wanted.has(key)) {
          details[key] = defined({
            scope,
            group,
            title: leaf.title,
            description: leaf.description,
            type: leaf.type === 'array' ? { list: leaf.items?.type } : leaf.type,
            unit: leaf['x-tau-unit'],
            minimum: leaf.minimum,
            maximum: leaf.maximum,
            choices: options?.map((choice) => ({ value: choice.const, title: choice.title })),
            value: groupValues[key],
          });
        }
      }
    }
  }
  const unknownKeys = keys.filter((key) => details[key] === undefined);
  return {
    settings,
    choices,
    ...(keys.length === 0 ? {} : { details }),
    ...(unknownKeys.length === 0 ? {} : { unknownKeys }),
  };
};

/**
 * `get_print_profiles`: what Bambu Studio would slice with for this machine,
 * and everything an agent may change.
 *
 * ponytail: lists are what Bambu Studio offers one printer model and nozzle
 * (about 100 filaments and 400 settings, 24 KB on an X1C); page them if a catalog
 * outgrows a tool result.
 *
 * @param engine - Bambu Studio in this host.
 * @param input - The machine and its provider, presets to read instead of
 *   the defaults, keys to describe in full, and the project's print intent
 *   file as read.
 * @returns The profiles, or the reference engine and why; with the file, what
 *   it contributed.
 * @internal
 */
export const describePrintProfiles = async (
  engine: BambuStudioEngine,
  input: Readonly<{
    provider: MachineProvider;
    machine: MachineDirectoryEntry;
    profiles?: PrintChoices['profiles'];
    keys?: readonly string[] | undefined;
    intentFile?: PrintIntentFile | undefined;
  }>,
): Promise<JsonObject> => {
  const { provider, machine, intentFile } = input;
  const { machineId } = machine;
  const { name } = machine.descriptor;
  const reference = (reason: string): JsonObject => {
    const { printIntent } = applyPrintIntent(intentFile, { provider, machine, bambuStudio: false }, {});
    return { machineId, engine: 'reference', reason, ...(printIntent === undefined ? {} : { printIntent }) };
  };
  if (!isBambuProvider(provider)) {
    return reference(
      `${name} is not a Bambu printer: request_print slices it with Tau's reference engine, tuned through options.`,
    );
  }
  const install = await engine.findBambuStudio();
  if (install === undefined) {
    return reference(
      "Bambu Studio is not available on this host, so request_print slices with Tau's reference engine. A real Bambu printer refuses those prints: it needs the Tau desktop app with Bambu Studio installed. The Bambu simulator accepts them.",
    );
  }
  const { choices, printIntent } = applyPrintIntent(
    intentFile,
    { provider, machine, bambuStudio: true },
    { profiles: input.profiles },
  );
  /* A plate the printer does not report is the person's to confirm, never a
   * default; only the project's own print intent may name one. */
  const hints = bambuHints(provider, machine, {
    preset: choices.preset,
    plate: machine.snapshot.setup.bedType ?? choices.plate,
  });
  const catalog = await engine.loadBambuStudioCatalog(install, {
    model: hints.model,
    ...(hints.nozzleDiameter === undefined ? {} : { nozzleDiameter: hints.nozzleDiameter }),
  });
  let selection: BambuStudioSelection;
  try {
    selection = resolveBambuStudioSelection(catalog, hints, choices.profiles);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${printIntentHint(printIntent)}`, {
      cause: error,
    });
  }
  const { printer, process, filaments, plate } = selection;
  const described = await engine.describeBambuStudioSettings(install, { printer, process, filaments });
  return {
    machineId,
    engine: 'bambu-studio',
    version: install.version,
    defaults: { printer, process, filaments, ...(hints.plate === undefined ? {} : { plate }) },
    ...(printIntent === undefined ? {} : { printIntent }),
    printers: catalog.printers.map((preset) => presetEntry(preset)),
    processes: catalog.processes.map((preset) => presetEntry(preset)),
    filaments: catalog.filaments.map((preset) => presetEntry(preset)),
    plates: catalog.plates.map(({ id }) => id),
    ...compactSettings(described, input.keys ?? []),
  };
};
