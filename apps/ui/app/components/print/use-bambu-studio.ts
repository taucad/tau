/**
 * Bambu Studio mode of the Print pane (blueprint U2, D9, D12): which presets
 * Bambu Studio offers for the bound printer, the person's choices among them,
 * the settings those presets resolve to and the overrides on top, all read
 * through the desktop bridge. Slicing itself stays on the export route; this
 * hook only states the export options it would slice with.
 *
 * @module
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MachineDirectoryEntry, MachineManifest, MachineProvider } from '@taucad/runtime/machine';
import type {
  BambuMachineHints,
  BambuPlate,
  BambuPresetSummary,
  BambuStudioCatalog,
  BambuStudioSelection,
  BambuStudioSettings,
} from '@taucad/slicer/bambu-studio';
import { desktopBridge } from '#filesystem/desktop-bridge.js';

/** Providers whose printers slice with Bambu Studio when it is installed. */
const bambuProviderIds: ReadonlySet<string> = new Set(['bambu', 'bambu-simulator']);
const bambuPlateIds: ReadonlySet<string> = new Set<BambuPlate['id']>([
  'cool',
  'engineering',
  'high-temperature',
  'textured-pei',
]);

/** Quality presets Bambu Studio's default process follows. @public */
export type BambuQualityPreset = NonNullable<BambuMachineHints['preset']>;

/**
 * Whether a provider drives a Bambu Lab printer.
 *
 * @param provider - The selected machine's provider.
 * @returns True for the Bambu LAN provider, its simulator and any provider declaring the vendor.
 * @public
 */
export const isBambuProvider = (provider: MachineProvider | undefined): boolean =>
  provider !== undefined && (bambuProviderIds.has(provider.id) || provider.vendor === 'Bambu Lab');

/**
 * Whether a provider is the real Bambu printer, which accepts only Bambu Studio archives (blueprint P3).
 *
 * @param provider - The selected machine's provider.
 * @returns True for the real printer, false for the simulator and every other provider.
 * @public
 */
export const isRealBambuPrinter = (provider: MachineProvider | undefined): boolean => provider?.id === 'bambu';

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
  /** The hints the selection was resolved from, so slicing never pairs new hints with an old selection. */
  hints: BambuMachineHints;
  /** The hints and picks this selection answers; slicing waits while a newer request resolves. */
  request: string;
  selection: BambuStudioSelection;
  settings: BambuStudioSettings;
  /** Bambu key → value of the resolved presets. */
  defaults: Record<string, unknown>;
  overrides: Record<string, unknown>;
  /** Overrides the last preset change dropped because the new presets lack their setting. */
  dropped: number;
}>;

