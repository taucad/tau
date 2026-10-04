/**
 * Bambu Studio presets and settings for the Print pane (blueprint D12).
 *
 * Read-only request/response over trusted IPC: main finds the person's own
 * Bambu Studio and reads its presets, and the renderer gets plain data. The
 * slice itself never comes through here; it runs in the kernel utility on
 * the export route. Every renderer input is parsed and bounded before it
 * reaches the engine, and engine refusals come back as `{ code, message }`
 * because Electron's invoke keeps only an error's message.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';
import {
  BambuStudioError,
  describeBambuStudioSettings,
  findBambuStudio,
  loadBambuStudioCatalog,
  resolveBambuStudioSelection,
} from '@taucad/slicer/bambu-studio';
import type {
  BambuPlate,
  BambuStudioCatalog,
  BambuStudioCatalogFilter,
  BambuStudioErrorCode,
  BambuStudioInstallation,
  BambuStudioSelection,
  BambuStudioSettings,
} from '@taucad/slicer/bambu-studio';

/** The engine functions the service calls; tests inject fakes. */
export type BambuStudioEngine = Readonly<{
  findBambuStudio: typeof findBambuStudio;
  loadBambuStudioCatalog: typeof loadBambuStudioCatalog;
  resolveBambuStudioSelection: typeof resolveBambuStudioSelection;
  describeBambuStudioSettings: typeof describeBambuStudioSettings;
}>;

/** Whether this machine has a usable Bambu Studio. */
export type BambuStudioStatus =
  | Readonly<{ available: true; version: string; executable: string }>
  | Readonly<{ available: false; reason: string }>;

/** An answer, or the engine's typed refusal in a shape IPC keeps intact. */
export type BambuStudioIpcResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Readonly<{ code: BambuStudioErrorCode; message: string }> }>;

/** The four calls main serves on `slicersChannels.bambuStudio`. */
export type BambuStudioService = Readonly<{
  status(): Promise<BambuStudioStatus>;
  catalog(input: unknown): Promise<BambuStudioIpcResult<BambuStudioCatalog>>;
  resolveSelection(input: unknown): Promise<BambuStudioIpcResult<BambuStudioSelection>>;
  settings(input: unknown): Promise<BambuStudioIpcResult<BambuStudioSettings>>;
}>;

/* A release ignores `TAU_BAMBU_STUDIO_PATH` (security assessment F-2), so only a
 * build that honours it names it. */
const notInstalled = (pathOverride: boolean): string =>
  pathOverride
    ? 'Bambu Studio was not found at its default install location. Install it, or set TAU_BAMBU_STUDIO_PATH to its app or executable, and restart Tau.'
    : 'Bambu Studio was not found at its default install location. Install it and restart Tau.';

/* Bounds sized well above real use: Bambu Studio has about 600 settings, an
 * AMS system at most a few dozen slots, and the longest values are G-code templates. */
const presetName = z.string().min(1).max(256);
const nozzleDiameter = z.number().positive().max(10);
const slot = z.number().int().min(0).max(255);
const plateIds = ['cool', 'engineering', 'high-temperature', 'textured-pei'] as const satisfies ReadonlyArray<
  BambuPlate['id']
>;
const settingValue = z.union([
  z.string().max(65_536),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(4096), z.number()])).max(256),
]);

const filterSchema = z.object({
  printer: presetName.optional(),
  model: presetName.optional(),
  nozzleDiameter: nozzleDiameter.optional(),
});
const hintsSchema = z.object({
  model: presetName,
  nozzleDiameter: nozzleDiameter.optional(),
  preset: z.enum(['fast', 'standard', 'fine']).optional(),
  plate: z.enum(plateIds).optional(),
  materials: z.array(z.object({ slot, materialId: presetName.optional(), profileId: presetName.optional() })).max(32),
});
const presetsSchema = z.object({ printer: presetName, process: presetName, filaments: z.array(presetName).max(32) });
const selectionRequestSchema = z.object({
  hints: hintsSchema,
  partial: z
    .object({
      printer: presetName.optional(),
      process: presetName.optional(),
      filaments: z.array(presetName).max(32).optional(),
      plate: z.enum(plateIds).optional(),
      settings: z
        .record(z.string().min(1).max(128), settingValue)
        .refine((settings) => Object.keys(settings).length <= 2048)
        .optional(),
    })
    .optional(),
});

const parse = <Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Desktop shell refused invalid Bambu Studio request.');
  }
  return parsed.data;
};

/**
 * A cheap stamp of the presets Bambu Studio can change while Tau runs: every
 * user preset, and the top of the OTA system preset directory.
 *
 * @param dataDirectory - Bambu Studio's data directory, when it exists.
 * @returns Entry count and newest modification time.
 */
