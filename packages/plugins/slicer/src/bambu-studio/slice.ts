/**
 * Slicing through the person's Bambu Studio command line.
 *
 * Each slice gets a temporary directory holding the flattened presets, one
 * STL per part, an empty Bambu Studio data directory (so the person's own
 * configuration is never read or written) and the output. The directory is
 * removed afterwards whatever happens.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';

import { resolveBambuSelectionPresets } from '#bambu-studio/catalog.js';
import type { BambuPresetValues } from '#bambu-studio/catalog.js';
import { encodeBambuSettings } from '#bambu-studio/options/index.js';
import { moveStl, placeClearOfTower, presetRect, stlFootprint, unionRect } from '#bambu-studio/plate-layout.js';
import type { PlateRect } from '#bambu-studio/plate-layout.js';
import { BambuStudioError, bambuPlates } from '#bambu-studio/types.js';
import type { BambuStudioSelection, BambuStudioSliceInput, BambuStudioSliceResult } from '#bambu-studio/types.js';

/**
 * Milliseconds every slice may run. A 20 mm cube slices in about 0.6 s; a small file filling the build
 * volume took 25 s at load 120, so the floor keeps several times that.
 */
const sliceTimeoutFloor = 120_000;
/** Milliseconds added per MiB of STL (about 21,000 triangles). */
const sliceTimeoutPerMebibyte = 60_000;
/** Characters of Bambu Studio's log kept for a failure message. */
const logTail = 2000;
const hexColor = /^#[\dA-F]{6}$/iu;
/** Bambu Studio's `CLI_GCODE_PATH_CONFLICTS`: the sliced paths of two objects, such as the prime tower, collide. */
const pathConflict = -101;
/** Millimetres kept between a moved assembly and the printed tower or an excluded area. */
const towerClearance = 3;

type ResultReport = Readonly<{
  return_code?: number;
  error_string?: string;
  sliced_plates?: ReadonlyArray<
    Readonly<{
      total_predication?: number;
      filaments?: ReadonlyArray<Readonly<{ total_used_g?: number }>>;
    }>
  >;
}>;

// A resolved preset as the command line loads it: flat, named and selectable.
// A user printer preset is compatible wherever its system parent is, but the
// command line checks `compatible_printers` by name, so process and filament
// presets also list the selected printer.
const forCommandLine = (values: BambuPresetValues, name: string, printer?: string): BambuPresetValues => {
  const compatible: readonly unknown[] = Array.isArray(values['compatible_printers'])
    ? values['compatible_printers']
    : [];
  return {
    ...values,
    name,
    from: 'system',
    instantiation: 'true',
    ...(printer !== undefined && compatible.length > 0 && !compatible.includes(printer)
      ? // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu Studio preset key.
        { compatible_printers: [...compatible, printer] }
      : {}),
  };
};

// Settings are one map with no slot address, validated against the process
// and the first filament, which is what `describeBambuStudioSettings`
// describes. A filament setting then applies to every used filament whose
// preset has that key, encoded in that preset's own shape; a filament whose
// preset lacks the key keeps Bambu Studio's default for it.
const applySettings = (
  process: BambuPresetValues,
  filaments: readonly BambuPresetValues[],
  settings: BambuStudioSelection['settings'],
): { process: BambuPresetValues; filaments: BambuPresetValues[] } => {
  if (settings === undefined || Object.keys(settings).length === 0) {
    return { process, filaments: [...filaments] };
  }
  const [first = {}, ...rest] = filaments;
  try {
    const encoded = encodeBambuSettings(settings, { process, filament: first });
    const filamentKeys = Object.keys(encoded.filament);
    return {
      process: { ...process, ...encoded.process },
      filaments: [
        { ...first, ...encoded.filament },
        ...rest.map((filament) => {
          const owned = Object.fromEntries(
            filamentKeys.filter((key) => key in filament).map((key) => [key, settings[key]]),
          );
          return { ...filament, ...encodeBambuSettings(owned, { process, filament }).filament };
        }),
      ],
    };
  } catch (error) {
    // The option catalog throws TypeError or RangeError for a setting it cannot encode.
    throw new BambuStudioError(
      'BAMBU_STUDIO_SETTINGS_INVALID',
      error instanceof Error ? error.message : String(error),
      {
        cause: error,
      },
    );
  }
};

