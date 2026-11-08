import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { bigint, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';
import { storageAccount } from '#schema/storage.schema.js';
// oxlint-disable-next-line import/no-cycle -- projects and publications reference each other only inside lazy `references(() => …)` thunks
import { publication } from '#schema/publications.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  origin: text('origin').notNull().default('local-mirror'),
  // An independent fork survives closure of the source account. Project deletion retains the source row.
  forkedFrom: text('forked_from').references((): AnyPgColumn => publication.id, { onDelete: 'set null' }),
  currentPublicationId: text('current_publication_id').references((): AnyPgColumn => publication.id),
  /** Null is the Tau default account (D26); a row is a bucket the owner supplied. */
  storageAccountId: text('storage_account_id').references(() => storageAccount.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/** Durable deletion authority. No foreign keys: accepted work survives account closure. */
export const projectDeletion = pgTable(
  'project_deletion',
  {
    projectId: text('project_id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    storageAccountId: text('storage_account_id'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    requestedBy: text('requested_by').notNull(),
    fencedAt: timestamp('fenced_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    purgedObjects: bigint('purged_objects', { mode: 'number' }),
    purgedBytes: bigint('purged_bytes', { mode: 'number' }),
    retainedBytes: bigint('retained_bytes', { mode: 'number' }).default(0).notNull(),
  },
  (table) => [
    index('project_deletion_owner_idx').on(table.ownerId),
    index('project_deletion_pending_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('project_deletion_purge_idx')
      .on(table.purgeAfter)
      .where(sql`${table.purgedAt} IS NULL`),
    check(
      'project_deletion_fenced_check',
      sql`${table.deletedAt} IS NULL OR (${table.fencedAt} IS NOT NULL AND ${table.purgeAfter} IS NOT NULL)`,
    ),
    check('project_deletion_purged_check', sql`${table.purgedAt} IS NULL OR ${table.deletedAt} IS NOT NULL`),
  ],
);

/** Immutable publication reference work captured before any destructive cascade. */
export const projectDeletionManifest = pgTable(
  'project_deletion_manifest',
  {
    projectId: text('project_id').notNull(),
    publicationId: text('publication_id').notNull(),
    manifestKey: text('manifest_key').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.publicationId, table.manifestKey] })],
);

/**
 * Access to a project as a relation rather than an equality test (D27).
 *
 * Ownership does not move: the project keeps one owner, whose storage account
 * and plan carry the bytes. A collaborator needs an account and a verified
 * email, not a plan. Roles are `read` and `write`; the owner is implicit and is
 * the only account that manages this table, so no `admin` value exists yet —
 * adding one is a check-constraint change and no data migration.
 */
export const projectCollaborator = pgTable(
  'project_collaborator',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    /* The listing's other direction: every project one account collaborates on. */
    index('project_collaborator_user_idx').on(table.userId),
    check('project_collaborator_role_check', sql`${table.role} IN ('read', 'write')`),
  ],
);

/**
 * An invitation to collaborate, on the `publication_access` pattern (D27).
 *
 * Keyed on (project, email) exactly as `publication_access` is keyed on
 * (publication, email), which is what makes inviting twice idempotent and
 * re-inviting a revoked address un-revoke the row in place rather than leave
 * two. The token is stored hashed, so a leaked row cannot be replayed as a
 * link. `email` is lowercase by check constraint, so normalisation cannot be
 * skipped by a second writer.
 */
export const projectInvitation = pgTable(
  'project_invitation',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** The account the invitation bound to when it was accepted. */
    acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.email] }),
    uniqueIndex('project_invitation_token_hash_idx').on(table.tokenHash),
    check('project_invitation_role_check', sql`${table.role} IN ('read', 'write')`),
    check('project_invitation_email_lower_check', sql`${table.email} = lower(${table.email})`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