const presetsStamp = async (dataDirectory: string | undefined): Promise<string> => {
  if (dataDirectory === undefined) {
    return '';
  }
  const user = join(dataDirectory, 'user');
  const system = join(dataDirectory, 'system');
  const [userEntries, systemEntries] = await Promise.all([
    readdir(user, { recursive: true }).catch(() => []),
    readdir(system).catch(() => []),
  ]);
  const paths = [
    user,
    system,
    ...userEntries.map((entry) => join(user, entry)),
    ...systemEntries.map((entry) => join(system, entry)),
  ];
  const modified = await Promise.all(
    paths.map(async (path) => {
      try {
        const { mtimeMs } = await stat(path);
        return mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  return `${paths.length}:${Math.max(...modified)}`;
};

/**
 * Create the main-process half of `tau.slicers.bambuStudio`.
 *
 * Catalogs and settings are cached per install, version and preset stamp, so
 * a pane that re-renders pays for the preset read once. The install lookup
 * itself is a few file checks; the engine caches the version probe.
 *
 * @param options - `env` is main's resolved environment (it carries `TAU_BAMBU_STUDIO_PATH`);
 *   `pathOverride` says whether this build honours that variable (false in a release);
 *   `engine` replaces the real one in tests.
 * @returns The four calls.
 */
export const createBambuStudioService = (
  options: Readonly<{ env: NodeJS.ProcessEnv; pathOverride: boolean; engine?: BambuStudioEngine }>,
): BambuStudioService => {
  const engine = options.engine ?? {
    findBambuStudio,
    loadBambuStudioCatalog,
    resolveBambuStudioSelection,
    describeBambuStudioSettings,
  };
  const cache = new Map<string, Promise<unknown>>();

  const installation = async (): Promise<BambuStudioInstallation> => {
    const install = await engine.findBambuStudio({ env: options.env });
    if (install === undefined) {
      throw new BambuStudioError('BAMBU_STUDIO_UNAVAILABLE', notInstalled(options.pathOverride));
    }
    return install;
  };

  const cached = async <Value>(
    install: BambuStudioInstallation,
    request: string,
    load: () => Promise<Value>,
  ): Promise<Value> => {
    const key = [install.executable, install.version, await presetsStamp(install.dataDir), request].join('\0');
    let entry = cache.get(key) as Promise<Value> | undefined;
    if (entry === undefined) {
      // ponytail: stale stamps pile up until the cap clears everything; an LRU if panes ever juggle 64 printers.
      if (cache.size >= 64) {
        cache.clear();
      }
      entry = load();
      cache.set(key, entry);
    }
    try {
      return await entry;
    } catch (error) {
      // A refusal is not remembered: the person may fix the preset and ask again.
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
      throw error;
    }
  };

  const catalogFor = async (
    install: BambuStudioInstallation,
    filter: BambuStudioCatalogFilter,
  ): Promise<BambuStudioCatalog> =>
    cached(install, JSON.stringify(['catalog', filter.printer, filter.model, filter.nozzleDiameter]), async () =>
      engine.loadBambuStudioCatalog(install, filter),
    );

  const settle = async <Value>(work: () => Promise<Value>): Promise<BambuStudioIpcResult<Value>> => {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      if (error instanceof BambuStudioError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      throw error;
    }
  };

  return {
    status: async () => {
      const install = await engine.findBambuStudio({ env: options.env });
      return install === undefined
        ? { available: false, reason: notInstalled(options.pathOverride) }
        : { available: true, version: install.version, executable: install.executable };
    },
    catalog: async (input) => {
      const filter = parse(filterSchema, input ?? {});
      return settle(async () => catalogFor(await installation(), filter));
    },
    resolveSelection: async (input) => {
      const { hints, partial = {} } = parse(selectionRequestSchema, input);
      return settle(async () => {
        const catalog = await catalogFor(
          await installation(),
          partial.printer === undefined
            ? {
                model: hints.model,
                ...(hints.nozzleDiameter === undefined ? {} : { nozzleDiameter: hints.nozzleDiameter }),
              }
            : { printer: partial.printer },
        );
        return engine.resolveBambuStudioSelection(catalog, hints, partial);
      });
    },
    settings: async (input) => {
      const presets = parse(presetsSchema, input);
      return settle(async () => {
        const install = await installation();
        const request = JSON.stringify(['settings', presets.printer, presets.process, presets.filaments]);
        return cached(install, request, async () => engine.describeBambuStudioSettings(install, presets));
      });
    },
  };
};
