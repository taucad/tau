import { inArray, lte } from 'drizzle-orm';
import type { DatabaseService } from '@taucad/api-database';
import { emailAddressState, emailEvent } from '@taucad/api-database/schema';

/** Delivery events are kept 90 days (email bounce blueprint D6): a monthly review and a dispute, no longer. */
export const emailEventRetentionDays = 90;

const dayMilliseconds = 24 * 60 * 60 * 1000;

/**
 * Deletes one bounded batch of delivery events received more than 90 days before `now`, and address-state
 * rows cleared more than 90 days before it. Bounded so a backlog never holds long locks; the next daily
 * maintenance pass takes the rest. Live (uncleared) address-state rows are kept: they mirror Resend's list.
 *
 * @param database - The API database.
 * @param input - The clock and the batch size.
 * @returns How many rows of each table were deleted.
 */
export const reapExpiredEmailEvents = async (
  database: DatabaseService['database'],
  input: Readonly<{ now: Date; limit: number }>,
): Promise<{ readonly events: number; readonly clearedStates: number }> => {
  const before = new Date(input.now.getTime() - emailEventRetentionDays * dayMilliseconds);
  const events = await database
    .delete(emailEvent)
    .where(
      inArray(
        emailEvent.svixId,
        database
          .select({ svixId: emailEvent.svixId })
          .from(emailEvent)
          .where(lte(emailEvent.receivedAt, before))
          .limit(input.limit),
      ),
    )
    .returning({ svixId: emailEvent.svixId });
  const clearedStates = await database
    .delete(emailAddressState)
    .where(
      inArray(
        emailAddressState.address,
        database
          .select({ address: emailAddressState.address })
          .from(emailAddressState)
          .where(lte(emailAddressState.clearedAt, before))
          .limit(input.limit),
      ),
    )
    .returning({ address: emailAddressState.address });
  return { events: events.length, clearedStates: clearedStates.length };
};
