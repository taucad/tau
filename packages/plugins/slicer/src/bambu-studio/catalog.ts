/**
 * Bambu Studio preset catalog: discovery and resolution of the person's installed presets.
 *
 * System presets come from the bundled `profiles/BBL` directory or the OTA
 * copy in Bambu Studio's data directory, whichever `BBL.json` is newer. User
 * presets come from every `user/<id>/{machine,process,filament}` directory.
 * A preset resolves as its `inherits` chain (recursively), then each
 * `include` in order, then its own keys; Bambu Studio's command line does
 * neither step itself. Presets are read as data at run time and never copied
 * into Tau.
 *
 * @module
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { BambuStudioError, bambuPlates } from '#bambu-studio/types.js';
import { matchesPrinterModel } from '#bambu-studio/selection.js';
import type {
  BambuPresetKind,
  BambuPresetSummary,
  BambuStudioCatalog,
  BambuStudioCatalogFilter,
  BambuStudioInstallation,
  BambuStudioSelection,
} from '#bambu-studio/types.js';

/** One preset file as Bambu Studio stores it. @internal */
export type BambuPresetValues = Record<string, unknown>;

type PresetMaps = Readonly<Record<BambuPresetKind, ReadonlyMap<string, BambuPresetValues>>>;

type VendorIndex = Readonly<
  Record<`${BambuPresetKind}_list`, ReadonlyArray<Readonly<{ name: string; sub_path: string }>>>
> &
  Readonly<{ version: string }>;

const kinds: readonly BambuPresetKind[] = ['machine', 'process', 'filament'];
const vendor = 'BBL';
const tolerance = 1e-6;

const readJson = async <T>(path: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const compareVersions = (a: string, b: string): number => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const systemCache = new Map<string, Promise<PresetMaps>>();

const emptyMaps = (): Record<BambuPresetKind, Map<string, BambuPresetValues>> => ({
  machine: new Map(),
  process: new Map(),
  filament: new Map(),
});

/** Preset files read at once; thousands at once would exhaust file descriptors. */
const readBatch = 64;

// Read every preset a vendor index lists, a bounded batch at a time.
const readSystemPresets = async (root: string, index: VendorIndex): Promise<PresetMaps> => {
  const maps = emptyMaps();
  const entries = kinds.flatMap((kind) => index[`${kind}_list`].map((entry) => ({ kind, ...entry })));
  for (let start = 0; start < entries.length; start += readBatch) {
    const batch = entries.slice(start, start + readBatch);
    // oxlint-disable-next-line no-await-in-loop -- one bounded batch at a time
    const values = await Promise.all(
      batch.map(async ({ sub_path: subPath }) => readJson<BambuPresetValues>(join(root, vendor, subPath))),
    );
    for (const [position, { kind, name }] of batch.entries()) {
      const preset = values[position];
      if (preset !== undefined) {
        maps[kind].set(name, preset);
      }
    }
  }
  return maps;
};

// System presets from the newer of the bundled and OTA vendor directories, cached per directory and version.
const loadSystemPresets = async (install: BambuStudioInstallation): Promise<PresetMaps> => {
  const roots = [join(install.resourcesDir, 'profiles'), ...(install.dataDir ? [join(install.dataDir, 'system')] : [])];
  let newest: { root: string; index: VendorIndex } | undefined;
  for (const root of roots) {
    // oxlint-disable-next-line no-await-in-loop -- two small index files
    const index = await readJson<VendorIndex>(join(root, `${vendor}.json`));
    if (
      index?.version !== undefined &&
      (newest === undefined || compareVersions(index.version, newest.index.version) > 0)
    ) {
      newest = { root, index };
    }
  }
  if (newest === undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_UNAVAILABLE',
      `Bambu Studio's printer presets were not found under ${install.resourcesDir}.`,
    );
  }
  const key = `${newest.root}\u0000${newest.index.version}`;
  const { root, index } = newest;
  let cached = systemCache.get(key);
  if (cached === undefined) {
    const load = async (): Promise<PresetMaps> => {
      try {
        return await readSystemPresets(root, index);
      } catch (error) {
        systemCache.delete(key);
        throw error;
      }
    };
    cached = load();
    systemCache.set(key, cached);
  }
  return cached;
};

