import type { JsonObject } from '@taucad/agent-host';
import type { RequestJobInput } from '@taucad/chat';
import type { MachineSettingsService, MachineSettingsRecord } from '@taucad/types';
import { readMachineConfiguration, machineSettingsPath } from '@taucad/runtime/machine/settings';
import type { SavedSettingsValues } from '@taucad/runtime/machine/settings';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { bambuSettingsConfiguration, bambuSlotOf } from '@taucad/bambu/settings';
import { componentValue } from '@taucad/runtime/machine';
import type {
  MachineComponent,
  MachineDirectoryEntry,
  MachineManifest,
  MachineProvider,
  MaterialSlotAddress,
} from '@taucad/runtime/machine';
import {
  bambuPlates,
  describeBambuStudioSettings,
  findBambuStudio,
  loadBambuStudioCatalog,
  resolveBambuStudioSelection,
} from '@taucad/slicer/bambu-studio';
import type { BambuMachineHints, BambuPresetSummary, BambuStudioSelection } from '@taucad/slicer/bambu-studio';

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
 * Whether the provider's start form and saved settings are Bambu's: the one settings source whose submission keys
 * (`amsMapping`, `expectedBedType`, ...) and tray numbers the planner writes. Any other provider receives only what
 * it declares and completes the rest itself (R5).
 *
 * @param provider - The machine's provider.
 * @returns True when its settings configuration is Bambu's.
 * @internal
 */
export const isBambuSettings = (provider: MachineProvider): boolean =>
  provider.settingsConfiguration?.source.id === bambuSettingsConfiguration.manifest.source.id;

/**
 * One material slot by its address, as any provider's material system reports it.
 * @internal
 */
export type ObservedSlot = Readonly<{
  address: MaterialSlotAddress;
  state: 'empty' | 'loaded' | 'unknown';
  /** The material type the slot reports, such as `PLA`. */
  materialId?: string;
  /** The vendor filament profile, such as `GFA00`. */
  profileId?: string;
  /** `#RRGGBBAA`. */
  color?: string;
}>;

type MaterialSystem = Extract<MachineComponent, { kind: 'material-system' }>;

/** Whether two addresses name the same slot. @internal */
export const sameSlot = (a: MaterialSlotAddress, b: MaterialSlotAddress | undefined): boolean =>
  a.unitId === b?.unitId && a.slotId === b.slotId;

/**
 * The machine's material slots by address.
 *
 * @param machine - The machine as observed.
 * @returns Every slot the material system reports, in its order; none when it reports nothing.
 * @internal
 */
export const observedSlots = (machine: MachineDirectoryEntry): readonly ObservedSlot[] => {
  const declared = machine.descriptor.capabilities.components.find(
    (component): component is MaterialSystem => component.kind === 'material-system',
  );
  const value = declared && componentValue(machine.snapshot.components, declared.id, 'material-system');
  if (!declared || !value) {
    return [];
  }
  return value.slots.map(({ slot, state, material }) => ({
    address: slot,
    state,
    ...(material === undefined
      ? {}
      : { materialId: material.materialType, profileId: material.preset.profileId, color: material.color }),
  }));
};

/**
 * The external spool's address, when the machine has one: it cannot change filament mid-print.
 * @param manifest - The machine's manifest.
 * @returns Its address, or undefined.
 * @internal
 */
export const externalSpoolOf = (manifest: Pick<MachineManifest, 'components'>): MaterialSlotAddress | undefined => {
  for (const component of manifest.components) {
    const unit =
      component.kind === 'material-system' ? component.units.find(({ kind }) => kind === 'external') : undefined;
    const slot = unit?.slots[0];
    if (unit !== undefined && slot !== undefined) {
      return { unitId: unit.id, slotId: slot.id };
    }
  }
  return undefined;
};

/**
 * The build plate the machine reports: a `plate` reading on any component.
 *
 * @param machine - The machine as observed.
 * @returns The manifest plate id, when reported.
 * @internal
 */
