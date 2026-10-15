/**
 * Pre-rendered Bambu Lab X1-Carbon and A1 mini build plates and hotend tips.
 *
 * Each model is a binary glTF rendered by Tau's Replicad pipeline from the
 * independently authored sources in `packages/plugins/bambu/models`. The GLBs follow
 * glTF: Y-up, metres. Their source frame (the "plate frame") is millimetres,
 * X right, Y toward the rear, Z up, with the origin at the printable area's
 * front-left corner and Z = 0 on the plate's print surface. Map a loaded GLB
 * into that frame with one transform: rotate +90° about X, then scale by
 * `modelUnitScale`.
 *
 * In three.js: `object.rotation.x = Math.PI / 2; object.scale.setScalar(1000)`.
 * For the hotend, whose tip is its origin, then set `object.position` to the
 * toolpath point.
 *
 * @module
 */

/** Tau's id for a build plate, matching the FFF process's `bed.plates` in `bambuX1cManifest` and `bambuA1MiniManifest`. @public */
export type BambuPlateId = 'cool' | 'engineering' | 'high-temperature' | 'textured-pei';

/** Axis-aligned bounds in millimetres of the model's source frame. @public */
export type BambuModelBounds = Readonly<{
  min: readonly [x: number, y: number, z: number];
  max: readonly [x: number, y: number, z: number];
}>;

/**
 * A pre-rendered GLB and the transform that maps it into its source frame.
 * @public
 */
export type BambuModelAsset = Readonly<{
  /** Binary glTF, resolved beside this module. */
  model: URL;
  /** The GLB is glTF Y-up: model (x, y, z) is source-frame (x, -z, y), so rotate +90° about X. */
  modelAxes: 'gltf-y-up';
  /** Multiply model units (metres) by this to get source-frame millimetres. */
  modelUnitScale: 1000;
  /** Geometry bounds in source-frame millimetres. */
  bounds: BambuModelBounds;
}>;

/**
 * One model-specific Bambu build plate.
 *
 * The source frame is the plate frame: millimetres, X right, Y toward the
 * rear, Z up; origin at the printable area's front-left corner; Z = 0 on the
 * print surface with the plate below it. Printed markings are faces up to
 * 0.04 mm above Z = 0.
 * @public
 */
export type BambuPlateModel = BambuModelAsset &
  Readonly<{
    id: BambuPlateId;
    printer: 'x1c' | 'a1-mini';
    /** Bambu Studio's name for the plate. */
    label: string;
    /**
     * Every name a sliced file may carry for this plate: the `curr_bed_type`
     * string, the `plate_N.json` `bed_type` value, and the Tau id.
     */
    bedTypeNames: readonly string[];
    /** The print surface as a viewer's flat stand-in would draw it. */
    surface: Readonly<{ color: string; finish: 'smooth' | 'matte' | 'textured' }>;
  }>;

/**
 * A model-specific hotend tip: silicone sock and nozzle.
 *
 * Source frame: millimetres, X right, Y toward the rear, Z up, with the
 * nozzle tip's flat at the origin, so placing the model at a toolpath point
 * puts the tip on it.
 * @public
 */
export type BambuHotendModel = BambuModelAsset &
  Readonly<{
    printer: 'x1c' | 'a1-mini';
    label: string;
    /** Nozzle tip in the source frame. */
    tip: readonly [x: number, y: number, z: number];
  }>;

const plateBounds = (thickness: number): BambuModelBounds => ({
  min: [-0.5, -10.5, -thickness],
  max: [256.5, 264.5, 0.04],
});

/*
 * `new URL` with a literal keeps each asset visible to bundlers; the published
 * package copies `src/assets` beside this module.
 */