type Chosen = Readonly<{ printer?: string; process?: string; filaments?: Readonly<Record<number, string>> }>;

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
  /** Bambu key → value the person changed; only keys that differ from `defaults`. */
  overrides: Record<string, unknown>;
  setOverrides: (overrides: Record<string, unknown>) => void;
  dropped: number;
  error: string | undefined;
  /** The used material slots, in the order `selection.filaments` follows. */
  slots: readonly number[];
  choosePrinter: (printer: string) => void;
  chooseProcess: (process: string) => void;
  chooseFilament: (slot: number, filament: string) => void;
  /** Fast, Standard or Fine: Bambu Studio picks the matching 0.28, 0.20 or 0.12 mm process. */
  choosePreset: (preset: BambuQualityPreset) => void;
  /** What slicing sends on the export route; undefined until the presets and settings have loaded. */
  exportOptions: Record<string, unknown> | undefined;
}>;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
  const nozzleDiameter = manifest?.toolhead.nozzles[0]?.diameter.value;
  return {
    model: entry.descriptor.model,
    ...(nozzleDiameter === undefined ? {} : { nozzleDiameter }),
    ...(preset === undefined ? {} : { preset }),
    ...(plate === undefined ? {} : { plate }),
    materials: slots.map((slot) => {
      const tray = entry.snapshot.setup.materials.find((material) => material.slot === slot);
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
  chosen: Chosen;
  slots: readonly number[];
  plate: BambuPlate['id'] | undefined;
  /** The filaments Bambu Studio resolved last, per used slot. */
  resolved: readonly string[] | undefined;
}>): Partial<BambuStudioSelection> => {
  const picked = slots.map((slot) => chosen.filaments?.[slot]);
  // One pick among several slots keeps the others at what Bambu Studio resolved for them.
  const filaments = picked.map((name, index) => name ?? resolved?.[index]);
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
 * @param input - The machine, its provider and manifest, the confirmed plate and the used slots.
 * @returns The mode, its presets, settings, overrides and the export options they make.
 * @public
 */
export const useBambuStudio = ({
  provider,
  entry,
  manifest,
  plate,
  slots,
}: {
  readonly provider: MachineProvider | undefined;
  readonly entry: MachineDirectoryEntry | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly plate: string | undefined;
  readonly slots: readonly number[];
}): BambuStudioMode => {
  // The shell is fixed for the page's life; `desktopBridge()` builds a new facade per call.
  const [studio] = useState(() => desktopBridge()?.slicers?.bambuStudio);
  const isBambu = isBambuProvider(provider);
  const [status, setStatus] = useState<Readonly<{ available: boolean; version?: string }>>();
  const [catalog, setCatalog] = useState<BambuStudioCatalog>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [failure, setFailure] = useState<string>();
  const [chosen, setChosen] = useState<Chosen>({});
  const [preset, setPreset] = useState<BambuQualityPreset>();
  const settingsCacheRef = useRef<Readonly<{ key: string; settings: BambuStudioSettings }>>(undefined);

  const model = entry?.descriptor.model;
  const nozzleDiameter = manifest?.toolhead.nozzles[0]?.diameter.value;
  const bambuPlate = toBambuPlate(plate);
  // Keyed by content so a telemetry frame that changes nothing here reloads nothing.
  const hintsKey = JSON.stringify(machineHints({ entry, manifest, preset, plate: bambuPlate, slots }) ?? '');
  const partialKey = JSON.stringify(
    partialSelection({ chosen, slots, plate: bambuPlate, resolved: loaded?.selection.filaments }),
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
        const defaults = flattenSettings(settings.values);
        setFailure(undefined);
        setLoaded((previous) => {
          if (previous?.settings === settings) {
            return { ...previous, hints, request, selection };
          }
          const { kept, dropped } = reconcileOverrides(previous?.overrides ?? {}, defaults);
          return { hints, request, selection, settings, defaults, overrides: kept, dropped };
        });
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

  const setOverrides = useCallback((overrides: Record<string, unknown>) => {
    setLoaded((previous) =>
      previous === undefined
        ? previous
        : { ...previous, overrides: reconcileOverrides(overrides, previous.defaults).kept, dropped: 0 },
    );
  }, []);
  const choosePrinter = useCallback((printer: string) => {
    // Another printer has its own compatible processes and filaments; Bambu Studio picks them again.
    setChosen({ printer });
  }, []);
  const chooseProcess = useCallback((process: string) => {
    setChosen((current) => ({ ...current, process }));
  }, []);
  const chooseFilament = useCallback((slot: number, filament: string) => {
    setChosen((current) => ({ ...current, filaments: { ...current.filaments, [slot]: filament } }));
  }, []);
  const choosePreset = useCallback((next: BambuQualityPreset) => {
    setPreset(next);
    setChosen(({ process: _process, ...rest }) => rest);
  }, []);

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
        filaments: loaded.selection.filaments,
        plate: loaded.selection.plate,
        ...(Object.keys(loaded.overrides).length === 0 ? {} : { settings: loaded.overrides }),
        hints: loaded.hints,
      },
    };
  }, [isCurrent, loaded]);
  const printer = selection?.printer;
  const processes = useMemo(() => compatiblePresets(catalog?.processes ?? [], printer), [catalog, printer]);
  const filaments = useMemo(() => compatiblePresets(catalog?.filaments ?? [], printer), [catalog, printer]);

  return {
    status: modeStatus(isBambu, studio !== undefined, status),
    version: status?.version,
    printers: catalog?.printers ?? [],
    processes,
    filaments,
    selection,
    settings: loaded?.settings,
    defaults: loaded?.defaults ?? {},
    overrides: loaded?.overrides ?? {},
    setOverrides,
    dropped: loaded?.dropped ?? 0,
    error: failure,
    slots,
    choosePrinter,
    chooseProcess,
    chooseFilament,
    choosePreset,
    exportOptions,
  };
};