export const observedPlate = (machine: MachineDirectoryEntry): string | undefined => {
  for (const observation of machine.snapshot.components) {
    if (observation.knowledge === 'known' && observation.value.kind === 'readings') {
      const plate = observation.value.values.find(({ id }) => id === 'plate')?.value;
      if (typeof plate === 'string') {
        return plate;
      }
    }
  }
  return undefined;
};

/**
 * The first nozzle of the machine's toolhead.
 * @param manifest - The machine's manifest.
 * @returns Its diameter in millimetres, when the manifest declares a toolhead.
 * @internal
 */
export const nozzleDiameterOf = (manifest: Pick<MachineManifest, 'components'>): number | undefined => {
  const toolhead = manifest.components.find(
    (component): component is Extract<MachineComponent, { kind: 'toolhead' }> => component.kind === 'toolhead',
  );
  return toolhead?.nozzles[0]?.diameter.value;
};

/**
 * The machine as a print from one slot sees it: the material system reports that slot only.
 * @param machine - The machine as observed.
 * @param address - The slot.
 * @returns The same entry with the other slots left out.
 * @internal
 */
export const withOnlySlot = (machine: MachineDirectoryEntry, address: MaterialSlotAddress): MachineDirectoryEntry => ({
  ...machine,
  snapshot: {
    ...machine.snapshot,
    components: machine.snapshot.components.map((observation) =>
      observation.knowledge === 'known' && observation.value.kind === 'material-system'
        ? {
            ...observation,
            value: {
              ...observation.value,
              slots: observation.value.slots.filter(({ slot }) => sameSlot(slot, address)),
            },
          }
        : observation,
    ),
  },
});

/**
 * The material a single-material print uses: the first loaded slot.
 *
 * @param machine - The machine as observed.
 * @returns That slot, when one is loaded with a known material.
 * @internal
 */