// ponytail: linear in STL size, which covers mesh work; a per-layer term if tall, dense prints outgrow it.
const sliceTimeoutFor = (parts: BambuStudioSliceInput['parts']): number => {
  let bytes = 0;
  for (const { stl } of parts) {
    bytes += stl.byteLength;
  }
  return sliceTimeoutFloor + Math.round((bytes / 2 ** 20) * sliceTimeoutPerMebibyte);
};

const describeDuration = (milliseconds: number): string => {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} minutes`;
};

const run = async (
  executable: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; signal: AbortSignal; sliceTimeout: number }>,
): Promise<{ code?: number; log: string }> => {
  const deadline = AbortSignal.timeout(options.sliceTimeout);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      signal: AbortSignal.any([options.signal, deadline]),
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let log = '';
    let failure: Error | undefined;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      log = (log + chunk).slice(-logTail);
    });
    child.on('error', (error) => {
      const reason: unknown = options.signal.reason;
      failure = options.signal.aborted
        ? reason instanceof Error
          ? reason
          : new Error(String(reason))
        : deadline.aborted
          ? new BambuStudioError(
              'BAMBU_STUDIO_TIMEOUT',
              `Bambu Studio did not finish slicing within ${describeDuration(options.sliceTimeout)} and was stopped. ` +
                'Slice again; if it stops again, lower the model’s mesh resolution or close other busy apps first.',
            )
          : new BambuStudioError('BAMBU_STUDIO_SLICE_FAILED', `Bambu Studio could not start: ${error.message}`, {
              cause: error,
            });
      // A process that never started emits no `close`.
      if (child.pid === undefined) {
        reject(failure);
      }
    });
    // Settle on `close` so the directory is removed only after the process is gone.
    child.on('close', (code) => {
      if (failure === undefined) {
        resolve({ ...(code === null ? {} : { code }), log });
      } else {
        reject(failure);
      }
    });
  });
};

let queue: Promise<void> = Promise.resolve();

// A single part slices exactly as a one-material model always has. Several parts slice as one
// assembled object, so they keep their placement: without `--assemble` each is arranged on its own,
// and without arranging the assembly stays at its model coordinates, where Bambu Studio refuses the
// X1C's front-left exclusion area. Each part names its filament, and the colour list always has one
// entry per part: Bambu Studio 02.08.02.61 crashes on an assembly with fewer, and fills an empty entry
// with its own default.
const partArguments = (parts: BambuStudioSliceInput['parts']): string[] => {
  const [first] = parts;
  if (parts.length === 1) {
    return first?.color === undefined ? [] : ['--filament-colour', first.color];
  }
  return [
    '--load-filament-ids',
    parts.map((_, index) => index + 1).join(','),
    '--assemble',
    '--filament-colour',
    parts.map(({ color }) => color ?? '').join(';'),
  ];
};

// The selection's plate, after refusing a slice Bambu Studio could not run.
const checkedPlate = ({ selection, parts }: Pick<BambuStudioSliceInput, 'selection' | 'parts'>) => {
  const plate = bambuPlates.find(({ id }) => id === selection.plate);
  if (plate === undefined || selection.filaments.length === 0) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_PRESET_NOT_FOUND',
      plate === undefined ? `Bambu Studio has no plate "${selection.plate}".` : 'A slice needs at least one filament.',
    );
  }
  if (parts.length === 0) {
    throw new BambuStudioError('BAMBU_STUDIO_SLICE_FAILED', 'A slice needs at least one part.');
  }
  const unreadable = parts.find(({ color }) => color !== undefined && !hexColor.test(color));
  if (unreadable !== undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_SETTINGS_INVALID',
      `The filament colour "${unreadable.color}" is not #RRGGBB.`,
    );
  }
  return plate;
};

type PlateMeasurement = Readonly<{ tower: PlateRect; arranged: PlateRect; towerX: unknown; towerY: unknown }>;

const boxRect = ([minX = 0, minY = 0, maxX = 0, maxY = 0]: readonly number[]): PlateRect => ({
  minX,
  minY,
  maxX,
  maxY,
});

