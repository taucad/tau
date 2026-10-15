import { defineConfiguration } from '@taucad/runtime/configuration';
import { z } from 'zod';
import { slicerOptionsSchema } from '#slicer-options.js';

const reference = slicerOptionsSchema.shape;
const bambuStudio = reference.bambuStudio.unwrap().shape;

/** Sparse slicer preparation settings, without defaults or transforms. @public */
export const slicingPreferencesSchema = z.strictObject({
  /** Quality preset. */
  preset: reference.preset.unwrap().optional(),
  printer: bambuStudio.printer,
  process: bambuStudio.process,
  /** Bambu Studio filament preset per slot: AMS trays `"0"` to `"15"`, the external spool `"254"`. */
  filaments: z
    .record(
      z.string().refine((value) => /^(?:\d|1[0-5]|254)$/u.test(value)),
      bambuStudio.filaments.unwrap().element,
    )
    .optional(),
  settings: bambuStudio.settings,
  /**
   * Reference-slicer options, limited to the print-quality keys `request_job` accepts
   * (`printOptionKeys` in the chat tool schemas, which this package cannot import).
   */
  options: z
    .strictObject({
      layerHeight: reference.layerHeight,
      walls: reference.walls.unwrap().optional(),
      infillPercent: reference.infillPercent.unwrap().optional(),
      infillPattern: reference.infillPattern.unwrap().optional(),
      supports: reference.supports.unwrap().optional(),
      nozzleTemperature: reference.nozzleTemperature.unwrap().optional(),
      bedTemperature: reference.bedTemperature.unwrap().optional(),
      printSpeed: reference.printSpeed.unwrap().optional(),
      travelSpeed: reference.travelSpeed.unwrap().optional(),
    })
    .optional(),
});

/** Sparse slicing preferences, validated without inserting slicer defaults. @public */
export type SlicingPreferences = z.output<typeof slicingPreferencesSchema>;
/** Preparation-owned source stored by reference in a machine settings profile. @public */
export const slicingPreferences = defineConfiguration({
  id: 'slicer.bambu-studio.settings',
  version: '1.0.0',
  schema: slicingPreferencesSchema,
  ui: { version: 1, rjsf: {} },
});
