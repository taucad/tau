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
import { bambuA1MiniHotend, bambuA1MiniPlates, bambuX1cHotend, bambuX1cPlates } from '@taucad/bambu/plate';
import type { BambuPlateModel } from '@taucad/bambu/plate';
import { canonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

/** One Bambu build plate id, as Tau's slicers name it. */
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
  /** Physical source-frame extent, including coating and tabs. */
  bounds: BambuPlateModel['bounds'];
}>;

/** Map package descriptors into the viewer's existing surface contract. */
const viewerPlate = ({ id, label, bedTypeNames, surface, model, bounds }: BambuPlateModel): PrinterPlateModel => ({
  id,
  label,
  bedTypeNames,
  color: surface.color,
  finish: surface.finish,
  model,
  bounds,
});

/** The four X1C plates. */
export const x1cPlates: readonly PrinterPlateModel[] = bambuX1cPlates.map((plate) => viewerPlate(plate));
/** Mini has its own outline and two supported surfaces. */
export const a1MiniPlates: readonly PrinterPlateModel[] = bambuA1MiniPlates.map((plate) => viewerPlate(plate));

/** Only hardware matching the selected model is offered. */
export const printerPlatesForModel = (model: string | undefined): readonly PrinterPlateModel[] =>
  model === 'a1-mini' ? a1MiniPlates : model === 'x1c' || model === undefined ? x1cPlates : [];

/** Resolve an asset by both plate kind and printer identity. */
export const printerPlateModelForMachine = (plate: PrinterPlateModel, model: string | undefined): URL | undefined =>
  model === undefined ? undefined : printerPlatesForModel(model).find(({ id }) => id === plate.id)?.model;

/** The X1C hotend tip drawn at the extruding nozzle: its origin is the nozzle tip. */
export const printerHotendModel: URL = bambuX1cHotend.model;
/** Installed hotend for one recognized machine; an unknown machine keeps the schematic fallback. */
export const printerHotendForModel = (model: string | undefined): URL | undefined =>
  model === 'a1-mini' ? bambuA1MiniHotend.model : model === 'x1c' ? printerHotendModel : undefined;

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
    ? [...x1cPlates, ...a1MiniPlates].find(({ bedTypeNames }) =>
        bedTypeNames.some((candidate) => candidate.toLowerCase() === wanted),
      )
    : undefined;
};