// The printed tower, the arranged objects' bounds and the tower origin, from an export sliced with checks off.
const measurePlate = (archive: Uint8Array<ArrayBuffer>): PlateMeasurement | undefined => {
  const files = unzipSync(archive, {
    filter: ({ name }) => name === 'Metadata/plate_1.json' || name === 'Metadata/project_settings.config',
  });
  const plate = files['Metadata/plate_1.json'];
  const config = files['Metadata/project_settings.config'];
  if (plate === undefined || config === undefined) {
    return undefined;
  }
  const { bbox_objects: boxes = [] } = JSON.parse(strFromU8(plate)) as {
    bbox_objects?: ReadonlyArray<Readonly<{ name?: string; bbox?: readonly number[] }>>;
  };
  const tower = boxes.find(({ name }) => name === 'wipe_tower')?.bbox;
  const objects = boxes.filter(({ name }) => name !== 'wipe_tower').map(({ bbox = [] }) => boxRect(bbox));
  const settings = JSON.parse(strFromU8(config)) as Record<string, unknown>;
  return tower === undefined || objects.length === 0
    ? undefined
    : {
        tower: boxRect(tower),
        arranged: unionRect(objects),
        towerX: settings['wipe_tower_x'],
        towerY: settings['wipe_tower_y'],
      };
};

const readMeasurement = async (
  archive: string,
  report: ResultReport | undefined,
): Promise<PlateMeasurement | undefined> =>
  report?.return_code === 0 ? measurePlate(Uint8Array.from(await readFile(archive))) : undefined;

// Where the assembly moves and where the tower stays, or nothing when the plate could not be measured.
const moveClearOfTower = (
  measurement: PlateMeasurement | undefined,
  machine: BambuPresetValues,
  { parts, printer }: Readonly<{ parts: BambuStudioSliceInput['parts']; printer: string }>,
): Readonly<{ dx: number; dy: number; towerX: unknown; towerY: unknown }> | undefined => {
  const bed = presetRect(machine['printable_area']);
  if (measurement === undefined || bed === undefined) {
    return undefined;
  }
  const excluded = presetRect(machine['bed_exclude_area']);
  const move = placeClearOfTower({
    bed,
    exclusions: excluded === undefined ? [] : [excluded],
    tower: measurement.tower,
    arranged: measurement.arranged,
    footprint: unionRect(parts.map(({ stl }) => stlFootprint(stl))),
    clearance: towerClearance,
  });
  if (move === undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_SLICE_FAILED',
      `Bambu Studio could not slice: the model and its prime tower do not fit on the ${printer} plate together. ` +
        'Print fewer colours, scale the model down, or use a printer with a larger plate.',
    );
  }
  return { ...move, towerX: measurement.towerX, towerY: measurement.towerY };
};

