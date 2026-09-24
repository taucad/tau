/**
 * Transcoder option schema shared by the export pipeline, the Print pane and the agent export tool.
 *
 * @module
 */

import { quantity, quantityKinds } from '@taucad/runtime/transcoder';
import { quantityReferences } from '@taucad/units/quantity';
import { z } from 'zod';

const millimetres = () => quantity({ unit: 'mm', quantityKind: quantityKinds.length, space: 'linear' });
const celsius = () =>
  quantity({
    unit: 'Cel',
    quantityKind: quantityKinds.temperature,
    space: 'point',
    reference: quantityReferences.thermodynamicAbsoluteZero,
  });
const millimetresPerSecond = () => quantity({ unit: 'mm/s', quantityKind: quantityKinds.speed, space: 'linear' });
const percent = () => quantity({ unit: '%', quantityKind: quantityKinds.dimensionlessRatio, space: 'linear' });

/** Layer heights the quality presets select when `layerHeight` is omitted. @public */
export const slicerPresets = Object.freeze({
  fast: Object.freeze({ layerHeight: 0.28 }),
  standard: Object.freeze({ layerHeight: 0.2 }),
  fine: Object.freeze({ layerHeight: 0.12 }),
});

/** Options accepted by the `glb → gcode.3mf` edge. @public */
export const slicerOptionsSchema = z
  .object({
    engine: z
      .enum(['reference', 'service'])
      .default('reference')
      .describe('In-process reference engine or the configured tau-slicer-service companion'),
    preset: z.enum(['fast', 'standard', 'fine']).default('standard').describe('Quality preset; sets the layer height'),
    layerHeight: millimetres().min(0.05).max(0.6).optional().describe('Layer height; defaults from the preset'),
    walls: z.number().int().min(1).max(16).default(2).describe('Perimeter loops per layer'),
    infillPercent: percent().int().min(0).max(100).default(15).describe('Sparse infill density'),
    infillPattern: z.enum(['rectilinear', 'grid']).default('rectilinear').describe('Sparse infill pattern'),
    supports: z.boolean().default(false).describe('Generate support material'),
    nozzleTemperature: celsius().min(150).max(320).default(220).describe('Nozzle temperature'),
    bedTemperature: celsius().min(0).max(120).default(55).describe('Bed temperature'),
    printSpeed: millimetresPerSecond().min(1).max(500).default(100).describe('Extrusion move speed'),
    travelSpeed: millimetresPerSecond().min(1).max(600).default(250).describe('Travel move speed'),
    nozzleDiameter: millimetres().min(0.2).max(1.2).default(0.4).describe('Nozzle diameter'),
    filamentDiameter: millimetres().min(1).max(3).default(1.75).describe('Filament diameter'),
    machineProfile: z.enum(['bambu-x1c']).default('bambu-x1c').describe('Target machine profile'),
    plate: z.string().min(1).max(64).default('textured-pei').describe('Build plate identifier'),
    bedSize: z
      .object({ x: millimetres().min(50).max(1000), y: millimetres().min(50).max(1000) })
      .strict()
      .default({ x: 256, y: 256 })
      .describe('Usable bed size'),
    service: z
      .object({ url: z.url(), token: z.string().min(1).max(512) })
      .strict()
      .optional()
      .describe('Companion service endpoint; honoured only when engine is "service"'),
  })
  .strict();

/** Caller-supplied options before defaults apply. @public */
export type SlicerOptionsInput = z.input<typeof slicerOptionsSchema>;

/** Validated options with defaults applied. @public */
export type SlicerOptions = z.output<typeof slicerOptionsSchema>;

/** Validated options with the preset layer height resolved. @public */
export type ResolvedSlicerOptions = Readonly<Omit<SlicerOptions, 'layerHeight'> & { layerHeight: number }>;

/**
 * Resolve the preset-dependent layer height.
 *
 * @param options - Validated options.
 * @returns The same options with `layerHeight` always present.
 * @public
 * @example <caption>Fill the layer height for a preset</caption>
 * ```typescript
 * import { resolveSlicerOptions, slicerOptionsSchema } from '@taucad/slicer';
 *
 * const options = resolveSlicerOptions(slicerOptionsSchema.parse({ preset: 'fine' }));
 * // options.layerHeight === 0.12
 * ```
 */
export const resolveSlicerOptions = (options: SlicerOptions): ResolvedSlicerOptions => ({
  ...options,
  layerHeight: options.layerHeight ?? slicerPresets[options.preset].layerHeight,
});
