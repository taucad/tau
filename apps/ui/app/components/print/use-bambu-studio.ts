/**
 * Bambu Studio mode of the Print pane (blueprint U2, D9, D12): which presets
 * Bambu Studio offers for the bound printer, the settings they resolve to, and
 * the project's print intent on top: the presets the person picked and the
 * settings they changed, saved in the active profile in `.tau/machines/settings/<typeId>.json`. Everything
 * Bambu Studio answers is read through the desktop bridge. Slicing itself stays
 * on the export route; this hook only states the export options it would slice with.
 *
 * @module
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MachineDirectoryEntry,
  MachineManifest,
  MachineProvider,
  MaterialSlotAddress,
} from '@taucad/runtime/machine';
import { bambuAddressOf, bambuSettingsConfiguration, bambuSlotOf } from '@taucad/bambu/settings';
import type {
  MachinePreferences,
  PrintPreferences,
  PrintPreferencesEdit,
} from '#components/print/use-machine-settings.js';
import type {
  BambuMachineHints,
  BambuPlate,
  BambuPresetSummary,
  BambuStudioCatalog,
  BambuStudioSelection,
  BambuStudioSettings,
} from '@taucad/slicer/bambu-studio';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { observedSlots, toolheadOf } from '#components/print/machine-facts.js';
import type { BambuTray } from '#components/print/bambu-studio-presets.js';

const bambuPlateIds: ReadonlySet<string> = new Set<BambuPlate['id']>([
  'cool',
  'engineering',
  'high-temperature',
  'textured-pei',
]);

/** Quality presets Bambu Studio's default process follows. @public */
export type BambuQualityPreset = NonNullable<BambuMachineHints['preset']>;

/**
 * Whether a provider drives a Bambu Lab printer, which slices with Bambu Studio when it is installed. The vendor
 * decides, never the provider id; whether the printer takes a file is its own job check.
 *
 * @param provider - The selected machine's provider.
 * @returns True for any provider declaring the vendor.
 * @public
 */
export const isBambuProvider = (provider: MachineProvider | undefined): boolean => provider?.vendor === 'Bambu Lab';

/** Bambu's saved print preferences: the start flags, the plate, and the slot each colour prints from. @public */
export type BambuPreferences = ReturnType<typeof bambuSettingsConfiguration.schema.parse>;

/**
 * Whether a provider's settings form is Bambu's (by source id, never by provider id). Such a provider names material
 * slots by Bambu tray number in its submission (`amsMapping`) and its saved preferences; this module is the one place
 * that converts them to and from slot addresses.
 */
const isBambuSettings = (provider: MachineProvider | undefined): boolean =>
  provider?.settingsConfiguration?.source.id === bambuSettingsConfiguration.manifest.source.id;

const bambuSubmissionFields: ReadonlySet<string> = new Set([
  'amsMapping',
  'expectedMaterials',
  'expectedBedType',
  'expectedModel',
  'operatorConfirmedBedType',
  'bedLeveling',
  'flowCalibration',
  'timelapse',
]);
const noFields: ReadonlySet<string> = new Set();

/**
 * The submission keys Bambu's settings own: the slot mapping (`amsMapping`), what the program expects (the provider
 * completes those) and the start flags its saved preferences remember. Prepare sets or remembers them itself, so it
 * neither keeps them as passing choices nor offers them under Advanced. Another provider owns nothing here: its
 * fields are its own form's.
 *
 * @param provider - The selected machine's provider.
 * @returns The Bambu-owned keys, empty unless the provider's settings form is Bambu's.
 * @public
 */
export const bambuOwnedSubmissionFields = (provider: MachineProvider | undefined): ReadonlySet<string> =>
  isBambuSettings(provider) ? bambuSubmissionFields : noFields;

/**
 * A provider's saved preferences read as Bambu's, when its settings form is Bambu's (by source id, never by provider
 * id): the slots remembered per colour and the start flags live there.
 *
 * @param provider - The selected machine's provider.
 * @param values - Its saved preferences.
 * @returns The typed preferences, or nothing for another form or values that do not parse.
 * @public
 */
