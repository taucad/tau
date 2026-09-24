import { readBambuContainer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import type { MachineManifest } from '@taucad/runtime/machine';
import type { Quantity } from '@taucad/units/quantity';

/** Axis-aligned bounds in millimetres, plate origin front-left. @public */
export type SliceBounds = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

/** What one sliced artifact says about itself, read from its own toolpath. @public */
export type SliceSummary = Readonly<{
  layers: number;
  /** Seconds. */
  estimatedDuration: number;
  /** Millimetres of filament. */
  filamentLength: number;
  bounds: SliceBounds;
  /** False when the parser met motion it could not time; the numbers are then a floor. */
  coverageComplete: boolean;
}>;

/**
 * Read the plate G-code out of a `.gcode.3mf` container and time it.
 *
 * @param bytes - The container the slicer produced.
 * @returns The summary the Prepare step shows before anything is sent.
 * @public
 */
export const summarizeGcodeContainer = (bytes: Uint8Array<ArrayBuffer>): SliceSummary => {
  const container = readBambuContainer(bytes);
  const program = parseGcode(container.gcode);
  return {
    layers: program.layerTable.length,
    estimatedDuration: program.duration,
    filamentLength: program.filamentLength,
    bounds: program.bounds,
    coverageComplete: program.coverage.complete,
  };
};

const axes = ['X', 'Y', 'Z'] as const;

/** Why a part does not fit, or nothing when it does. @public */
export type BuildVolumeFit =
  | Readonly<{ fits: true }>
  | Readonly<{ fits: false; axis: 'X' | 'Y' | 'Z'; reason: string }>;

/**
 * Compare toolpath bounds with the machine's build volume.
 *
 * @param bounds - Toolpath bounds in millimetres from the plate origin.
 * @param buildVolume - The manifest's build volume in millimetres.
 * @returns Whether every axis stays inside the volume, naming the first one that does not.
 * @public
 */
export const fitsBuildVolume = (
  bounds: SliceBounds,
  buildVolume: MachineManifest['geometry']['buildVolume'],
): BuildVolumeFit => {
  const limits = [buildVolume.x, buildVolume.y, buildVolume.z] as const;
  for (const [index, axis] of axes.entries()) {
    const min = bounds.min[index]!;
    const max = bounds.max[index]!;
    const limit = limits[index]!;
    if (min < 0) {
      return { fits: false, axis, reason: `${formatMillimetres(-min)} mm past the plate edge on ${axis}` };
    }
    if (max > limit) {
      return {
        fits: false,
        axis,
        reason: `${formatMillimetres(max)} mm is larger than the ${formatMillimetres(limit)} mm plate on ${axis}`,
      };
    }
  }
  return { fits: true };
};

/**
 * Millimetres with at most one decimal, no trailing zero.
 *
 * @param value - Millimetres.
 * @returns The formatted number without a unit.
 * @public
 */
export const formatMillimetres = (value: number): string => String(Math.round(value * 10) / 10);

/**
 * Human duration: "about 42 min", "about 1 h 5 min", "under a minute".
 *
 * @param seconds - A duration.
 * @returns Plain copy for hobbyist orientation.
 * @public
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return 'under a minute';
  }
  if (minutes < 60) {
    return `about ${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `about ${String(hours)} h` : `about ${String(hours)} h ${String(rest)} min`;
};

/**
 * Remaining time as the monitor states it: "9 min left".
 *
 * @param seconds - Seconds remaining.
 * @returns Plain copy.
 * @public
 */
export const formatRemaining = (seconds: number): string => {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} min left`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h left` : `${String(hours)} h ${String(rest)} min left`;
};

/**
 * Filament length in metres for short parts and kilometres never.
 *
 * @param millimetres - Filament length.
 * @returns "3.2 m" or "420 mm".
 * @public
 */
export const formatFilament = (millimetres: number): string =>
  millimetres >= 1000 ? `${(millimetres / 1000).toFixed(1)} m` : `${String(Math.round(millimetres))} mm`;

const unitSymbols: ReadonlyMap<string, string> = new Map([
  ['Cel', '°C'],
  ['mm', 'mm'],
  ['m', 'm'],
  ['%', '%'],
]);

/** A snapshot quantity or a manifest quantity: both carry a value and a UCUM unit code. @public */
export type PrintQuantity = Quantity | Readonly<{ value: number; unit: string }>;

/**
 * A native quantity in its own unit, rounded for reading: "215 °C", "0.4 mm".
 *
 * @param quantity - Any admitted quantity.
 * @returns The value and its unit symbol.
 * @public
 */
export const formatQuantity = (quantity: PrintQuantity): string => {
  const code = typeof quantity.unit === 'string' ? quantity.unit : quantity.unit.code;
  const value = typeof quantity.value === 'number' ? Math.round(quantity.value * 100) / 100 : quantity.value;
  return `${String(value)} ${unitSymbols.get(code) ?? code}`;
};

/**
 * How long ago a timestamp was, against a supplied clock: "12 s ago", "3 min ago", "2 h ago".
 *
 * @param timestamp - An ISO timestamp.
 * @param now - Milliseconds since the epoch.
 * @returns Plain copy that ticks with `now`.
 * @public
 */
export const formatAge = (timestamp: string, now: number): string => {
  const seconds = Math.max(0, Math.round((now - Date.parse(timestamp)) / 1000));
  if (seconds < 60) {
    return `${String(seconds)} s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} min ago`;
  }
  return `${String(Math.floor(minutes / 60))} h ago`;
};

/**
 * A digest shortened for reading, keeping the algorithm and enough hex to compare.
 *
 * @param digest - A `sha256:` digest.
 * @returns "sha256:ab12cd34…".
 * @public
 */
export const shortDigest = (digest: string): string => {
  const [algorithm, hex] = digest.split(':', 2);
  return hex === undefined ? digest : `${algorithm ?? ''}:${hex.slice(0, 8)}…`;
};

/**
 * The material slot as the printer labels it: unit letter plus slot number ("A1").
 *
 * @param slot - The zero-based protocol slot.
 * @param manifest - The machine's material system, when known.
 * @returns "A1" for a multi-unit system, "Slot 1" otherwise.
 * @public
 */
export const materialSlotLabel = (slot: number, manifest: MachineManifest | undefined): string => {
  const slotsPerUnit = manifest?.materialSystem.slotsPerUnit ?? 0;
  if (slotsPerUnit <= 0) {
    return `Slot ${String(slot + 1)}`;
  }
  const unit = Math.floor(slot / slotsPerUnit);
  return `${String.fromCodePoint(65 + unit)}${String((slot % slotsPerUnit) + 1)}`;
};
