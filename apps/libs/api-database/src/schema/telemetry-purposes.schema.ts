import type { TelemetryPurpose } from '#schema/telemetry-purpose.types.js';
import { desc } from 'drizzle-orm';
import { bigint, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/**
 * Append-only agent-observability purpose decisions (blueprint T04).
 *
 * The newest row per user and purpose is the live answer; superseded rows stay
 * as the provenance a later use is checked against. Nothing is updated or
 * deleted in place, so a withdrawal is never mistaken for never having
 * decided, and a grant is never carried onto a notice the account never saw.
 *
 * This table is the only source of these permissions. `user.allows_ai_training`
 * and `user.allows_usage_metrics` govern the supplier training preference and
 * anonymous content-free metrics; neither authorises anything recorded here.
 */
export const telemetryPurposeDecision = pgTable(
  'telemetry_purpose_decision',
  {
    /** Insertion order. Two decisions can share a timestamp; they cannot share this. */
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<TelemetryPurpose>().notNull(),
    granted: boolean('granted').notNull(),
    /** The approved notice the account was shown. A decision never moves to another one. */
    noticeVersion: text('notice_version').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('telemetry_purpose_decision_live_idx').on(table.userId, table.purpose, desc(table.id))],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