export const bambuPreferencesOf = (
  provider: MachineProvider | undefined,
  values: MachinePreferences | undefined,
): BambuPreferences | undefined => {
  if (!isBambuSettings(provider)) {
    return undefined;
  }
  const parsed = bambuSettingsConfiguration.schema.safeParse(values ?? {});
  return parsed.success ? parsed.data : undefined;
};

/**
 * The slot each filament prints from, read from a Bambu submission's tray numbers (`amsMapping`).
 *
 * @param provider - The provider that owns the submission.
 * @param configuration - The submission.
 * @returns One address per filament, undefined for a filament given none (`-1`); none when the provider's settings
 * are not Bambu's or the submission names no mapping.
 * @throws RangeError for a tray number no Bambu printer has; Prepare only holds numbers this module wrote or the
 * settings schema admitted.
 * @public
 */
export const bambuSubmissionSlots = (
  provider: MachineProvider | undefined,
  configuration: Readonly<Record<string, unknown>>,
): ReadonlyArray<MaterialSlotAddress | undefined> => {
  const mapping = configuration['amsMapping'];
  return isBambuSettings(provider) && Array.isArray(mapping)
    ? mapping.map((tray) => (typeof tray === 'number' && tray >= 0 ? bambuAddressOf(tray) : undefined))
    : [];
};

/**
 * A submission with the slot each filament prints from written as Bambu tray numbers (`amsMapping`, `-1` for none).
 *
 * @param provider - The provider that owns the submission.
 * @param configuration - The submission before.
 * @param slots - One address per filament; none removes the mapping.
 * @returns The submission after; unchanged for a provider whose settings are not Bambu's.
 * @public
 */
export const withBambuSubmissionSlots = (
  provider: MachineProvider | undefined,
  configuration: Readonly<Record<string, unknown>>,
  slots: ReadonlyArray<MaterialSlotAddress | undefined>,
): Record<string, unknown> => {
  if (!isBambuSettings(provider)) {
    return { ...configuration };
  }
  const { amsMapping: _mapping, ...rest } = configuration;
  return slots.length === 0
    ? rest
    : { ...rest, amsMapping: slots.map((slot) => (slot === undefined ? -1 : (bambuSlotOf(slot) ?? -1))) };
};

/**
 * The slots Bambu's saved preferences remember for a slice: the slot per colour for several filaments, the default
 * slot for one.
 *
 * @param preferences - Bambu's saved preferences ({@link bambuPreferencesOf}).
 * @param filamentColors - The slice's filament colours, in filament order.
 * @returns One address per filament, undefined where none is remembered.
 * @public
 */
export const savedBambuSlots = (
  preferences: BambuPreferences | undefined,
  filamentColors: readonly string[],
): ReadonlyArray<MaterialSlotAddress | undefined> => {
  const material = preferences?.material;
  const trays =
    filamentColors.length > 1
      ? filamentColors.map((color) => material?.slotsByColor?.[color.toLowerCase()])
      : [material?.defaultSlot];
  return trays.map((tray) => (tray === undefined ? undefined : bambuAddressOf(tray)));
};

/**
 * The Bambu Studio filament preset the person picked for a slot, kept by tray number in the print intent.
 *
 * @param chosen - The person's Bambu Studio picks.
 * @param slot - The slot, when one is chosen.
 * @returns The preset name, when one was picked.
 * @public
 */
export const chosenBambuFilament = (
  chosen: BambuStudioChosen,
  slot: MaterialSlotAddress | undefined,
): string | undefined => {
  const tray = slot === undefined ? undefined : bambuSlotOf(slot);
  return tray === undefined ? undefined : chosen.filaments?.[tray];
};

/**
 * Remember Prepare's submission choices in Bambu's preferences: the start flags and the slot each of the slice's
 * colours prints from (one default slot for a single colour). The plate is the print intent's, saved apart.
 *
 * @param prior - The preferences before.
 * @param next - The submission as Prepare now holds it.
 * @param filamentColors - The slice's filament colours, in filament order.
 * @returns The preferences after.
 * @public
 */
