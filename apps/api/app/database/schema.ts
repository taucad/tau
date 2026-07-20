import { sql, desc } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { PublicationOwnerSnapshot } from '@taucad/types';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  /** Whether the user allows their AI prompts and designs to be used for AI service improvement */
  allowsAiTraining: boolean('allows_ai_training').default(true).notNull(),
  /** Stripe customer id, written by @better-auth/stripe on first billing action (lazy creation). */
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  origin: text('origin').notNull().default('local-mirror'),
  forkedFrom: text('forked_from').references((): AnyPgColumn => publication.id),
  currentPublicationId: text('current_publication_id').references((): AnyPgColumn => publication.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
    parentPublicationId: text('parent_publication_id').references((): AnyPgColumn => publication.id),
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
    index('publication_owner_idx').on(table.ownerId, desc(table.createdAt)),
    index('publication_public_visibility_idx')
      .on(table.visibility, desc(table.createdAt))
      .where(sql`${table.visibility} = 'public' AND ${table.unpublishedAt} IS NULL`),
    check('publication_visibility_check', sql`${table.visibility} IN ('private', 'public')`),
  ],
);

export const publicationAccess = pgTable(
  'publication_access',
  {
    id: text('id').primaryKey(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publication.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    uniqueIndex('publication_access_publication_email_idx').on(table.publicationId, table.recipientEmail),
    index('publication_access_recipient_idx')
      .on(table.recipientEmail, desc(table.createdAt))
      .where(sql`${table.status} = 'active'`),
    index('publication_access_owner_idx').on(table.ownerId, desc(table.createdAt)),
    check('publication_access_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('publication_access_email_lower_check', sql`${table.recipientEmail} = lower(${table.recipientEmail})`),
  ],
);

export const blobRef = pgTable('blob_ref', {
  sha256: text('sha256').primaryKey(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  refcount: integer('refcount').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at'),
    enabled: boolean('enabled').default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window').default(86_400_000),
    rateLimitMax: integer('rate_limit_max').default(10),
    requestCount: integer('request_count').default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('apikey_configId_idx').on(table.configId),
    index('apikey_referenceId_idx').on(table.referenceId),
    index('apikey_key_idx').on(table.key),
  ],
);

/**
 * Subscription state mirrored from Stripe by `@better-auth/stripe` (hand-merged
 * from the generated auth-schema.ts). `referenceId` is the user id at MVP
 * (customerType 'user'); the plugin supports org references later.
 */
export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    plan: text('plan').notNull(),
    referenceId: text('reference_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').default('incomplete').notNull(),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    trialStart: timestamp('trial_start'),
    trialEnd: timestamp('trial_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    cancelAt: timestamp('cancel_at'),
    canceledAt: timestamp('canceled_at'),
    endedAt: timestamp('ended_at'),
    seats: integer('seats'),
    billingInterval: text('billing_interval'),
    stripeScheduleId: text('stripe_schedule_id'),
  },
  (table) => [
    index('subscription_reference_idx').on(table.referenceId),
    index('subscription_stripe_idx').on(table.stripeSubscriptionId),
  ],
);

/**
 * Per-customer Enterprise limit overrides (blueprint Q28/E5). Merged over the
 * tier's default entitlements at projection time; values are set by ops when a
 * sales-led subscription is attached (see the stripe-iac runbook).
 */
export const subscriptionExtension = pgTable('subscription_extension', {
  subscriptionId: text('subscription_id')
    .primaryKey()
    .references(() => subscription.id, { onDelete: 'cascade' }),
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- Drizzle JSONB column distinguishes null (set) from undefined (unset)
  overrides: jsonb('overrides').$type<Record<string, number | boolean> | null>(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * Credit-ledger account: materialised balances in microdollars (µ$, AD16 —
 * 1 USD = 1e6 µ$, bigint columns). Split balances per AD10: monthly grants roll
 * over against `rolloverCeilingMicro`; top-up credits never expire and are
 * consumed first at commit time. Redis is the hot path; this row is the durable
 * backstop written through by the ledger outbox.
 */
export const creditAccount = pgTable('credit_account', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  grantBalanceMicro: bigint('grant_balance_micro', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  topupBalanceMicro: bigint('topup_balance_micro', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  reservedMicro: bigint('reserved_micro', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  monthlyGrantMicro: bigint('monthly_grant_micro', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  rolloverCeilingMicro: bigint('rollover_ceiling_micro', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  /** Monotonic write-ordering guard: outbox flushes only apply snapshots with a newer version. */
  version: bigint('version', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  /** Anchors the free-tier lazy monthly grant (paid grants anchor on invoice.paid). */
  lastGrantedAt: timestamp('last_granted_at'),
  /** Server-side dedup markers for the 80%/95% balance-consumed toasts (Q26). */
  notified80At: timestamp('notified_80_at'),
  notified95At: timestamp('notified_95_at'),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * Append-only credit journal. Invariant (C12, audited with alerting):
 * SUM(delta_micro) per user == credit_account.grant_balance_micro + topup_balance_micro.
 * Reservations are deliberately NOT journaled — only settled money movements are.
 * `category` is set on spend rows only (grants/top-ups are category-less credit).
 */
export const creditTransaction = pgTable(
  'credit_transaction',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deltaMicro: bigint('delta_micro', { mode: 'bigint' }).notNull(),
    balanceAfterMicro: bigint('balance_after_micro', {
      mode: 'bigint',
    }).notNull(),
    reason: text('reason').notNull(),
    category: text('category'),
    stripeEventId: text('stripe_event_id'),
    chatId: text('chat_id'),
    modelId: text('model_id'),
    toolCallId: text('tool_call_id'),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('credit_tx_user_idx').on(table.userId, desc(table.createdAt)),
    // Webhook idempotency (Q11): a retried Stripe event inserts the same id and no-ops.
    uniqueIndex('credit_tx_stripe_event_idx')
      .on(table.stripeEventId)
      .where(sql`${table.stripeEventId} IS NOT NULL`),
    check(
      'credit_tx_reason_check',
      sql`${table.reason} IN ('monthly_grant', 'topup', 'commit', 'sweep_floor', 'adjustment')`,
    ),
    check(
      'credit_tx_category_check',
      sql`${table.category} IS NULL OR ${table.category} IN ('llm', 'zoo_engine', 'geospec_hosted', 'solver_orchestration')`,
    ),
  ],
);

/**
 * In-flight model-call reservations (durable mirror of the Redis reservation
 * hash). `inputFloorMicro` is the Q36 abort/error floor captured at reserve
 * time so the sweeper can settle expired holds without re-estimating.
 */
export const creditReservation = pgTable(
  'credit_reservation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reservedMicro: bigint('reserved_micro', { mode: 'bigint' }).notNull(),
    inputFloorMicro: bigint('input_floor_micro', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    chatId: text('chat_id'),
    turnId: text('turn_id').notNull(),
    modelId: text('model_id').notNull(),
    category: text('category').notNull().default('llm'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('credit_res_user_idx').on(table.userId, table.expiresAt)],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
