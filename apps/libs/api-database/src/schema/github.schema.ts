import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/** A Tau user's separately authorized GitHub App identity. */
export const githubConnection = pgTable(
  'github_connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    githubSubject: bigint('github_subject', { mode: 'number' }).notNull(),
    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    keyVersion: integer('key_version').notNull(),
    generation: integer('generation').notNull().default(1),
    authorizationVersion: integer('authorization_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('github_connection_user_subject').on(table.userId, table.githubSubject),
    index('github_connection_user_idx').on(table.userId),
    check('github_connection_generation_positive', sql`${table.generation} > 0`),
  ],
);

/** Explicit Tau write use, bound to one authorization and immutable repository owner. */
export const githubRepositoryWrite = pgTable(
  'github_repository_write',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => githubConnection.id, { onDelete: 'cascade' }),
    repositoryId: bigint('repository_id', { mode: 'number' }).notNull(),
    installationId: bigint('installation_id', { mode: 'number' }).notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    authorizationVersion: integer('authorization_version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.repositoryId] })],
);

/** Disabling Tau Gist use preserves the provider grant and existing publications. */
export const githubGistPreference = pgTable('github_gist_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
});

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
