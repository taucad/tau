/**
 * Build plates the printer simulation draws, and the plate a file was sliced for.
 *
 * `PrinterPlateModel` is the seam for the exact plate models `@taucad/bambu`
 * will publish: until a plate carries `model`, the scene draws a flat plate in
 * its colour and finish. A GLB follows glTF (Y-up metres); the scene maps it
 * into the plate frame (millimetres, X right, Y back, Z up, origin at the
 * printable area's front-left corner, Z = 0 on the print surface).
 *
 * @module
 */

import { Matrix4 } from 'three';
import { resolveCoordinateTransform } from '@taucad/spatial';
import { canonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

/* oxlint-disable tau-lint/no-hardcoded-color -- Three.js material tints for physical plate surfaces */

/** One X1C build plate id, as Tau's slicers name it. */
export type PrinterPlateId = 'cool' | 'engineering' | 'high-temperature' | 'textured-pei';

/** A build plate the scene can draw. */
export type PrinterPlateModel = Readonly<{
  id: PrinterPlateId;
  label: string;
  /** Every name a slicer records for this plate: Bambu Studio's `curr_bed_type` and `plate_1.json` values, and Tau's id. */
  bedTypeNames: readonly string[];
  /** `#RRGGBB` of the print surface. */
  color: string;
  /** How the flat stand-in reflects light until the model arrives. */
  finish: 'smooth' | 'matte' | 'textured';
  /** Pre-rendered GLB of the plate; absent until the plate lane publishes it. */
  model?: URL;
}>;

// ponytail: colours and finishes are placeholders pending the plate lane's exact Replicad models.
/** The four plates Bambu Lab ships for the X1 series. */
export const x1cPlates: readonly PrinterPlateModel[] = [
  {
    id: 'cool',
    label: 'Cool Plate',
    bedTypeNames: ['Cool Plate', 'cool_plate', 'cool'],
    color: '#2e3034',
    finish: 'smooth',
  },
  {
    id: 'engineering',
    label: 'Engineering Plate',
    bedTypeNames: ['Engineering Plate', 'eng_plate', 'engineering'],
    color: '#44474d',
    finish: 'matte',
  },
  {
    id: 'high-temperature',
    label: 'High Temp Plate',
    bedTypeNames: ['High Temp Plate', 'hot_plate', 'high-temperature'],
    color: '#1f2023',
    finish: 'smooth',
  },
  {
    id: 'textured-pei',
    label: 'Textured PEI Plate',
    bedTypeNames: ['Textured PEI Plate', 'textured_plate', 'textured-pei'],
    color: '#b88a4a',
    finish: 'textured',
  },
];

/** The plate frame: Z up, the printer's front toward -Y, millimetres. */
const plateFrame = { up: '+z', forward: '-y', metersPerUnit: 0.001 } as const;

/**
 * Places a plate GLB in the plate frame: the one transform from glTF's Y-up
 * metres, resolved the way the CAD viewer maps Tau's own GLBs into its Z-up
 * world, plus metres to millimetres.
 */
export const plateModelMatrix: Readonly<Matrix4> = new Matrix4().fromArray(
  resolveCoordinateTransform({ source: canonicalGltfWorld, target: plateFrame }).matrix,
);

/* oxlint-enable tau-lint/no-hardcoded-color */

/** The plate drawn when a file does not say which one it was sliced for. */
export const defaultPrinterPlate: PrinterPlateModel = x1cPlates.find(({ id }) => id === 'textured-pei')!;

/** The plate with one id. */
export const printerPlateById = (id: PrinterPlateId): PrinterPlateModel =>
  x1cPlates.find((plate) => plate.id === id) ?? defaultPrinterPlate;

/** The plate a recorded bed type names, ignoring case; `undefined` for an unknown or missing name. */
export const plateForBedType = (name: string | undefined): PrinterPlateModel | undefined => {
  const wanted = name?.trim().toLowerCase();
  return wanted
    ? x1cPlates.find(({ bedTypeNames }) => bedTypeNames.some((candidate) => candidate.toLowerCase() === wanted))
    : undefined;
};

/** Bytes at each end of the G-code searched for the setting: Bambu Studio writes its config block first, Orca last. */
const configScanBytes = 64 * 1024;
const bedTypeSetting = /^;\s*curr_bed_type\s*=\s*(.+?)\s*$/mu;

/**
 * The `; curr_bed_type = …` setting from a slicer's config block, read from
 * the first and last 64 KiB of the G-code only.
 *
 * @param gcode - The plate G-code.
 * @returns The recorded plate name, or `undefined` when neither end states one.
 */
export const readGcodeBedType = (gcode: Uint8Array<ArrayBuffer>): string | undefined => {
  const decoder = new TextDecoder();
  const head = decoder.decode(gcode.subarray(0, configScanBytes));
  const tail = gcode.byteLength > configScanBytes ? decoder.decode(gcode.subarray(-configScanBytes)) : '';
  return (bedTypeSetting.exec(head) ?? bedTypeSetting.exec(tail))?.[1];
};
