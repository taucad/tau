import { defineConfiguration } from '@taucad/runtime/configuration';
import { z } from 'zod';

import { bambuExternalSpoolSlot } from '#bambu.protocol.js';

/** A material slot in Tau's words, as a material system reports it. @public */
export type BambuSlotAddress = Readonly<{ unitId: string; slotId: string }>;

const unitLetters = 'abcd';

/**
 * The tray number Bambu uses for a slot, as the settings and the submission name slots: `ams-a`…`ams-d` slots
 * `a1`…`d4` are `ams * 4 + tray`, the external spool is 254. The provider owns this encoding; a consumer maps
 * through it and never repeats the numbers.
 * @param address - `unitId` and `slotId`, as a material system reports them.
 * @returns The tray number, or undefined for an address no Bambu printer has.
 * @public
 *
 * @example <caption>Map a reported slot to the tray number the submission names</caption>
 * ```typescript
 * import { bambuSlotOf } from '@taucad/bambu/settings';
 *
 * const tray = bambuSlotOf({ unitId: 'ams-a', slotId: 'a2' }); // 1
 * ```
 */
export const bambuSlotOf = (address: BambuSlotAddress): number | undefined => {
  if (address.unitId === 'external') {
    return address.slotId === 'spool' ? bambuExternalSpoolSlot : undefined;
  }
  const unit = /^ams-([a-d])$/u.exec(address.unitId)?.[1];
  const slot = /^([a-d])([1-4])$/u.exec(address.slotId);
  return unit === undefined || slot?.[1] !== unit ? undefined : unitLetters.indexOf(unit) * 4 + Number(slot[2]) - 1;
};

/**
 * The slot a tray number names: the inverse of {@link bambuSlotOf}.
 * @param slot - The tray number: 0–15 or 254.
 * @returns `unitId` and `slotId`.
 * @throws RangeError for a number no Bambu printer has.
 * @public
 *
 * @example <caption>Show the slot a saved preference names</caption>
 * ```typescript
 * import { bambuAddressOf } from '@taucad/bambu/settings';
 *
 * const address = bambuAddressOf(254); // { unitId: 'external', slotId: 'spool' }
 * ```
 */
export const bambuAddressOf = (slot: number): BambuSlotAddress => {
  if (slot === bambuExternalSpoolSlot) {
    return { unitId: 'external', slotId: 'spool' };
  }
  const letter = Number.isInteger(slot) ? unitLetters[Math.floor(slot / 4)] : undefined;
  if (letter === undefined || slot < 0) {
    throw new RangeError(`Bambu tray ${String(slot)} does not exist.`);
  }
  return { unitId: `ams-${letter}`, slotId: `${letter}${String((slot % 4) + 1)}` };
};

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
        /** Keyed by the colour as `#rrggbb`: a slot's `#RRGGBBAA` lower-cased without its alpha. */
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
