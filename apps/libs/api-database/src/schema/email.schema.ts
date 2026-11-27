import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Delivery events Resend posts to the signed webhook (email bounce blueprint R7).
 *
 * An append-only inbox keyed by the delivery's `svix-id`, so a retried or replayed
 * delivery inserts nothing the second time. Rows are deleted 90 days after receipt
 * (blueprint D6) by the maintenance worker. Every recipient here is an address Tau
 * already holds (`user.email`, `project_share_access.recipient_email`); the provider's
 * free-text bounce message is deliberately not stored.
 */
export const emailEvent = pgTable(
  'email_event',
  {
    /** The delivery's `svix-id` header: one row per delivery, however often it is retried or replayed. */
    svixId: text('svix_id').primaryKey(),
    /** The `env` tag the send carried; the receiving environment, for a suppression event, which carries no tags. */
    environment: text('environment').notNull(),
    /** The Resend event type, such as `email.bounced` or `suppression.added`. */
    type: text('type').notNull(),
    /** The email the event is about: `email_id`, or `source_id` for a suppression event. */
    resendEmailId: text('resend_email_id'),
    /** The `kind` tag the send carried (`EmailTemplateKind`); null when the event has no tags. */
    kind: text('kind'),
    /** The recipient, trimmed and lower-cased. */
    recipient: text('recipient'),
    bounceType: text('bounce_type'),
    bounceSubType: text('bounce_sub_type'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('email_event_received_idx').on(table.receivedAt),
    index('email_event_email_idx').on(table.resendEmailId),
    index('email_event_recipient_idx').on(table.recipient),
  ],
);

/**
 * Tau's mirror of Resend's suppression list, plus the one fact Resend cannot know:
 * which kind of mail put the address there (blueprint R9).
 *
 * Resend enforces the list; Tau reads this row to explain it (the invite's "Not
 * delivered", the settings banner) and to park billing notices that cannot arrive.
 * A row with `cleared_at` set is deliverable again.
 */
export const emailAddressState = pgTable(
  'email_address_state',
  {
    /** The address, trimmed and lower-cased. */
    address: text('address').primaryKey(),
    /** `bounced` and `complained` follow Resend's origins; `suppressed` is an address added to the list by hand. */
    state: text('state').$type<'bounced' | 'complained' | 'suppressed'>().notNull(),
    /** The template kind of the mail that bounced or was reported; null when the triggering email is unknown. */
    originKind: text('origin_kind'),
    /** The `svix-id` of the event that wrote the row. */
    originEvent: text('origin_event').notNull(),
    since: timestamp('since', { withTimezone: true }).notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    /** What cleared the row, such as the `suppression.removed` event's `svix-id`. */
    clearedBy: text('cleared_by'),
  },
  (table) => [
    check('email_address_state_state_check', sql`${table.state} IN ('bounced', 'complained', 'suppressed')`),
    check('email_address_state_address_lower_check', sql`${table.address} = lower(${table.address})`),
  ],
);