export const rememberBambuSubmission = (
  prior: BambuPreferences,
  next: Readonly<Record<string, unknown>>,
  filamentColors: readonly string[],
): BambuPreferences => {
  const { material: _material, bedLeveling: _bed, flowCalibration: _flow, timelapse: _time, ...rest } = prior;
  const flags = Object.fromEntries(
    ['bedLeveling', 'flowCalibration', 'timelapse'].flatMap((key) =>
      typeof next[key] === 'boolean' ? [[key, next[key]]] : [],
    ),
  );
  const mapping = Array.isArray(next['amsMapping'])
    ? next['amsMapping'].map((slot): number | undefined => (typeof slot === 'number' && slot >= 0 ? slot : undefined))
    : [];
  const material = mapping.every((slot) => slot === undefined)
    ? undefined
    : filamentColors.length > 1
      ? {
          ...prior.material,
          slotsByColor: {
            ...prior.material?.slotsByColor,
            ...Object.fromEntries(
              filamentColors.flatMap((color, index) =>
                mapping[index] === undefined ? [] : [[color.toLowerCase(), mapping[index]]],
              ),
            ),
          },
        }
      : { ...prior.material, defaultSlot: mapping[0] };
  return bambuSettingsConfiguration.schema.parse({
    ...rest,
    ...flags,
    ...(material ? { material } : {}),
  });
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Bambu key → value from settings values nested scope → group → key.
 *
 * ponytail: mirrors `flattenBambuSettings`; importing that value from `@taucad/slicer/bambu-studio` would put the
 * Node engine into the SSR bundle through the package's `node` condition.
 *
 * @param values - The `values` of a settings answer.
 * @returns One entry per Bambu key.
 */
const flattenSettings = (values: Record<string, unknown>): Record<string, unknown> =>
  Object.assign(
    {},
    ...Object.values(values)
      .filter((scope) => isPlainRecord(scope))
      .flatMap((scope) => Object.values(scope).filter((group) => isPlainRecord(group))),
  ) as Record<string, unknown>;

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * Keep the overrides that still name a setting of the new presets and still differ from its value.
 *
 * @param overrides - Bambu key → value the person changed.
 * @param defaults - Bambu key → value of the presets now selected.
 * @returns The overrides that still apply, and how many named a setting these presets do not have.
 * @public
 */
export const reconcileOverrides = (
  overrides: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, unknown>>,
): Readonly<{ kept: Record<string, unknown>; dropped: number }> => {
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(defaults, key)) {
      dropped += 1;
    } else if (!sameValue(value, defaults[key])) {
      kept[key] = value;
    }
  }
  return { kept, dropped };
};

/**
 * Presets that work with a printer preset: those naming it, and those naming none.
 *
 * @param presets - Process or filament presets from the catalog.
 * @param printer - The printer preset selected.
 * @returns The compatible presets, in catalog order.
 * @public
 */
export const compatiblePresets = (
  presets: readonly BambuPresetSummary[],
  printer: string | undefined,
): readonly BambuPresetSummary[] =>
  presets.filter(
    (preset) =>
      preset.compatiblePrinters === undefined || printer === undefined || preset.compatiblePrinters.includes(printer),
  );

type Loaded = Readonly<{
  /** The trays the selection was resolved for, ascending: `selection.filaments` holds one preset per tray. */
  trays: readonly number[];
  /** The hints and picks this selection answers; slicing waits while a newer request resolves. */
  request: string;
  selection: BambuStudioSelection;
  settings: BambuStudioSettings;
  /** Bambu key → value of the resolved presets. */
  defaults: Record<string, unknown>;
}>;

/** The presets the person picked; the rest are Bambu Studio's defaults. Filaments are keyed by slot. @public */
export type BambuStudioChosen = Readonly<Pick<PrintPreferences, 'printer' | 'process' | 'preset' | 'filaments'>>;