const sliceNow = async ({
  install,
  selection,
  parts,
  signal,
}: BambuStudioSliceInput): Promise<BambuStudioSliceResult> => {
  signal.throwIfAborted();
  const plate = checkedPlate({ selection, parts });
  // ponytail: the engine owns the one-preset-per-part default because only it sees both the parts and
  // the presets; a caller that maps each part to a tray passes the presets in part order.
  const filamentNames =
    parts.length === 1
      ? selection.filaments
      : parts.map((_, index) => selection.filaments[index] ?? selection.filaments[0]!);
  const resolved = await resolveBambuSelectionPresets(install, { ...selection, filaments: filamentNames });
  const { process, filaments } = applySettings(resolved.process, resolved.filaments, selection.settings);
  const directory = await mkdtemp(join(tmpdir(), 'tau-bambu-studio-'));
  try {
    const filamentFiles = filaments.map((_, index) => `filament-${index + 1}.json`);
    const partFiles = parts.length === 1 ? ['model.stl'] : parts.map((_, index) => `part-${index + 1}.stl`);
    await Promise.all([
      writeFile(join(directory, 'machine.json'), JSON.stringify(forCommandLine(resolved.machine, selection.printer))),
      writeFile(
        join(directory, 'process.json'),
        JSON.stringify(forCommandLine(process, selection.process, selection.printer)),
      ),
      ...filaments.map(async (filament, index) =>
        writeFile(
          join(directory, filamentFiles[index]!),
          JSON.stringify(forCommandLine(filament, filamentNames[index]!, selection.printer)),
        ),
      ),
      ...parts.map(async ({ stl }, index) => writeFile(join(directory, partFiles[index]!), stl)),
      mkdir(join(directory, 'datadir')),
    ]);
    // Preset lists are relative to the working directory because the command line splits them on `;`,
    // which a temporary directory path could contain; the output directory must be absolute or the export fails.
    const slice = async (
      options: Readonly<{ arrange: boolean; checks: boolean }>,
    ): Promise<{ report?: ResultReport; code?: number; log: string }> => {
      await rm(join(directory, 'out'), { recursive: true, force: true });
      await mkdir(join(directory, 'out'));
      const { code, log } = await run(
        install.executable,
        [
          '--datadir',
          join(directory, 'datadir'),
          // Bambu Studio 02.08.02.61 still checks a slice when `--no-check` comes after `--slice`.
          ...(options.checks ? [] : ['--no-check']),
          '--slice',
          '0',
          '--arrange',
          options.arrange ? '1' : '0',
          '--curr-bed-type',
          plate.bambuName,
          '--load-settings',
          'machine.json;process.json',
          '--load-filaments',
          filamentFiles.join(';'),
          // The project's filament colours come from the command line; filament presets carry none.
          ...partArguments(parts),
          '--outputdir',
          join(directory, 'out'),
          '--export-3mf',
          'model.gcode.3mf',
          ...partFiles.map((file) => join(directory, file)),
        ],
        { cwd: directory, signal, sliceTimeout: sliceTimeoutFor(parts) },
      );
      try {
        return {
          report: JSON.parse(await readFile(join(directory, 'out', 'result.json'), 'utf8')) as ResultReport,
          code,
          log,
        };
      } catch {
        return { code, log };
      }
    };
    let { report, code, log } = await slice({ arrange: true, checks: true });
    // Bambu Studio arranges a multi-colour assembly against an estimate of its prime tower that is smaller
    // than the tower it prints, and then refuses its own plate. Measure the printed tower with checks off,
    // move the assembly clear of it, keep the tower where it was, and slice again with checks on.
    if (report?.return_code === pathConflict) {
      const measured = await slice({ arrange: true, checks: false });
      const measurement = await readMeasurement(join(directory, 'out', 'model.gcode.3mf'), measured.report);
      // Without a measured tower or a known bed, Bambu Studio's own conflict message stands.
      const move = moveClearOfTower(measurement, resolved.machine, { parts, printer: selection.printer });
      if (move !== undefined) {
        await Promise.all([
          writeFile(
            join(directory, 'process.json'),
            JSON.stringify({
              ...forCommandLine(process, selection.process, selection.printer),
              // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu Studio preset key.
              wipe_tower_x: move.towerX,
              // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu Studio preset key.
              wipe_tower_y: move.towerY,
            }),
          ),
          ...parts.map(async ({ stl }, index) =>
            writeFile(join(directory, partFiles[index]!), moveStl(stl, move.dx, move.dy)),
          ),
        ]);
        ({ report, code, log } = await slice({ arrange: false, checks: true }));
      }
    }
    if (report?.return_code !== 0) {
      throw new BambuStudioError(
        'BAMBU_STUDIO_SLICE_FAILED',
        report?.error_string
          ? `Bambu Studio could not slice: ${report.error_string}`
          : `Bambu Studio exited with code ${code ?? 'none'} without a result.${log ? ` ${log.trim()}` : ''}`,
      );
    }
    const archive = Uint8Array.from(await readFile(join(directory, 'out', 'model.gcode.3mf')));
    const [plateReport] = report.sliced_plates ?? [];
    const weights = (plateReport?.filaments ?? []).map(({ total_used_g }) => total_used_g ?? 0);
    return {
      archive,
      version: install.version,
      presets: { printer: selection.printer, process: selection.process, filaments: filamentNames },
      result: {
        returnCode: report.return_code,
        errorString: report.error_string ?? '',
        ...(plateReport?.total_predication === undefined ? {} : { predictionSeconds: plateReport.total_predication }),
        ...(weights.length === 0 ? {} : { weightGrams: weights.reduce((sum, weight) => sum + weight, 0) }),
      },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/**
 * Slice a model's parts with the person's Bambu Studio and return its archive untouched.
 *
 * One part slices as one object. Several slice as one assembled object that keeps the parts where
 * the model places them, part *i* printed with filament *i* and recorded in its colour. When Bambu Studio
 * arranges an assembly into its own prime tower, the slice is measured with checks off and repeated with
 * the assembly moved the shortest way clear of the printed tower, inside the bed and its excluded areas.
 * Presets are
 * resolved (`inherits`, then `include`, then own keys), setting overrides applied last, and the
 * command line runs in a temporary directory with its own data directory. Slices run one at a time
 * per process; the signal stops Bambu Studio, and so does a deadline of two minutes plus one minute per
 * MiB of STL, counted from the moment each Bambu Studio run starts.
 *
 * @param input - Install, selection, the parts as STL in millimetres and the caller's signal.
 * @returns Bambu Studio's `.gcode.3mf`, its version, the presets it loaded and its result report.
 * @throws BambuStudioError - `BAMBU_STUDIO_SLICE_FAILED` with Bambu Studio's message, for no parts, or
 * when an assembly and its prime tower do not fit on the plate together,
 * `BAMBU_STUDIO_TIMEOUT` when Bambu Studio runs past the deadline and is stopped (slicing again usually
 * succeeds), `BAMBU_STUDIO_SETTINGS_INVALID` for a setting the option catalog cannot encode or a colour
 * that is not `#RRGGBB`, or `BAMBU_STUDIO_PRESET_NOT_FOUND`.
 * @public
 * @example <caption>Slice with the default presets for an X1 Carbon</caption>
 * ```typescript
 * import { readFile } from 'node:fs/promises';
 *
 * import {
 *   findBambuStudio,
 *   loadBambuStudioCatalog,
 *   resolveBambuStudioSelection,
 *   sliceWithBambuStudio,
 * } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * if (install) {
 *   const catalog = await loadBambuStudioCatalog(install, { model: 'X1C' });
 *   const selection = resolveBambuStudioSelection(catalog, { model: 'X1C', materials: [] });
 *   const { archive } = await sliceWithBambuStudio({
 *     install,
 *     selection,
 *     parts: [{ stl: Uint8Array.from(await readFile('part.stl')) }],
 *     signal: AbortSignal.timeout(600_000),
 *   });
 * }
 * ```
 * @example <caption>Slice a red base with a blue logo standing on it, one filament each</caption>
 * ```typescript
 * import { readFile } from 'node:fs/promises';
 *
 * import {
 *   findBambuStudio,
 *   loadBambuStudioCatalog,
 *   resolveBambuStudioSelection,
 *   sliceWithBambuStudio,
 * } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * if (install) {
 *   const catalog = await loadBambuStudioCatalog(install, { model: 'X1C' });
 *   const selection = resolveBambuStudioSelection(catalog, { model: 'X1C', materials: [] });
 *   const { archive } = await sliceWithBambuStudio({
 *     install,
 *     selection,
 *     parts: [
 *       { stl: Uint8Array.from(await readFile('base.stl')), color: '#C12E1F' },
 *       { stl: Uint8Array.from(await readFile('logo.stl')), color: '#0A2989' },
 *     ],
 *     signal: AbortSignal.timeout(600_000),
 *   });
 * }
 * ```
 */
export const sliceWithBambuStudio = async (input: BambuStudioSliceInput): Promise<BambuStudioSliceResult> => {
  // ponytail: one slice at a time per process; a pool when several slices must overlap.
  const previous = queue;
  let release = (): void => undefined;
  queue = new Promise((resolve) => {
    release = resolve;
  });
  const { promise: aborted, resolve } = Promise.withResolvers<void>();
  const onAbort = (): void => {
    resolve();
  };
  input.signal.addEventListener('abort', onAbort, { once: true });
  if (input.signal.aborted) {
    onAbort();
  }
  try {
    await Promise.race([previous, aborted]);
    input.signal.throwIfAborted();
    return await sliceNow(input);
  } finally {
    input.signal.removeEventListener('abort', onAbort);
    // Cancellation acknowledges immediately, but the next request must still wait for the running predecessor.
    // async-iife: bootstrap — Queued cancellation acknowledges immediately; admission waits for the running predecessor.
    // oxlint-disable-next-line promise/prefer-await-to-then -- Awaiting would delay the cancellation acknowledgement.
    void previous.then(release, release);
  }
};
