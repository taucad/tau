import { z } from 'zod';

/** Keys an earlier build stored that no longer mean anything; dropped on read so the rest of the record survives. */
const retiredKeys: ReadonlySet<string> = new Set(['inputDevice']);

const dropRetiredKeys = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => !retiredKeys.has(key)));
};

/**
 * The `device` section: what describes this computer. It never syncs to the account.
 *
 * @public
 */
export const deviceRecordSchema = z.preprocess(
  dropRetiredKeys,
  z.strictObject({
    version: z.literal(1),
    inviteDismissed: z.boolean().optional(),
    tourPaused: z.boolean().optional(),
  }),
);

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