/** One Bambu Studio setting value a print intent may hold. */
type SettingValue = NonNullable<PrintPreferences['settings']>[string];

const noSettings: Readonly<Record<string, SettingValue>> = {};
const noChoices: BambuStudioChosen = {};

/** Everything the Prepare step needs from Bambu Studio. @public */
export type BambuStudioMode = Readonly<{
  /**
   * `off`: not a Bambu printer. `checking`: asking the host. `unavailable`: no desktop
   * bridge or no Bambu Studio, so the reference engine slices. `ready`: Bambu Studio slices.
   */
  status: 'off' | 'checking' | 'unavailable' | 'ready';
  version: string | undefined;
  printers: readonly BambuPresetSummary[];
  /** Process presets compatible with the selected printer preset. */
  processes: readonly BambuPresetSummary[];
  /** Filament presets compatible with the selected printer preset. */
  filaments: readonly BambuPresetSummary[];
  selection: BambuStudioSelection | undefined;
  settings: BambuStudioSettings | undefined;
  /** Bambu key → value of the selected presets. */
  defaults: Record<string, unknown>;
  /** Bambu key → value the print intent holds; each one is a modified setting. */
  overrides: Readonly<Record<string, unknown>>;
  /**
   * Save these settings in one write: each takes its value in `values`, and one that `values` lacks
   * or holds at its preset value leaves the print intent. Settings outside `keys` are untouched.
   */
  setSettings: (keys: Iterable<string>, values: Readonly<Record<string, unknown>>) => void;
  /** Settings the print intent holds that these presets lack: kept in the file, left out of the slice. */
  dropped: number;
  error: string | undefined;
  /** The loaded trays the filaments print from, ascending: the order `selection.filaments` follows. */
  trays: readonly BambuTray[];
  chosen: BambuStudioChosen;
  /** Another printer preset has its own processes and filaments, so choosing one clears those picks. */
  choosePrinter: (printer: string) => void;
  chooseProcess: (process: string) => void;
  chooseFilament: (slot: number, filament: string) => void;
  /** Fast, Standard or Fine: Bambu Studio picks the matching 0.28, 0.20 or 0.12 mm process. */
  choosePreset: (preset: BambuQualityPreset) => void;
  /** Remove one pick from the print intent, so Bambu Studio's default applies again. */
  resetChoice: (choice: 'printer' | 'process') => void;
  resetFilament: (slot: number) => void;
  /** What slicing sends on the export route; undefined until the presets and settings have loaded. */
  exportOptions: Record<string, unknown> | undefined;
}>;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The preset a selection resolved for one tray, when it resolved one. */
const presetFor = (loaded: Loaded | undefined, slot: number): string | undefined =>
  loaded?.selection.filaments[loaded.trays.indexOf(slot)];

/**
 * The filament preset each filament prints with, in filament order: its tray's. A filament without a tray yet
 * takes the first one's, as Bambu Studio prints any filament past the list with the first preset; so filaments
 * that share one preset send just that one, and a remap among trays of the same preset leaves the slice current.
 *
 * @param loaded - The resolved selection and the trays it is for.
 * @param mapping - The slot each filament prints from, in filament order; `-1` for none.
 * @returns The presets to slice with.
 */
const filamentOrder = (loaded: Loaded, mapping: readonly number[]): readonly string[] => {
  const mapped = mapping.map((slot) => presetFor(loaded, slot));
  const first = mapped.find((name) => name !== undefined);
  if (first === undefined) {
    return loaded.selection.filaments;
  }
  const presets = mapped.map((name) => name ?? first);
  return presets.every((name) => name === first) ? [first] : presets;
};

const toBambuPlate = (plate: string | undefined): BambuPlate['id'] | undefined =>
  plate !== undefined && bambuPlateIds.has(plate) ? (plate as BambuPlate['id']) : undefined;

/**
 * What the bound printer tells Bambu Studio's defaults: model, nozzle, quality, plate and the used trays.
 *
 * @returns The hints, or `undefined` before a machine is selected.
 */
