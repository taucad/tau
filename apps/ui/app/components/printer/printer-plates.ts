/**
 * Build plates the printer simulation draws, and the plate a file was sliced for.
 *
 * The plates are `@taucad/bambu`'s Replicad models, pre-rendered to GLB;
 * while one loads, or if it cannot, the scene draws a flat plate in its
 * colour and finish. A GLB follows glTF (Y-up metres); the scene maps it
 * into the plate frame (millimetres, X right, Y back, Z up, origin at the
 * printable area's front-left corner, Z = 0 on the print surface).
 *
 * @module
 */

import { Matrix4 } from 'three';
import { resolveCoordinateTransform } from '@taucad/spatial';
import { bambuX1cHotend, bambuX1cPlates } from '@taucad/bambu/plate';
import type { BambuPlateModel } from '@taucad/bambu/plate';
import { canonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

/** One X1C build plate id, as Tau's slicers name it. */
export type PrinterPlateId = BambuPlateModel['id'];

/** A build plate the scene can draw. */
export type PrinterPlateModel = Readonly<{
  id: PrinterPlateId;
  label: string;
  /** Every name a slicer records for this plate: Bambu Studio's `curr_bed_type` and `plate_1.json` values, and Tau's id. */
  bedTypeNames: readonly string[];
  /** `#RRGGBB` of the print surface. */
  color: string;
  /** How the flat stand-in reflects light while the model loads, or if it cannot. */
  finish: 'smooth' | 'matte' | 'textured';
  /** Pre-rendered GLB of the plate, authored in Replicad by `@taucad/bambu`. */
  model?: URL;
}>;

/** The four plates Bambu Lab ships for the X1 series, as `@taucad/bambu` models them. */
export const x1cPlates: readonly PrinterPlateModel[] = bambuX1cPlates.map(
  ({ id, label, bedTypeNames, surface, model }) => ({
    id,
    label,
    bedTypeNames,
    color: surface.color,
    finish: surface.finish,
    model,
  }),
);

/** The X1C hotend tip drawn at the extruding nozzle: its origin is the nozzle tip. */
export const printerHotendModel: URL = bambuX1cHotend.model;

/** The plate frame: Z up, the printer's front toward -Y, millimetres. */
const plateFrame = { up: '+z', forward: '-y', metersPerUnit: 0.001 } as const;

/**
 * Places a plate or hotend GLB in the plate frame: the one transform from glTF's Y-up
 * metres, resolved the way the CAD viewer maps Tau's own GLBs into its Z-up
 * world, plus metres to millimetres.
 */
export const plateModelMatrix: Readonly<Matrix4> = new Matrix4().fromArray(
  resolveCoordinateTransform({ source: canonicalGltfWorld, target: plateFrame }).matrix,
);

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
