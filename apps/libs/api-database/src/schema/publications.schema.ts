import { sql, desc } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PublicationOwnerSnapshot } from '@taucad/types';
import { user } from '#schema/auth.schema.js';
// oxlint-disable-next-line import/no-cycle -- projects and publications reference each other only inside lazy `references(() => …)` thunks
import { project } from '#schema/projects.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

export const publication = pgTable(
  'publication',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentPublicationId: text('parent_publication_id').references((): AnyPgColumn => publication.id, {
      onDelete: 'set null',
    }),
    /** The named version this publication points at: `refs/tags/<tag>` (D11, A21). */
    tag: text('tag').notNull(),
    /** The revision that name resolved to when the publication was recorded. */
    revisionId: text('revision_id').notNull(),
    visibility: text('visibility').notNull(),
    manifestKey: text('manifest_key').notNull(),
    ogImageKey: text('og_image_key'),
    thumbnailKey: text('thumbnail_key'),
    runtimePin: text('runtime_pin').notNull(),
    kernels: text('kernels').array().notNull(),
    entryPath: text('entry_file').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    // oxlint-disable-next-line typescript-eslint/no-restricted-types -- Drizzle JSONB column distinguishes null (set) from undefined (unset)
    ownerSnapshot: jsonb('owner_snapshot').$type<PublicationOwnerSnapshot | null>(),
    forkCount: integer('fork_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    unpublishedAt: timestamp('unpublished_at'),
  },
  (table) => [
    index('publication_project_idx').on(table.projectId, desc(table.createdAt)),
    /* One publication per named version: a re-publish of the same name
       re-points the row it already has (AC13). */
    uniqueIndex('publication_project_tag_idx').on(table.projectId, table.tag),
    index('publication_owner_idx').on(table.ownerId, desc(table.createdAt)),
    index('publication_public_visibility_idx')
      .on(table.visibility, desc(table.createdAt))
      .where(sql`${table.visibility} = 'public' AND ${table.unpublishedAt} IS NULL`),
    check('publication_visibility_check', sql`${table.visibility} IN ('private', 'public')`),
  ],
);

/**
 * A project's one stable cloud link (stable cloud link blueprint D1). It shows
 * `project.current_publication_id`; who can open it and the invited people live
 * here, not on a version, so they carry across every publish. A row exists only
 * once a publish has succeeded, so an active link always has a current version.
 */
export const projectShare = pgTable(
  'project_share',
  {
    /** `shr_<21>`: the reference in `/s/tau~shr_…`. */
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Who can open the link. */
    visibility: text('visibility').notNull(),
    /** Set by "Stop sharing" and by project deletion; cleared by the next publish. */
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    /** When the link last changed what it shows; set on every publish. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_share_project_idx').on(table.projectId),
    index('project_share_owner_idx').on(table.ownerId),
    check('project_share_visibility_check', sql`${table.visibility} IN ('private', 'public')`),
  ],
);

/** An exact-email invitation to open a private cloud link. */
export const projectShareAccess = pgTable(
  'project_share_access',
  {
    /** `sga_<21>`. */
    id: text('id').primaryKey(),
    shareId: text('share_id')
      .notNull()
      .references(() => projectShare.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('project_share_access_share_email_idx').on(table.shareId, table.recipientEmail),
    index('project_share_access_recipient_idx')
      .on(table.recipientEmail, desc(table.createdAt))
      .where(sql`${table.status} = 'active'`),
    index('project_share_access_owner_idx').on(table.ownerId, desc(table.createdAt)),
    check('project_share_access_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('project_share_access_email_lower_check', sql`${table.recipientEmail} = lower(${table.recipientEmail})`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