const machineHints = ({
  entry,
  manifest,
  preset,
  plate,
  slots,
}: {
  readonly entry: MachineDirectoryEntry | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly preset: BambuQualityPreset | undefined;
  readonly plate: BambuPlate['id'] | undefined;
  readonly slots: readonly number[];
}): BambuMachineHints | undefined => {
  if (entry === undefined) {
    return undefined;
  }
  const nozzleDiameter = manifest === undefined ? undefined : toolheadOf(manifest)?.nozzles[0]?.diameter.value;
  return {
    model: entry.descriptor.model,
    ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }),
    ...(preset === undefined ? {} : { preset }),
    ...(plate === undefined ? {} : { plate }),
    materials: slots.map((slot) => {
      const tray = observedSlots(entry).find((candidate) => bambuSlotOf(candidate.address) === slot);
      return {
        slot,
        ...(tray?.materialId === undefined ? {} : { materialId: tray.materialId }),
        ...(tray?.profileId === undefined ? {} : { profileId: tray.profileId }),
      };
    }),
  };
};

/** The presets the person picked, as a partial selection Bambu Studio completes. */
const partialSelection = ({
  chosen,
  slots,
  plate,
  resolved,
}: Readonly<{
  chosen: BambuStudioChosen;
  slots: readonly number[];
  plate: BambuPlate['id'] | undefined;
  /** The filaments Bambu Studio resolved last, per used slot. */
  resolved: ReadonlyArray<string | undefined>;
}>): Partial<BambuStudioSelection> => {
  const picked = slots.map((slot) => chosen.filaments?.[slot]);
  // One pick among several slots keeps the others at what Bambu Studio resolved for them.
  const filaments = picked.map((name, index) => name ?? resolved[index]);
  return {
    ...(chosen.printer === undefined ? {} : { printer: chosen.printer }),
    ...(chosen.process === undefined ? {} : { process: chosen.process }),
    ...(picked.some((name) => name !== undefined) && filaments.every((name) => name !== undefined)
      ? { filaments }
      : {}),
    ...(plate === undefined ? {} : { plate }),
  };
};

const modeStatus = (
  isBambu: boolean,
  hasBridge: boolean,
  status: Readonly<{ available: boolean }> | undefined,
): BambuStudioMode['status'] => {
  if (!isBambu) {
    return 'off';
  }
  if (!hasBridge) {
    return 'unavailable';
  }
  if (status === undefined) {
    return 'checking';
  }
  return status.available ? 'ready' : 'unavailable';
};

/**
 * Own Bambu Studio's selection surface for the selected machine.
 *
 * @param input - The machine, its provider and manifest, the confirmed plate, the slot each filament prints
 * from, and the project's print intent for this printer with its `update`.
 * @returns The mode, its presets, settings, overrides and the export options they make.
 * @public
 */
