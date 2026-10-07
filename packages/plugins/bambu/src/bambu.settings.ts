import { defineConfiguration } from '@taucad/runtime/configuration';
import { z } from 'zod';
import { bambuExternalSpoolSlot } from '#bambu.protocol.js';

const traySlot = z.union([z.number().int().min(0).max(15), z.literal(bambuExternalSpoolSlot)]);

/** Sparse project preferences shared by every machine of this type. @public */
export const bambuSettingsConfiguration = defineConfiguration({
  id: 'bambu.machine.settings',
  version: '1.0.0',
  schema: z.strictObject({
    plate: z.enum(['cool', 'engineering', 'high-temperature', 'textured-pei']).optional(),
    bedLeveling: z.boolean().optional(),
    flowCalibration: z.boolean().optional(),
    timelapse: z.boolean().optional(),
    material: z
      .strictObject({
        defaultSlot: traySlot.optional(),
        slotsByColor: z
          .record(
            z.string().refine((value) => /^#[0-9a-f]{6}$/u.test(value)),
            traySlot,
          )
          .optional(),
      })
      .optional(),
  }),
  ui: { version: 1, rjsf: {} },
});
