import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/**
 * A place a project's repository and LFS objects are written (D26).
 *
 * The Tau default account is the `null` in `project.storage_account_id` rather
 * than a row: it is the one account that exists at launch, its locator comes
 * from configuration, and a seeded row would be a second way to say the same
 * thing that every reader would then have to reconcile. Rows appear when a user
 * connects a bucket of their own, which is a later charter.
 *
 * `credentials_ref` is a *reference* — where the credentials are kept, never
 * the credentials. Nothing encrypts anything yet (DQ2), and the column is
 * nullable so the Tau default never needs one.
 */
export const storageAccount = pgTable(
  'storage_account',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** S3-compatible provider name; no code above the storage adapter reads it (I5). */
    provider: text('provider').notNull(),
    endpoint: text('endpoint').notNull(),
    region: text('region'),
    bucket: text('bucket').notNull(),
    /** Key prefix inside the bucket; tenant prefixes are appended to it. */
    prefix: text('prefix').notNull().default(''),
    credentialsRef: text('credentials_ref'),
    /** The port's capabilities descriptor as the conformance probe measured it (ND20). */
    capabilities: jsonb('capabilities'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('storage_account_owner_idx').on(table.ownerId),
    check('storage_account_status_check', sql`${table.status} IN ('active', 'disabled')`),
  ],
);

/**
 * What a deleted account leaves behind so its bytes can be purged (D10).
 *
 * Deliberately **without** a foreign key to `user`: the row is written in
 * `deleteUser.beforeDelete` and has to outlive the cascade that follows it. A
 * key would delete the tombstone in the same statement that made it necessary.
 *
 * `purge_after` is 30 days out for an ordinary deletion and now for a verified
 * erasure request; W6's purge job is the one caller of prefix deletion (D31)
 * and this row is its gate.
 */
export const storageTombstone = pgTable(
  'storage_tombstone',
  {
    ownerId: text('owner_id').primaryKey(),
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
    erasure: boolean('erasure').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * What the purge removed, written by the job after the prefixes are gone
     * (D31: "records what it removed"). A row with `purged_at` set is not
     * planned again; a run that refused or failed leaves it null and is
     * retried. Kept here rather than in a log table because one owner is
     * purged once and the three numbers are the whole record.
     */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    purgedObjects: bigint('purged_objects', { mode: 'number' }),
    purgedBytes: bigint('purged_bytes', { mode: 'number' }),
    /**
     * When `tau-mirror` wrote this owner's `tombstone-<created_at ms>.json` marker
     * into the B2 copy and stopped extending its locks (W13 B2, B6). The copier
     * polls for null rows; restore from B2 alone refuses a marked owner.
     */
    copyMarkedAt: timestamp('copy_marked_at', { withTimezone: true }),
  },
  (table) => [index('storage_tombstone_purge_after_idx').on(table.purgeAfter)],
);

export const blobRef = pgTable('blob_ref', {
  sha256: text('sha256').primaryKey(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  refcount: integer('refcount').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