export const loadedMaterial = (machine: MachineDirectoryEntry): ObservedSlot | undefined =>
  observedSlots(machine).find((material) => material.state === 'loaded' && material.materialId !== undefined);

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
  const tray = material === undefined ? undefined : bambuSlotOf(material.address);
  const plate = bambuPlates.find(({ id }) => id === choices.plate)?.id;
  const nozzleDiameter = nozzleDiameterOf(provider.manifest);
  return {
    model: machine.descriptor.model,
    ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }),
    ...(choices.preset === undefined ? {} : { preset: choices.preset }),
    ...(plate === undefined ? {} : { plate }),
    materials:
      material === undefined || tray === undefined
        ? []
        : [
            {
              slot: tray,
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
export type ResolvedMachinePreferences = Readonly<{
  status: 'current';
  preferences: SavedSettingsValues<typeof slicingPreferences.schema> &
    Pick<ReturnType<typeof bambuSettingsConfiguration.schema.parse>, 'plate'>;
  machine: ReturnType<typeof bambuSettingsConfiguration.schema.parse>;
  record: MachineSettingsRecord;
  profileId: string;
}>;
type PrintPreferences = ResolvedMachinePreferences['preferences'];

/** The slicing choices a call makes itself: `request_job`'s own arguments. @internal */
export type PrintChoices = Readonly<
  Pick<RequestJobInput, 'preset' | 'plate'> & {
    /** Bambu Studio presets: `request_job`'s `bambuStudio.profiles`. */
    profiles?: NonNullable<RequestJobInput['bambuStudio']>['profiles'];
    options?: JsonObject | undefined;
    settings?: JsonObject | undefined;
  }
>;

/**
 * Resolve the selected saved profile once through the root owner. Missing files use defaults; unreadable records
 * refuse preparation. Only slicing and the provider's own settings source are read: Bambu's settings apply to a
 * provider whose settings are Bambu's, and any other source in the profile is ignored, never refused.
 * @internal
 */
export const readProjectMachinePreferences = async (
  service: Pick<MachineSettingsService, 'readMachineSettings'>,
  provider: MachineProvider,
  { signal, profileId }: Readonly<{ signal: AbortSignal; profileId?: string }>,
): Promise<ResolvedMachinePreferences | undefined> => {
  signal.throwIfAborted();
  const { typeId } = provider.manifest.identity;
  const file = await service.readMachineSettings(typeId);
  signal.throwIfAborted();
  if (file.status === 'absent') {
    if (profileId !== undefined && profileId !== 'default') {
      throw new Error(`Saved profile ${profileId} does not exist for ${typeId}.`);
    }
    return undefined;
  }
  if (file.status !== 'current') {
    throw new Error(file.message);
  }
  const selected = profileId ?? file.record.activeProfile;
  const slicing = await readMachineConfiguration({
    settings: file.record,
    profileId: selected,
    definition: slicingPreferences,
    signal,
  });
  const machine = isBambuSettings(provider)
    ? await readMachineConfiguration({
        settings: file.record,
        profileId: selected,
        definition: bambuSettingsConfiguration,
        signal,
      })
    : ({ status: 'absent' } as const);
  if (slicing.status === 'refused') {
    throw new Error(slicing.message);
  }
  if (machine.status === 'refused') {
    throw new Error(machine.message);
  }
  const values = machine.status === 'current' ? machine.values : {};
  return {
    status: 'current',
    preferences: {
      ...(slicing.status === 'current' ? slicing.values : {}),
      ...(values.plate ? { plate: values.plate } : {}),
    },
    machine: values,
    record: file.record,
    profileId: selected,
  };
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
const referenceIntent = (intent: PrintPreferences, choices: PrintChoices) => {
  const options = unsetEntries(intent.options, choices.options);
  return {
    supplied: { options },
    merged: options === undefined ? {} : { options: { ...options, ...choices.options } },
  };
};

/**
 * The file's filament for the slot a print uses, the first loaded one; the file keys filaments by Bambu tray number.
 *
 * @param intent - The project's print intent.
 * @param machine - The machine as observed.
 * @returns The slot's key in the file and the preset it names, when it names one.
 */
const slotFilament = (
  intent: PrintPreferences,
  machine: MachineDirectoryEntry,
): Readonly<{ key: string; name: string }> | undefined => {
  const material = loadedMaterial(machine);
  const slot = material === undefined ? undefined : bambuSlotOf(material.address);
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
const bambuIntent = (intent: PrintPreferences, choices: PrintChoices, machine: MachineDirectoryEntry) => {
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
export const applyMachinePreferences = (
  file: ResolvedMachinePreferences | undefined,
  target: Readonly<{ provider: MachineProvider; machine: MachineDirectoryEntry; bambuStudio: boolean }>,
  choices: PrintChoices,
): Readonly<{ choices: PrintChoices; machinePreferences?: JsonObject }> => {
  if (file === undefined) {
    return { choices };
  }
  const intent = file.preferences;
  const profile = file.record.profiles[file.profileId];
  if (profile === undefined) {
    throw new Error(`Saved profile ${file.profileId} does not exist for ${file.record.typeId}.`);
  }
  const path = machineSettingsPath({ typeId: file.record.typeId });
  const { machine, bambuStudio } = target;
  /* What the file supplies either engine: each value the call leaves unset. */
  const preset = choices.preset === undefined ? intent.preset : undefined;
  const plate = choices.plate === undefined && observedPlate(machine) === undefined ? intent.plate : undefined;
  const { supplied, merged } = bambuStudio ? bambuIntent(intent, choices, machine) : referenceIntent(intent, choices);
  return {
    choices: { ...choices, ...merged, preset: choices.preset ?? preset, plate: choices.plate ?? plate },
    machinePreferences: {
      path,
      typeId: file.record.typeId,
      profileId: file.profileId,
      profileName: profile.name,
      configurationVersions: Object.fromEntries(
        Object.entries(profile.configurations).flatMap(([id, block]) => (block ? [[id, block.version]] : [])),
      ),
      applied: defined({ preset, plate, ...supplied }),
    },
  };
};

/**
 * One sentence for a failure the project's print intent may have caused, so
 * the agent can edit the file or pass its own values instead.
 *
 * @param machinePreferences - What the file contributed to the call, when it did.
 * @returns The sentence, with a leading space, or '' when the file supplied nothing.
 * @internal
 */
export const machinePreferencesHint = (machinePreferences: JsonObject | undefined): string => {
  const applied = Object.keys(machinePreferences?.['applied'] ?? {});
  return applied.length === 0
    ? ''
    : ` The project's ${typeof machinePreferences?.['path'] === 'string' ? machinePreferences['path'] : 'machine settings'} supplied ${applied.join(', ')}; edit it there, or pass your own.`;
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
    preferences?: ResolvedMachinePreferences | undefined;
  }>,
): Promise<JsonObject> => {
  const { provider, machine, preferences } = input;
  const { machineId } = machine;
  const { name } = machine;
  const availableProfiles: MachineSettingsRecord['profiles'] = preferences?.record.profiles ?? {
    default: { name: 'Default', configurations: {} },
  };
  const savedProfiles = {
    typeId: provider.manifest.identity.typeId,
    activeProfile: preferences?.record.activeProfile ?? 'default',
    selectedProfile: preferences?.profileId ?? 'default',
    profiles: Object.entries(availableProfiles).flatMap(([id, profile]) =>
      profile ? [{ id, name: profile.name }] : [],
    ),
  };
  const reference = (reason: string): JsonObject => {
    const { machinePreferences } = applyMachinePreferences(preferences, { provider, machine, bambuStudio: false }, {});
    return {
      machineId,
      savedProfiles,
      engine: 'reference',
      reason,
      ...(machinePreferences === undefined ? {} : { machinePreferences }),
    };
  };
  if (!isBambuProvider(provider)) {
    return reference(
      `${name} is not a Bambu printer: request_job slices it with Tau's reference engine, tuned through options.`,
    );
  }
  const install = await engine.findBambuStudio();
  if (install === undefined) {
    return reference(
      "Bambu Studio is not available on this host, so request_job slices with Tau's reference engine. A real Bambu printer refuses those prints: it needs the Tau desktop app with Bambu Studio installed. The Bambu simulator accepts them.",
    );
  }
  const { choices, machinePreferences } = applyMachinePreferences(
    preferences,
    { provider, machine, bambuStudio: true },
    { profiles: input.profiles },
  );
  /* A plate the printer does not report is the person's to confirm, never a
   * default; only the project's own print intent may name one. */
  const hints = bambuHints(provider, machine, {
    preset: choices.preset,
    plate: observedPlate(machine) ?? choices.plate,
  });
  const catalog = await engine.loadBambuStudioCatalog(install, {
    model: hints.model,
    ...(hints.nozzleDiameter === undefined ? {} : { nozzleDiameter: hints.nozzleDiameter }),
  });
  let selection: BambuStudioSelection;
  try {
    selection = resolveBambuStudioSelection(catalog, hints, choices.profiles);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${machinePreferencesHint(machinePreferences)}`,
      {
        cause: error,
      },
    );
  }
  const { printer, process, filaments, plate } = selection;
  const described = await engine.describeBambuStudioSettings(install, { printer, process, filaments });
  return {
    machineId,
    engine: 'bambu-studio',
    savedProfiles,
    version: install.version,
    defaults: { printer, process, filaments, ...(hints.plate === undefined ? {} : { plate }) },
    ...(machinePreferences === undefined ? {} : { machinePreferences }),
    printers: catalog.printers.map((preset) => presetEntry(preset)),
    processes: catalog.processes.map((preset) => presetEntry(preset)),
    filaments: catalog.filaments.map((preset) => presetEntry(preset)),
    plates: catalog.plates.map(({ id }) => id),
    ...compactSettings(described, input.keys ?? []),
  };
};
