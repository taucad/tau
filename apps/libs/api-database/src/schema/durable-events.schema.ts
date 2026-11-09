import { sql, desc } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/** Ordered event stream shared by background jobs and revision projections. */
export const durableStream = pgTable(
  'durable_stream',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    subjectId: text('subject_id').notNull(),
    nextSequence: integer('next_sequence').notNull().default(0),
    snapshotSequence: integer('snapshot_sequence').notNull().default(0),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('durable_stream_kind_subject_idx').on(table.kind, table.subjectId),
    index('durable_stream_owner_updated_idx').on(table.ownerId, desc(table.updatedAt)),
    check('durable_stream_kind_check', sql`${table.kind} IN ('job', 'revision')`),
    check('durable_stream_sequence_check', sql`${table.snapshotSequence} <= ${table.nextSequence}`),
  ],
);

/** Canonical append-only event history for a durable stream. */
export const durableStreamEvent = pgTable(
  'durable_stream_event',
  {
    streamId: text('stream_id')
      .notNull()
      .references(() => durableStream.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    eventId: text('event_id').notNull(),
    attempt: integer('attempt'),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.streamId, table.sequence] }),
    uniqueIndex('durable_stream_event_id_idx').on(table.eventId),
    check('durable_stream_event_sequence_check', sql`${table.sequence} > 0`),
    check('durable_stream_event_attempt_check', sql`${table.attempt} IS NULL OR ${table.attempt} > 0`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