export const useBambuStudio = ({
  provider,
  entry,
  manifest,
  plate,
  mapping: slotMapping,
  intent,
  update,
}: {
  readonly provider: MachineProvider | undefined;
  readonly entry: MachineDirectoryEntry | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly plate: string | undefined;
  /** The slot each filament prints from, in filament order; undefined for a filament given none yet. */
  readonly mapping: ReadonlyArray<MaterialSlotAddress | undefined>;
  readonly intent: PrintPreferences | undefined;
  readonly update: (edit: PrintPreferencesEdit) => void;
}): BambuStudioMode => {
  // The shell is fixed for the page's life; `desktopBridge()` builds a new facade per call.
  const [studio] = useState(() => desktopBridge()?.slicers?.bambuStudio);
  const isBambu = isBambuProvider(provider);
  const [status, setStatus] = useState<Readonly<{ available: boolean; version?: string }>>();
  const [catalog, setCatalog] = useState<BambuStudioCatalog>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [failure, setFailure] = useState<string>();
  const settingsCacheRef = useRef<Readonly<{ key: string; settings: BambuStudioSettings }>>(undefined);
  const preset = intent?.preset;
  const chosen: BambuStudioChosen = intent ?? noChoices;

  const model = entry?.descriptor.model;
  const nozzleDiameter = manifest === undefined ? undefined : toolheadOf(manifest)?.nozzles[0]?.diameter.value;
  const bambuPlate = toBambuPlate(plate);
  /* Bambu Studio names slots by tray number; `-1` for a filament given none. */
  const mapping = useMemo(
    () => slotMapping.map((slot) => (slot === undefined ? -1 : (bambuSlotOf(slot) ?? -1))),
    [slotMapping],
  );
  /* Presets are Bambu Studio's per tray, ascending, as it resolves them; `mapping` orders them per filament. */
  const slots = useMemo(
    () => [...new Set(mapping.filter((slot) => slot >= 0))].toSorted((left, right) => left - right),
    [mapping],
  );
  // Keyed by content so a telemetry frame that changes nothing here reloads nothing.
  const hintsKey = JSON.stringify(machineHints({ entry, manifest, preset, plate: bambuPlate, slots }) ?? '');
  const partialKey = JSON.stringify(
    partialSelection({
      chosen,
      slots,
      plate: bambuPlate,
      resolved: slots.map((slot) => presetFor(loaded, slot)),
    }),
  );

  useEffect(() => {
    if (!studio || !isBambu) {
      return;
    }
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const answer = await studio.status();
        if (!cancelled) {
          setStatus(answer.available ? { available: true, version: answer.version } : { available: false });
        }
      } catch {
        if (!cancelled) {
          setStatus({ available: false });
        }
      }
    };
    // async-iife: bootstrap -- the host answers once per page; a new machine keeps the answer.
    void check();
    return () => {
      cancelled = true;
    };
  }, [isBambu, studio]);

  const isAvailable = isBambu && status?.available === true;
  useEffect(() => {
    if (!studio || !isAvailable || model === undefined) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await studio.catalog({
          model,
          ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }),
        });
        if (!cancelled) {
          setCatalog(next);
        }
      } catch (error) {
        if (!cancelled) {
          setFailure(errorMessage(error));
        }
      }
    };
    // async-iife: bootstrap -- a newer model or nozzle supersedes this load.
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAvailable, model, nozzleDiameter, studio]);

  useEffect(() => {
    const parsed: unknown = JSON.parse(hintsKey);
    if (!studio || catalog === undefined || parsed === '') {
      return;
    }
    // SAFETY: the key is the JSON of `machineHints`, or of '' before a machine is selected.
    const hints = parsed as BambuMachineHints;
    let cancelled = false;
    const resolve = async (): Promise<void> => {
      try {
        const partial = JSON.parse(partialKey) as Partial<BambuStudioSelection>;
        const request = hintsKey + partialKey;
        const selection = await studio.resolveSelection({ hints, partial });
        const presets = { printer: selection.printer, process: selection.process, filaments: selection.filaments };
        const key = JSON.stringify(presets);
        const cached = settingsCacheRef.current;
        const settings = cached?.key === key ? cached.settings : await studio.settings(presets);
        if (cancelled) {
          return;
        }
        settingsCacheRef.current = { key, settings };
        setFailure(undefined);
        const trays = hints.materials.map(({ slot }) => slot);
        setLoaded((previous) =>
          previous?.settings === settings
            ? { ...previous, trays, request, selection }
            : { trays, request, selection, settings, defaults: flattenSettings(settings.values) },
        );
      } catch (error) {
        if (!cancelled) {
          setFailure(errorMessage(error));
        }
      }
    };
    // async-iife: bootstrap -- a newer choice or observation supersedes this resolution.
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [catalog, hintsKey, partialKey, studio]);

  const defaults = loaded?.defaults;
  const setSettings = useCallback(
    (keys: Iterable<string>, values: Readonly<Record<string, unknown>>) => {
      const replaced = new Set(keys);
      update(({ settings = noSettings, ...rest }) => {
        const next = Object.fromEntries(Object.entries(settings).filter(([key]) => !replaced.has(key)));
        for (const key of replaced) {
          const value = values[key];
          if (value !== undefined && !sameValue(value, defaults?.[key])) {
            // SAFETY: the form parses each value against the setting's schema, and the serializer validates it again.
            next[key] = value as SettingValue;
          }
        }
        return Object.keys(next).length === 0 ? rest : { ...rest, settings: next };
      });
    },
    [defaults, update],
  );
  const choosePrinter = useCallback(
    (printer: string) => {
      update(({ process: _process, filaments: _filaments, ...rest }) => ({ ...rest, printer }));
    },
    [update],
  );
  const chooseProcess = useCallback(
    (process: string) => {
      update(({ preset: _preset, ...current }) => ({ ...current, process }));
    },
    [update],
  );
  const chooseFilament = useCallback(
    (slot: number, filament: string) => {
      update((current) => ({ ...current, filaments: { ...current.filaments, [slot]: filament } }));
    },
    [update],
  );
  const choosePreset = useCallback(
    (next: BambuQualityPreset) => {
      update(({ process: _process, ...rest }) => ({ ...rest, preset: next }));
    },
    [update],
  );
  const resetChoice = useCallback(
    (choice: 'printer' | 'process') => {
      if (choice === 'process') {
        update(({ process: _process, preset: _preset, ...rest }) => rest);
      } else {
        update(({ printer: _printer, ...rest }) => rest);
      }
    },
    [update],
  );
  const resetFilament = useCallback(
    (slot: number) => {
      update(({ filaments = {}, ...rest }) => {
        const { [slot]: _removed, ...others } = filaments;
        return Object.keys(others).length === 0 ? rest : { ...rest, filaments: others };
      });
    },
    [update],
  );

  const overrides = intent?.settings ?? noSettings;
  /* A preset without one of these settings leaves it in the file and out of the slice, until presets that have it return. */
  const reconciled = useMemo(
    () => (defaults === undefined ? { kept: {}, dropped: 0 } : reconcileOverrides(overrides, defaults)),
    [defaults, overrides],
  );
  const selection = loaded?.selection;
  const isCurrent = loaded?.request === hintsKey + partialKey && failure === undefined;
  const exportOptions = useMemo(() => {
    // A plate or material change, or a failed resolution, must not slice (or send) the previous selection.
    if (loaded === undefined || !isCurrent) {
      return undefined;
    }
    return {
      engine: 'bambu-studio',
      bambuStudio: {
        printer: loaded.selection.printer,
        process: loaded.selection.process,
        filaments: filamentOrder(loaded, mapping),
        plate: loaded.selection.plate,
        ...(Object.keys(reconciled.kept).length === 0 ? {} : { settings: reconciled.kept }),
      },
    };
  }, [isCurrent, loaded, mapping, reconciled]);
  const printer = selection?.printer;
  const processes = useMemo(() => compatiblePresets(catalog?.processes ?? [], printer), [catalog, printer]);
  const filaments = useMemo(() => compatiblePresets(catalog?.filaments ?? [], printer), [catalog, printer]);
  const trays = useMemo(
    () =>
      slots.map((slot): BambuTray => {
        const observed = entry === undefined ? [] : observedSlots(entry);
        const tray = observed.find((candidate) => bambuSlotOf(candidate.address) === slot);
        return {
          slot,
          label: tray?.label ?? `Slot ${String(slot + 1)}`,
          ...(tray?.materialId === undefined ? {} : { materialId: tray.materialId }),
          ...(tray?.color === undefined ? {} : { color: tray.color }),
        };
      }),
    [entry, slots],
  );

  return {
    status: modeStatus(isBambu, studio !== undefined, status),
    version: status?.version,
    printers: catalog?.printers ?? [],
    processes,
    filaments,
    selection,
    settings: loaded?.settings,
    defaults: defaults ?? noSettings,
    overrides,
    setSettings,
    dropped: reconciled.dropped,
    error: failure,
    trays,
    chosen,
    choosePrinter,
    chooseProcess,
    chooseFilament,
    choosePreset,
    resetChoice,
    resetFilament,
    exportOptions,
  };
};