// User presets from every account directory, read fresh on each call so edits in Bambu Studio show up.
const loadUserPresets = async (dataDirectory: string | undefined): Promise<PresetMaps> => {
  const maps = emptyMaps();
  if (dataDirectory === undefined) {
    return maps;
  }
  const accounts = await readdir(join(dataDirectory, 'user'), { withFileTypes: true }).catch(() => []);
  for (const account of accounts
    .filter((entry) => entry.isDirectory())
    .toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
    for (const kind of kinds) {
      const directory = join(dataDirectory, 'user', account.name, kind);
      // oxlint-disable-next-line no-await-in-loop -- a handful of small directories
      const files = await readdir(directory).catch(() => []);
      for (const file of files.filter((name) => name.endsWith('.json')).toSorted()) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of small files
        const values = await readJson<BambuPresetValues>(join(directory, file));
        const name = typeof values?.['name'] === 'string' ? values['name'] : file.slice(0, -'.json'.length);
        if (values !== undefined && !maps[kind].has(name)) {
          maps[kind].set(name, values);
        }
      }
    }
  }
  return maps;
};

/** Installed presets with memoized resolution. @internal */
export type BambuPresetLibrary = Readonly<{
  system: PresetMaps;
  user: PresetMaps;
  /**
   * Resolve a preset: `inherits` chain, then `include` in order, then own keys.
   *
   * @throws BambuStudioError - `BAMBU_STUDIO_PRESET_NOT_FOUND` for a missing preset, parent or include.
   */
  resolve: (kind: BambuPresetKind, name: string) => BambuPresetValues;
}>;

/**
 * Open the installed presets.
 *
 * @internal
 * @param install - The Bambu Studio install.
 * @returns The preset library.
 */
