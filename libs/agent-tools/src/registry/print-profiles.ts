import type { JsonObject } from '@taucad/agent-host';
import type { MachineDirectoryEntry, MachineObservedMaterial, MachineProvider } from '@taucad/runtime/machine';
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

/** One preset as an agent chooses it: its name and the facts that tell presets apart. */
const presetEntry = ({ name, source, layerHeight, filamentId, filamentType }: BambuPresetSummary): JsonObject => ({
  name,
  /* System presets are the norm; only the person's own are marked. */
  ...(source === 'user' ? { source } : {}),
  ...(layerHeight === undefined ? {} : { layerHeight }),
  ...(filamentType === undefined ? {} : { filamentType }),
  ...(filamentId === undefined ? {} : { filamentId }),
});

/** The same record without its undefined fields, so it reads as JSON. */
const defined = (record: Readonly<Record<string, unknown>>): JsonObject =>
  // SAFETY: every field left is a JSON value taken from a JSON Schema leaf or the preset values.
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as JsonObject;

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
 *   the defaults, and keys to describe in full.
 * @returns The profiles, or the reference engine and why.
 * @internal
 */
export const describePrintProfiles = async (
  engine: BambuStudioEngine,
  input: Readonly<{
    provider: MachineProvider;
    machine: MachineDirectoryEntry;
    profiles?: Partial<Pick<BambuStudioSelection, 'printer' | 'process' | 'filaments'>> | undefined;
    keys?: readonly string[] | undefined;
  }>,
): Promise<JsonObject> => {
  const { provider, machine } = input;
  const { machineId } = machine;
  const { name } = machine.descriptor;
  if (!isBambuProvider(provider)) {
    return {
      machineId,
      engine: 'reference',
      reason: `${name} is not a Bambu printer: request_print slices it with Tau's reference engine, tuned through options.`,
    };
  }
  const install = await engine.findBambuStudio();
  if (install === undefined) {
    return {
      machineId,
      engine: 'reference',
      reason:
        "Bambu Studio is not available on this host, so request_print slices with Tau's reference engine. A real Bambu printer refuses those prints: it needs the Tau desktop app with Bambu Studio installed. The Bambu simulator accepts them.",
    };
  }
  const hints = bambuHints(provider, machine, { plate: machine.snapshot.setup.bedType });
  const catalog = await engine.loadBambuStudioCatalog(install, {
    model: hints.model,
    ...(hints.nozzleDiameter === undefined ? {} : { nozzleDiameter: hints.nozzleDiameter }),
  });
  const { printer, process, filaments, plate } = resolveBambuStudioSelection(catalog, hints, input.profiles);
  const described = await engine.describeBambuStudioSettings(install, { printer, process, filaments });
  return {
    machineId,
    engine: 'bambu-studio',
    version: install.version,
    /* A plate the printer does not report is the person's to confirm, never a default. */
    defaults: { printer, process, filaments, ...(hints.plate === undefined ? {} : { plate }) },
    printers: catalog.printers.map((preset) => presetEntry(preset)),
    processes: catalog.processes.map((preset) => presetEntry(preset)),
    filaments: catalog.filaments.map((preset) => presetEntry(preset)),
    plates: catalog.plates.map(({ id }) => id),
    ...compactSettings(described, input.keys ?? []),
  };
};
