import { z } from 'zod';

/**
 * The `device` section: what describes this computer. It never syncs to the account.
 *
 * @public
 */
export const deviceRecordSchema = z.strictObject({
  version: z.literal(1),
  /** `trackpad` replaces the mouse preset with trackpad gestures on this device only. Absent: mouse. */
  inputDevice: z.enum(['mouse', 'trackpad']).optional(),
  inviteDismissed: z.boolean().optional(),
  tourPaused: z.boolean().optional(),
});

/**
 * A parsed `device` section.
 *
 * @public
 */
export type DeviceRecord = z.infer<typeof deviceRecordSchema>;

/**
 * A device record with nothing chosen.
 *
 * @public
 */
export const emptyDeviceRecord: DeviceRecord = Object.freeze({ version: 1 });