/** The four X1C build plates, in `bambuX1cManifest` order. @public */
export const bambuX1cPlates: readonly BambuPlateModel[] = [
  {
    id: 'cool',
    printer: 'x1c',
    label: 'Cool Plate',
    bedTypeNames: ['Cool Plate', 'cool_plate', 'cool'],
    surface: { color: '#2F3030', finish: 'smooth' },
    model: new URL('assets/x1c-cool.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: plateBounds(0.8),
  },
  {
    id: 'engineering',
    printer: 'x1c',
    label: 'Engineering Plate',
    bedTypeNames: ['Engineering Plate', 'eng_plate', 'engineering'],
    surface: { color: '#2B2C2F', finish: 'smooth' },
    model: new URL('assets/x1c-engineering.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: plateBounds(0.5),
  },
  {
    id: 'high-temperature',
    printer: 'x1c',
    label: 'High Temp Plate',
    bedTypeNames: ['High Temp Plate', 'hot_plate', 'high-temperature'],
    surface: { color: '#282A2E', finish: 'matte' },
    model: new URL('assets/x1c-high-temperature.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: plateBounds(0.85),
  },
  {
    id: 'textured-pei',
    printer: 'x1c',
    label: 'Textured PEI Plate',
    bedTypeNames: ['Textured PEI Plate', 'textured_plate', 'textured-pei'],
    surface: { color: '#C4A168', finish: 'textured' },
    model: new URL('assets/x1c-textured-pei.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: plateBounds(0.65),
  },
];

/** The two A1 mini plates, in manifest order, in the same printable frame as X1C. @public */
export const bambuA1MiniPlates: readonly BambuPlateModel[] = [
  {
    id: 'high-temperature',
    printer: 'a1-mini',
    label: 'Smooth PEI Plate',
    bedTypeNames: ['High Temp Plate', 'Smooth PEI Plate', 'hot_plate', 'high-temperature'],
    surface: { color: '#282A2E', finish: 'matte' },
    model: new URL('assets/a1-mini-high-temperature.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: { min: [-2, -9.132, -0.75], max: [182, 187.999, 0.04] },
  },
  {
    id: 'textured-pei',
    printer: 'a1-mini',
    label: 'Textured PEI Plate',
    bedTypeNames: ['Textured PEI Plate', 'textured_plate', 'textured-pei'],
    surface: { color: '#C4A168', finish: 'textured' },
    model: new URL('assets/a1-mini-textured-pei.glb', import.meta.url),
    modelAxes: 'gltf-y-up',
    modelUnitScale: 1000,
    bounds: { min: [-2, -9.132, -0.55], max: [182, 187.999, 0.04] },
  },
];

/** A1 mini installed silicone sock and stainless nozzle; dimensions from service imagery. @public */
export const bambuA1MiniHotend: BambuHotendModel = {
  printer: 'a1-mini',
  label: 'A1 mini hotend',
  model: new URL('assets/a1-mini-hotend.glb', import.meta.url),
  modelAxes: 'gltf-y-up',
  modelUnitScale: 1000,
  bounds: { min: [-8, -7.02, 0], max: [7, 7, 24] },
  tip: [0, 0, 0],
};

/** The X1C hotend tip the printer viewer draws at the extruding nozzle. @public */
export const bambuX1cHotend: BambuHotendModel = {
  printer: 'x1c',
  label: 'X1C hotend',
  model: new URL('assets/x1c-hotend.glb', import.meta.url),
  modelAxes: 'gltf-y-up',
  modelUnitScale: 1000,
  bounds: { min: [-7.6, -7, 0], max: [7.6, 7, 21.8] },
  tip: [0, 0, 0],
};

/**
 * Finds the plate a sliced file names.
 *
 * @param name - A `curr_bed_type` string, a `plate_N.json` `bed_type` value or a Tau plate id.
 * @param printer - The printer family to look in; without it the X1C's plates are tried before the A1 mini's, so a
 * name both share (`hot_plate`) resolves to the X1C's model.
 * @returns The plate, or `undefined` for a plate this package does not model.
 * @public
 *
 * @example <caption>Resolve the plate recorded in a Bambu Studio 3MF</caption>
 * ```typescript
 * import { bambuPlateForBedType } from '@taucad/bambu/plate';
 *
 * const plate = bambuPlateForBedType('hot_plate'); // the High Temp Plate
 * ```
 */
export const bambuPlateForBedType = (
  name: string,
  printer?: BambuPlateModel['printer'],
): BambuPlateModel | undefined => {
  const trimmed = name.trim().toLowerCase();
  return [...bambuX1cPlates, ...bambuA1MiniPlates].find(
    (plate) =>
      (printer === undefined || plate.printer === printer) &&
      plate.bedTypeNames.some((candidate) => candidate.toLowerCase() === trimmed),
  );
};