export const openBambuPresets = async (install: BambuStudioInstallation): Promise<BambuPresetLibrary> => {
  const [system, user] = await Promise.all([loadSystemPresets(install), loadUserPresets(install.dataDir)]);
  const memo = new Map<string, BambuPresetValues>();
  const resolve = (kind: BambuPresetKind, name: string, trail: readonly string[] = []): BambuPresetValues => {
    const key = `${kind}\u0000${name}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }
    // System presets win a name clash, so a user preset never changes a system preset's parents.
    const own = system[kind].get(name) ?? user[kind].get(name);
    if (own === undefined || trail.includes(name)) {
      const via = trail.length === 0 ? '' : ` (needed by "${trail.at(-1)}")`;
      throw new BambuStudioError(
        'BAMBU_STUDIO_PRESET_NOT_FOUND',
        `Bambu Studio has no ${kind} preset "${name}"${via}.`,
      );
    }
    const next = [...trail, name];
    const resolved: BambuPresetValues = {};
    if (typeof own['inherits'] === 'string' && own['inherits'] !== '') {
      Object.assign(resolved, resolve(kind, own['inherits'], next));
    }
    for (const include of Array.isArray(own['include']) ? own['include'] : []) {
      if (typeof include === 'string') {
        Object.assign(resolved, resolve(kind, include, next));
      }
    }
    Object.assign(resolved, own);
    delete resolved['inherits'];
    delete resolved['include'];
    memo.set(key, resolved);
    return resolved;
  };
  return { system, user, resolve: (kind, name) => resolve(kind, name) };
};

const firstString = (value: unknown): string | undefined => {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first !== '' ? first : undefined;
};

const firstNumber = (value: unknown): number | undefined => {
  const text = firstString(value);
  const number = text === undefined ? Number.NaN : Number.parseFloat(text);
  return Number.isFinite(number) ? number : undefined;
};

// The system printer preset a printer preset descends from (itself for a system preset).
const systemAncestor = (library: BambuPresetLibrary, name: string): string | undefined => {
  let current: string | undefined = name;
  for (let depth = 0; current !== undefined && depth < 16; depth += 1) {
    if (library.system.machine.has(current)) {
      return current;
    }
    const inherits: unknown = library.user.machine.get(current)?.['inherits'];
    current = typeof inherits === 'string' ? inherits : undefined;
  }
  return undefined;
};

type SummaryContext = Readonly<{
  library: BambuPresetLibrary;
  userPrintersBySystem: ReadonlyMap<string, readonly string[]>;
}>;

const summarize = (
  { library, userPrintersBySystem }: SummaryContext,
  kind: BambuPresetKind,
  { source, name }: Readonly<{ source: 'system' | 'user'; name: string }>,
): BambuPresetSummary | undefined => {
  let values: BambuPresetValues;
  try {
    values = library.resolve(kind, name);
  } catch {
    // A preset whose parent is missing (for example a user preset for another vendor) is not selectable.
    return undefined;
  }
  const own = (source === 'system' ? library.system : library.user)[kind].get(name)!;
  const compatible = Array.isArray(values['compatible_printers'])
    ? values['compatible_printers'].filter((printer): printer is string => typeof printer === 'string')
    : [];
  const settingId = firstString(own['setting_id']);
  const summary: Record<string, unknown> = { name, kind, source, ...(settingId === undefined ? {} : { settingId }) };
  if (kind === 'machine') {
    summary['printerModel'] = firstString(values['printer_model']);
    summary['nozzleDiameter'] = firstNumber(values['nozzle_diameter']);
  } else {
    if (compatible.length > 0) {
      summary['compatiblePrinters'] = compatible.flatMap((printer) => [
        printer,
        ...(userPrintersBySystem.get(printer) ?? []),
      ]);
    }
    if (kind === 'process') {
      summary['layerHeight'] = firstNumber(values['layer_height']);
    } else {
      summary['filamentId'] = firstString(values['filament_id']);
      summary['filamentType'] = firstString(values['filament_type']);
    }
  }
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined)) as BambuPresetSummary;
};

/**
 * Load the presets Bambu Studio offers, optionally only those for one printer.
 *
 * Selectable presets are system presets marked `instantiation: "true"` and
 * every user preset. Printer presets match by `printer_model` and nozzle
 * diameter; process and filament presets by `compatible_printers`, which a
 * user preset inherits from its parent unless it declares its own. A user
 * printer preset is compatible wherever its system parent is.
 *
 * @public
 * @param install - The install from `findBambuStudio`.
 * @param filter - A printer preset name, or a model and nozzle diameter, to narrow the catalog to.
 * @returns Printer, process and filament presets and the plates.
 * @throws BambuStudioError - `BAMBU_STUDIO_UNAVAILABLE` when the install carries no Bambu presets.
 * @example <caption>Presets for an X1 Carbon with a 0.4 mm nozzle</caption>
 * ```typescript
 * import { findBambuStudio, loadBambuStudioCatalog } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * const catalog = install ? await loadBambuStudioCatalog(install, { model: 'X1C', nozzleDiameter: 0.4 }) : undefined;
 * ```
 */
export const loadBambuStudioCatalog = async (
  install: BambuStudioInstallation,
  filter: BambuStudioCatalogFilter = {},
): Promise<BambuStudioCatalog> => {
  const library = await openBambuPresets(install);
  const userPrintersBySystem = new Map<string, string[]>();
  for (const name of library.user.machine.keys()) {
    const ancestor = systemAncestor(library, name);
    if (ancestor !== undefined) {
      userPrintersBySystem.set(ancestor, [...(userPrintersBySystem.get(ancestor) ?? []), name]);
    }
  }
  const context = { library, userPrintersBySystem };
  const summaries = (kind: BambuPresetKind): BambuPresetSummary[] =>
    [
      ...[...library.system[kind]]
        .filter(([, values]) => values['instantiation'] === 'true')
        .map(([name]) => summarize(context, kind, { source: 'system', name })),
      ...[...library.user[kind].keys()].map((name) => summarize(context, kind, { source: 'user', name })),
    ].filter((summary) => summary !== undefined);
  const printers = summaries('machine').filter(
    (printer) =>
      (filter.printer === undefined || printer.name === filter.printer) &&
      (filter.model === undefined ||
        (printer.printerModel !== undefined && matchesPrinterModel(filter.model, printer.printerModel))) &&
      (filter.nozzleDiameter === undefined ||
        Math.abs((printer.nozzleDiameter ?? Number.NaN) - filter.nozzleDiameter) < tolerance),
  );
  const filtered = filter.printer !== undefined || filter.model !== undefined || filter.nozzleDiameter !== undefined;
  const names = new Set(printers.map(({ name }) => name));
  const compatible = (preset: BambuPresetSummary): boolean =>
    !filtered || preset.compatiblePrinters === undefined || preset.compatiblePrinters.some((name) => names.has(name));
  return {
    installation: install,
    printers,
    processes: summaries('process').filter((preset) => compatible(preset)),
    filaments: summaries('filament').filter((preset) => compatible(preset)),
    plates: bambuPlates,
  };
};

/**
 * Resolve every preset of a selection to flat Bambu Studio values.
 *
 * @internal
 * @param install - The Bambu Studio install.
 * @param selection - The presets to resolve.
 * @returns Resolved machine, process and filament values.
 */
export const resolveBambuSelectionPresets = async (
  install: BambuStudioInstallation,
  selection: Pick<BambuStudioSelection, 'printer' | 'process' | 'filaments'>,
): Promise<{ machine: BambuPresetValues; process: BambuPresetValues; filaments: BambuPresetValues[] }> => {
  const library = await openBambuPresets(install);
  return {
    machine: library.resolve('machine', selection.printer),
    process: library.resolve('process', selection.process),
    filaments: selection.filaments.map((name) => library.resolve('filament', name)),
  };
};
