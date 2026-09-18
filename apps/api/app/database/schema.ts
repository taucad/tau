import type {
  PaymentOfferSnapshot,
  PaidPaymentEvidence,
  NoChargeEvidence,
  CheckoutExpiryEvidence,
  SubscriptionCancellationEvidence,
  SubscriptionCheckoutExpiryEvidence,
  PaymentCheckoutExpiryEvidence,
  RequestRejectedEvidence,
} from '#api/billing/billing-payment-contract.js';
import type { SupplierValuation, JointInputMaximum, InputCountEvidence } from '#api/billing/credit-ledger.types.js';
import { sql, desc } from 'drizzle-orm';
import type { AnyPgColumn, PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  pgSchema,
  numeric,
  foreignKey,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  unique,
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
  /** Historical Better Auth customer hint; never financial authority or a first-party write target. */
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
  /** Null is the Tau default account (D26); a row is a bucket the owner supplied. */
  storageAccountId: text('storage_account_id').references(() => storageAccount.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
  },
  (table) => [index('storage_tombstone_purge_after_idx').on(table.purgeAfter)],
);

/**
 * Storage accounting for one project's bare repository on the Tau Hosted
 * Remote (charter D15/D16, blueprint S25/S36). `storage_bytes` is the
 * repository directory as the API measured it after the last push;
 * `lfs_bytes` is the sum of that project's large objects in the private
 * bucket. Both are counted against the plan allowance by `pre-receive` and by
 * the LFS batch endpoint; a push over quota is refused whole (D17).
 */
export const projectGit = pgTable('project_git', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => project.id, { onDelete: 'cascade' }),
  storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
  lfsBytes: bigint('lfs_bytes', { mode: 'number' }).notNull().default(0),
  /**
   * The manifest generation this row was last told about (D19). Derived state —
   * accounting, LFS marks, publications — is keyed to it, and any request that
   * sees `derived_generation` behind it re-derives. There is no reconcile job.
   */
  generation: bigint('generation', { mode: 'number' }).notNull().default(0),
  derivedGeneration: bigint('derived_generation', { mode: 'number' }).notNull().default(0),
  /**
   * The generation an independent copy holds (D11). Nothing writes it yet: the
   * copy is deferred to DG1, and the column ships now so DG1 adds no migration.
   */
  copiedGeneration: bigint('copied_generation', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * One quota reservation per project-scoped git-lfs object. A nullable
 * `finalized_at` means the upload URL was issued but exact bytes have not yet
 * been verified; those rows still count against quota until retention safely
 * reconciles abandoned uploads.
 */
export const projectGitLfsObject = pgTable(
  'project_git_lfs_object',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    oid: text('oid').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    /** First observation that no retained Git tree reaches this object. */
    unreachableAt: timestamp('unreachable_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.oid] }),
    index('project_git_lfs_object_pending_idx').on(table.projectId, table.finalizedAt),
    check('project_git_lfs_object_size_nonnegative', sql`${table.sizeBytes} >= 0`),
  ],
);

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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('github_connection_user_subject').on(table.userId, table.githubSubject),
    index('github_connection_user_idx').on(table.userId),
    check('github_connection_generation_positive', sql`${table.generation} > 0`),
  ],
);

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
 * First-party subscription projection. Historical unbound rows await explicit
 * financial migration; their labels and auth reference never authorize access.
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
    accountId: text('account_id').references((): AnyPgColumn => creditAccount.id, { onDelete: 'restrict' }),
    environment: text('environment'),
    customerBindingId: text('customer_binding_id').references((): AnyPgColumn => billingStripeCustomer.id, {
      onDelete: 'restrict',
    }),
    requestId: text('request_id'),
    requestHash: text('request_hash'),
    offerSnapshot: jsonb('offer_snapshot').$type<PaymentOfferSnapshot>(),
    slotState: text('slot_state'),
    paidThrough: timestamp('paid_through', { withTimezone: true }),
    failedRenewalInvoiceId: text('failed_renewal_invoice_id'),
    dunningStartedAt: timestamp('dunning_started_at', { withTimezone: true }),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('subscription_account_id').on(table.accountId, table.id),
    uniqueIndex('subscription_active_slot')
      .on(table.accountId)
      .where(sql`${table.slotState} IN ('pending','current','attention')`),
    uniqueIndex('subscription_owned_source').on(table.customerBindingId, table.stripeSubscriptionId),
    uniqueIndex('subscription_owned_request').on(table.accountId, table.requestId),
    check(
      'subscription_financial_state',
      sql`${table.accountId} IS NULL OR (${table.environment} IS NOT NULL AND ${table.customerBindingId} IS NOT NULL AND ${table.offerSnapshot} IS NOT NULL AND ${table.requestId} IS NOT NULL AND ${table.requestHash} IS NOT NULL AND ${table.slotState} IN ('pending','current','attention','ended'))`,
    ),
    check(
      'subscription_grace',
      sql`(${table.failedRenewalInvoiceId} IS NULL AND ${table.dunningStartedAt} IS NULL AND ${table.graceEndsAt} IS NULL) OR (${table.failedRenewalInvoiceId} IS NOT NULL AND ${table.dunningStartedAt} IS NOT NULL AND ${table.graceEndsAt} = ${table.dunningStartedAt} + interval '7 days')`,
    ),
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
export const legacyCreditAccount = pgTable('credit_account', {
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
export const legacyCreditTransaction = pgTable(
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
export const legacyCreditReservation = pgTable(
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

/** Financial authority is private; public legacy tables are retained for fenced reconciliation only. */
export const billing = pgSchema('billing');

export const creditAccount = billing.table(
  'credit_account',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    status: text('status').notNull().default('open'),
    promoAtoms: bigint('promo_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    planAtoms: bigint('plan_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    purchasedAtoms: bigint('purchased_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    debtAtoms: bigint('debt_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    promoHeldAtoms: bigint('promo_held_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    planHeldAtoms: bigint('plan_held_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    purchasedHeldAtoms: bigint('purchased_held_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    pendingIssuanceAtoms: bigint('pending_issuance_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    revision: bigint('revision', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    unique('credit_account_environment_id').on(table.environment, table.id),
    check('credit_account_environment', sql`${table.environment} IN ('development','staging','prod-us','prod-eu')`),
    check('credit_account_status', sql`${table.status} IN ('open','closing','closed','restricted')`),
    check(
      'credit_account_sources',
      sql`${table.promoAtoms} >= 0 AND ${table.planAtoms} >= 0 AND ${table.purchasedAtoms} >= 0 AND ${table.debtAtoms} >= 0 AND ${table.pendingIssuanceAtoms} >= 0 AND ${table.revision} >= 0`,
    ),
    check(
      'credit_account_holds',
      sql`${table.promoHeldAtoms} BETWEEN 0 AND ${table.promoAtoms} AND ${table.planHeldAtoms} BETWEEN 0 AND ${table.planAtoms} AND ${table.purchasedHeldAtoms} BETWEEN 0 AND ${table.purchasedAtoms}`,
    ),
    check(
      'credit_account_headroom',
      sql`${table.promoAtoms}::numeric + ${table.planAtoms} + ${table.purchasedAtoms} + ${table.pendingIssuanceAtoms} <= 9223372036854775807`,
    ),
  ],
);

export const billingOwnerBinding = billing.table(
  'billing_owner_binding',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    authUserId: text('auth_user_id').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_owner_active_user')
      .on(table.environment, table.authUserId)
      .where(sql`${table.revokedAt} IS NULL AND ${table.authUserId} IS NOT NULL`),
    uniqueIndex('billing_owner_active_account')
      .on(table.accountId)
      .where(sql`${table.revokedAt} IS NULL AND ${table.authUserId} IS NOT NULL`),
  ],
);

export const billingPolicy = billing.table(
  'billing_policy',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    policyVersion: text('policy_version').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    contentHash: text('content_hash').notNull(),
    canonicalContent: text('canonical_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_policy_environment_id').on(table.environment, table.id),
    uniqueIndex('billing_policy_version').on(table.environment, table.policyVersion),
    uniqueIndex('billing_policy_content').on(table.environment, table.contentHash),
    check('billing_policy_schema', sql`${table.schemaVersion} = 1`),
  ],
);

export const billingPolicyActivation = billing.table(
  'billing_policy_activation',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    policyId: text('policy_id').notNull(),
    jobKey: text('job_key').notNull(),
    requestHash: text('request_hash').notNull(),
    expectedPredecessorActivationId: text('expected_predecessor_activation_id'),
    announcedAt: timestamp('announced_at', { withTimezone: true }).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_activation_environment_id').on(table.environment, table.id),
    unique('billing_activation_policy_id').on(table.environment, table.id, table.policyId),
    uniqueIndex('billing_activation_job').on(table.environment, table.jobKey),
    foreignKey({
      columns: [table.environment, table.policyId],
      foreignColumns: [billingPolicy.environment, billingPolicy.id],
    }).onDelete('restrict'),
    check('billing_activation_time', sql`${table.effectiveAt} >= ${table.announcedAt}`),
  ],
);

export const billingPolicyActivationCancellation = billing.table(
  'billing_policy_activation_cancellation',
  {
    environment: text('environment').notNull(),
    activationId: text('activation_id').primaryKey(),
    jobKey: text('job_key').notNull(),
    requestHash: text('request_hash').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('billing_cancellation_job').on(table.environment, table.jobKey),
    foreignKey({
      columns: [table.environment, table.activationId],
      foreignColumns: [billingPolicyActivation.environment, billingPolicyActivation.id],
    }).onDelete('restrict'),
  ],
);

export const billingPolicyHead = billing.table(
  'billing_policy_head',
  {
    environment: text('environment').primaryKey(),
    revision: bigint('revision', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    currentActivationId: text('current_activation_id'),
    pendingActivationId: text('pending_activation_id'),
    observedActivationId: text('observed_activation_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.currentActivationId],
      foreignColumns: [billingPolicyActivation.environment, billingPolicyActivation.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.pendingActivationId],
      foreignColumns: [billingPolicyActivation.environment, billingPolicyActivation.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.observedActivationId],
      foreignColumns: [billingPolicyActivation.environment, billingPolicyActivation.id],
    }).onDelete('restrict'),
    check('billing_head_revision', sql`${table.revision} >= 0`),
  ],
);

/** Lifetime funding is shared by all periods; rollover cannot replenish it. */
export const billingBudgetFunding = billing.table(
  'billing_budget_funding',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    fundedLifetime: numeric('funded_lifetime', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    consumed: numeric('consumed', { precision: 78, scale: 0, mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    held: numeric('held', { precision: 78, scale: 0, mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    uniqueIndex('billing_funding_scope').on(table.environment, table.kind, table.scope),
    unique('billing_funding_environment_id').on(table.environment, table.id),
    unique('billing_funding_scope_id').on(table.environment, table.id, table.kind, table.scope),
    check(
      'billing_funding_cap',
      sql`${table.fundedLifetime} >= 0 AND ${table.consumed} >= 0 AND ${table.held} >= 0 AND ${table.consumed} + ${table.held} <= ${table.fundedLifetime}`,
    ),
  ],
);

export const billingBudget = billing.table(
  'billing_budget',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    fundingId: text('funding_id').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    quantum: text('quantum').notNull(),
    approvedCap: numeric('approved_cap', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    consumed: numeric('consumed', { precision: 78, scale: 0, mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    held: numeric('held', { precision: 78, scale: 0, mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    unique('billing_budget_environment_id').on(table.environment, table.id),
    uniqueIndex('billing_budget_period').on(
      table.environment,
      table.kind,
      table.scope,
      table.periodStart,
      table.periodEnd,
    ),
    foreignKey({
      columns: [table.environment, table.fundingId, table.kind, table.scope],
      foreignColumns: [
        billingBudgetFunding.environment,
        billingBudgetFunding.id,
        billingBudgetFunding.kind,
        billingBudgetFunding.scope,
      ],
    }).onDelete('restrict'),
    check(
      'billing_budget_cap',
      sql`${table.approvedCap} >= 0 AND ${table.consumed} >= 0 AND ${table.held} >= 0 AND ${table.consumed} + ${table.held} <= ${table.approvedCap}`,
    ),
    check('billing_budget_period_order', sql`${table.periodEnd} > ${table.periodStart} AND ${table.generation} > 0`),
  ],
);

// oxlint-disable-next-line typescript/no-restricted-types -- canonical persisted tariff uses null for an untiered rate
type BillingRateTier = string | null;

export const creditOperation = billing.table(
  'credit_operation',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    surface: text('surface').notNull(),
    attemptKey: text('attempt_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    requestKeyVersion: integer('request_key_version').notNull(),
    category: text('category').notNull(),
    modelId: text('model_id').notNull(),
    historyVersion: integer('history_version'),
    modelDisplayName: text('model_display_name'),
    providerId: text('provider_id'),
    projectHint: text('project_hint'),
    chatHint: text('chat_hint'),
    admittedAt: timestamp('admitted_at', { withTimezone: true }),
    dispatchIntentAt: timestamp('dispatch_intent_at', { withTimezone: true }),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    invocation: jsonb('invocation').$type<{
      contractVersion: string;
      credentialAccount: string;
      // oxlint-disable-next-line typescript/no-restricted-types -- null explicitly denotes an undated supplier tariff
      supplierRatesValidUntil: string | null;
      supplierRates: Array<{
        dimension: string;
        tier: BillingRateTier;
        numeratorPicoUsd: string;
        denominatorUnits: string;
      }>;
      /** Milliseconds. */
      executionTimeout: number;
      supplierValuation?: SupplierValuation;
      jointInputMaximum?: JointInputMaximum;
      inputCount?: InputCountEvidence;
    }>(),
    sku: text('sku').notNull(),
    pinnedTariff: jsonb('pinned_tariff')
      .$type<
        Array<{
          rateId: string;
          dimension: string;
          tier: BillingRateTier;
          unit: string;
          numeratorCreditAtoms: string;
          denominatorUnits: string;
        }>
      >()
      .notNull(),
    maximumQuantities: jsonb('maximum_quantities')
      .$type<Array<{ dimension: string; tier: BillingRateTier; quantity: string }>>()
      .notNull(),
    activity: text('activity').notNull(),
    policyId: text('policy_id')
      .notNull()
      .references(() => billingPolicy.id, { onDelete: 'restrict' }),
    activationId: text('activation_id')
      .notNull()
      .references(() => billingPolicyActivation.id, { onDelete: 'restrict' }),
    meterContractId: text('meter_contract_id').notNull(),
    authorizedAtoms: bigint('authorized_atoms', { mode: 'bigint' }).notNull(),
    promoHeldAtoms: bigint('promo_held_atoms', { mode: 'bigint' }).notNull(),
    planHeldAtoms: bigint('plan_held_atoms', { mode: 'bigint' }).notNull(),
    purchasedHeldAtoms: bigint('purchased_held_atoms', { mode: 'bigint' }).notNull(),
    spendBudgetHoldId: text('spend_budget_hold_id').notNull(),
    riskBudgetHoldId: text('risk_budget_hold_id').notNull(),
    dispatchState: text('dispatch_state').notNull().default('admitted'),
    customerState: text('customer_state').notNull().default('pending'),
    supplierState: text('supplier_state').notNull().default('reserved'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`1`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    usageOccurredAt: timestamp('usage_occurred_at', { withTimezone: true }),
    evidenceOccurredAt: timestamp('evidence_occurred_at', { withTimezone: true }),
    executionStatus: text('execution_status'),
    meteringStatus: text('metering_status'),
    reasoningTokens: numeric('reasoning_tokens', { precision: 78, scale: 0, mode: 'bigint' }),
    normalizationEvidence: jsonb('normalization_evidence').$type<{
      version: string;
      providerRequestId?: string;
      terminalReason?: string;
      fields: Record<string, string>;
    }>(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    terminalRevision: bigint('terminal_revision', { mode: 'bigint' }),
    baseTransactionId: text('base_transaction_id'),
    chargedAtoms: bigint('charged_atoms', { mode: 'bigint' }),
    actualRetailAtoms: numeric('actual_retail_atoms', { precision: 78, scale: 0, mode: 'bigint' }),
    meterItems: jsonb('meter_items').$type<
      Array<{
        dimension: string;
        tier: BillingRateTier;
        quantity: string;
        numeratorCreditAtoms: string;
        denominatorUnits: string;
      }>
    >(),
    inputTokens: bigint('input_tokens', { mode: 'bigint' }),
    outputTokens: bigint('output_tokens', { mode: 'bigint' }),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.activationId, table.policyId],
      foreignColumns: [
        billingPolicyActivation.environment,
        billingPolicyActivation.id,
        billingPolicyActivation.policyId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.id, table.baseTransactionId],
      foreignColumns: [creditTransaction.accountId, creditTransaction.operationId, creditTransaction.id],
    }).onDelete('restrict'),
    uniqueIndex('credit_operation_attempt').on(table.accountId, table.surface, table.attemptKey),
    unique('credit_operation_account_id').on(table.accountId, table.id),
    unique('credit_operation_environment_id').on(table.environment, table.id),
    index('credit_operation_due')
      .on(table.dueAt, table.id)
      .where(sql`${table.customerState} = 'pending'`),
    index('credit_operation_pending_llm_account_activity_due')
      .on(table.accountId, table.activity, table.dueAt, table.id)
      .where(sql`${table.customerState} = 'pending' AND ${table.category} = 'llm'`),
    index('credit_operation_usage_page')
      .on(table.accountId, table.category, desc(table.usageOccurredAt), desc(table.terminalRevision), desc(table.id))
      .where(sql`${table.terminalRevision} IS NOT NULL`),
    check(
      'credit_operation_history',
      sql`(${table.historyVersion} IS NULL OR (${table.historyVersion} = 1 AND ${table.admittedAt} IS NOT NULL)) AND (${table.executionStatus} IS NULL OR ${table.executionStatus} IN ('succeeded','cancelled','failed','rejected','unknown')) AND (${table.meteringStatus} IS NULL OR ${table.meteringStatus} IN ('complete','partial','unavailable')) AND (${table.reasoningTokens} IS NULL OR ${table.reasoningTokens} >= 0)`,
    ),
    check(
      'credit_operation_amounts',
      sql`${table.authorizedAtoms} >= 0 AND ${table.promoHeldAtoms} >= 0 AND ${table.planHeldAtoms} >= 0 AND ${table.purchasedHeldAtoms} >= 0 AND ${table.promoHeldAtoms}::numeric + ${table.planHeldAtoms} + ${table.purchasedHeldAtoms} = ${table.authorizedAtoms}`,
    ),
    check(
      'credit_operation_states',
      sql`${table.category} IN ('llm','zoo_engine') AND ${table.dispatchState} IN ('admitted','intent_recorded','accepted','recovery_required') AND ${table.customerState} IN ('pending','settled','released','absorbed') AND ${table.supplierState} IN ('reserved','preliminary','unresolved','final','funded_exception') AND ${table.generation} > 0`,
    ),
    check(
      'credit_operation_terminal',
      sql`(${table.customerState} = 'pending' AND ${table.baseTransactionId} IS NULL AND ${table.terminalRevision} IS NULL AND ${table.resolvedAt} IS NULL AND ${table.chargedAtoms} IS NULL) OR (${table.customerState} <> 'pending' AND ${table.baseTransactionId} IS NOT NULL AND ${table.terminalRevision} IS NOT NULL AND ${table.terminalRevision} > 0 AND ${table.resolvedAt} IS NOT NULL AND ${table.chargedAtoms} IS NOT NULL AND ${table.chargedAtoms} BETWEEN 0 AND ${table.authorizedAtoms})`,
    ),
  ],
);

/** Content-free provider observations survive a crash before financial resolution. */
export const billingInvocationEvidence = billing.table(
  'billing_invocation_evidence',
  {
    id: text('id').primaryKey(),
    operationId: text('operation_id')
      .notNull()
      .references(() => creditOperation.id, { onDelete: 'restrict' }),
    payloadDigest: text('payload_digest').notNull(),
    evidence: jsonb('evidence')
      .$type<{
        kind: 'final_usage' | 'provider_rejected' | 'absorbed_unknown' | 'authorized_exhausted';
        usageOccurredAt?: string;
        executionStatus?: 'succeeded' | 'cancelled' | 'failed' | 'rejected' | 'unknown';
        reasoningTokens?: string;
        meterItems?: Array<{ dimension: string; tier: BillingRateTier; quantity: string }>;
        normalizationEvidence?: {
          version: string;
          providerRequestId?: string;
          terminalReason?: string;
          fields: Record<string, string>;
        };
      }>()
      .notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_invocation_evidence_delivery').on(table.operationId, table.payloadDigest),
    index('billing_invocation_evidence_operation').on(table.operationId, table.receivedAt, table.id),
    check('billing_invocation_evidence_bound', sql`octet_length(${table.evidence}::text) <= 32768`),
  ],
);

/** Retains the full observed overrun separately from the bounded customer charge and supplier holds. */
export const billingOperationException = billing.table(
  'billing_operation_exception',
  {
    id: text('id').primaryKey(),
    operationId: text('operation_id')
      .notNull()
      .references(() => creditOperation.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    sourceIdentity: text('source_identity').notNull(),
    quantum: text('quantum').notNull(),
    observedNumerator: text('observed_numerator').notNull(),
    observedDenominator: numeric('observed_denominator', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    maximum: numeric('maximum', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_operation_exception_cause').on(table.operationId, table.kind, table.sourceIdentity),
    check(
      'billing_operation_exception_amounts',
      sql`${table.observedNumerator} ~ '^(0|[1-9][0-9]{0,255})$' AND ${table.observedDenominator} > 0 AND ${table.maximum} >= 0`,
    ),
    check(
      'billing_operation_exception_kind',
      sql`(${table.kind} = 'customer_bound' AND ${table.quantum} = 'credit_atoms') OR (${table.kind} = 'supplier_bound' AND ${table.quantum} = 'pico_usd') OR (${table.kind} = 'input_bound' AND ${table.quantum} = 'input_tokens')`,
    ),
  ],
);

/** An observed pricing or supplier-bound overrun closes the SKU until protected review. */
export const billingRoutePause = billing.table(
  'billing_route_pause',
  {
    environment: text('environment').notNull(),
    sku: text('sku').notNull(),
    operationId: text('operation_id')
      .notNull()
      .references(() => creditOperation.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.environment, table.sku] }),
    foreignKey({
      columns: [table.environment, table.operationId],
      foreignColumns: [creditOperation.environment, creditOperation.id],
    }).onDelete('restrict'),
  ],
);

export const billingBudgetHold = billing.table(
  'billing_budget_hold',
  {
    id: text('id').primaryKey(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => billingBudget.id, { onDelete: 'restrict' }),
    operationId: text('operation_id')
      .notNull()
      .references(() => creditOperation.id, { onDelete: 'restrict' }),
    initialBound: numeric('initial_bound', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    remainingHeld: numeric('remaining_held', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    consumed: numeric('consumed', { precision: 78, scale: 0, mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    finalityState: text('finality_state').notNull().default('reserved'),
  },
  (table) => [
    uniqueIndex('billing_hold_cause').on(table.budgetId, table.operationId),
    check(
      'billing_hold_bound',
      sql`${table.initialBound} >= 0 AND ${table.remainingHeld} >= 0 AND ${table.consumed} >= 0 AND ${table.remainingHeld} + ${table.consumed} <= ${table.initialBound}`,
    ),
  ],
);

/** Stable financial identity, independent of the authentication record. */
export const billingStripeCustomer = billing.table(
  'billing_stripe_customer',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    unique('billing_stripe_customer_owner_id').on(table.accountId, table.id),
    unique('billing_stripe_customer_slot').on(
      table.accountId,
      table.environment,
      table.stripeAccountId,
      table.livemode,
    ),
    unique('billing_stripe_customer_remote').on(table.stripeAccountId, table.livemode, table.stripeCustomerId),
  ],
);

/** Paid causes are registered from verified source evidence before a grant. */
export const billingPurchase = billing.table(
  'billing_purchase',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    sourceIdentity: text('source_identity').notNull().unique(),
    offerSnapshot: jsonb('offer_snapshot').notNull(),
    creditAtoms: bigint('credit_atoms', { mode: 'bigint' }).notNull(),
    state: text('state').notNull(),
    customerBindingId: text('customer_binding_id'),
    requestId: text('request_id'),
    requestHash: text('request_hash'),
    returnPath: text('return_path'),
    purpose: text('purpose'),
    reloadConsentId: text('reload_consent_id'),
    reloadConsentVersion: integer('reload_consent_version'),
    automaticStartedAt: timestamp('automatic_started_at', { withTimezone: true }),
    automaticGrossCeilingMinor: bigint('automatic_gross_ceiling_minor', { mode: 'bigint' }),
    automaticSourceAcceptedAt: timestamp('automatic_source_accepted_at', { withTimezone: true }),
    automaticTerminalOutcome: text('automatic_terminal_outcome'),
    automaticTerminalAt: timestamp('automatic_terminal_at', { withTimezone: true }),
    taxEvidence: jsonb('tax_evidence').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidEvidence: jsonb('paid_evidence').$type<PaidPaymentEvidence>(),
    paymentIntentId: text('payment_intent_id'),
    chargeId: text('charge_id'),
    stripeAccountId: text('stripe_account_id'),
    livemode: boolean('livemode'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    receiptId: text('receipt_id'),
    grantedAtoms: bigint('granted_atoms', { mode: 'bigint' }),
    fulfilledRevision: bigint('fulfilled_revision', { mode: 'bigint' }),
  },
  (table): PgTableExtraConfigValue[] => [
    unique('billing_purchase_account_id').on(table.accountId, table.id),
    unique('billing_purchase_request').on(table.accountId, table.purpose, table.requestId),
    unique('billing_purchase_payment').on(table.stripeAccountId, table.livemode, table.paymentIntentId),
    unique('billing_purchase_charge').on(table.stripeAccountId, table.livemode, table.chargeId),
    foreignKey({
      columns: [table.accountId, table.customerBindingId],
      foreignColumns: [billingStripeCustomer.accountId, billingStripeCustomer.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.id, table.receiptId],
      foreignColumns: [creditTransaction.accountId, creditTransaction.purchaseId, creditTransaction.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_purchase_manual_pending')
      .on(table.accountId)
      .where(
        sql`${table.purpose} IN ('manual_checkout','manual_saved_card') AND ${table.state} IN ('prepared','creating','pending','attention','paid_unfulfilled')`,
      ),
    foreignKey({
      columns: [table.accountId, table.reloadConsentId],
      foreignColumns: [billingReloadConsent.accountId, billingReloadConsent.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_purchase_automatic_pending')
      .on(table.accountId)
      .where(sql`${table.purpose} = 'automatic' AND ${table.automaticTerminalOutcome} IS NULL`),
    check(
      'billing_purchase_automatic',
      sql`${table.purpose} IS DISTINCT FROM 'automatic' OR (${table.reloadConsentId} IS NOT NULL AND ${table.reloadConsentVersion} > 0 AND ${table.automaticStartedAt} IS NOT NULL AND ${table.automaticGrossCeilingMinor} > 0 AND (${table.automaticTerminalOutcome} IS NULL OR (${table.automaticTerminalOutcome} IN ('paid','no_charge_failure') AND ${table.automaticTerminalAt} IS NOT NULL)) AND (${table.automaticTerminalOutcome} IS DISTINCT FROM 'paid' OR ${table.automaticSourceAcceptedAt} IS NOT NULL))`,
    ),
    check('billing_purchase_atoms', sql`${table.creditAtoms} > 0`),
    check(
      'billing_purchase_lifecycle',
      sql`${table.state} IN ('prepared','creating','pending','attention','paid','paid_unfulfilled','fulfilled','failed','canceled')`,
    ),
    check(
      'billing_purchase_verified',
      sql`${table.state} NOT IN ('paid_unfulfilled','fulfilled') OR (${table.paidEvidence} IS NOT NULL AND ${table.paidAt} IS NOT NULL AND ${table.paymentIntentId} IS NOT NULL AND ${table.chargeId} IS NOT NULL AND ${table.customerBindingId} IS NOT NULL)`,
    ),
    check(
      'billing_purchase_owned',
      sql`${table.purpose} IS NULL OR (${table.purpose} IN ('manual_checkout','manual_saved_card','automatic') AND ${table.customerBindingId} IS NOT NULL AND ${table.requestId} IS NOT NULL AND ${table.requestHash} IS NOT NULL AND ${table.stripeAccountId} IS NOT NULL AND ${table.livemode} IS NOT NULL)`,
    ),
    check(
      'billing_purchase_receipt',
      sql`(${table.state} <> 'fulfilled' AND ${table.receiptId} IS NULL AND ${table.grantedAtoms} IS NULL AND ${table.fulfilledRevision} IS NULL AND ${table.fulfilledAt} IS NULL) OR (${table.state} = 'fulfilled' AND ${table.receiptId} IS NOT NULL AND ${table.grantedAtoms} IS NOT NULL AND ${table.grantedAtoms} BETWEEN 0 AND ${table.creditAtoms} AND ${table.fulfilledRevision} IS NOT NULL AND ${table.fulfilledRevision} > 0 AND ${table.fulfilledAt} IS NOT NULL)`,
    ),
  ],
);

export const billingPeriod = billing.table(
  'billing_period',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    sourceIdentity: text('source_identity').notNull().unique(),
    creditAtoms: bigint('credit_atoms', { mode: 'bigint' }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    subscriptionId: text('subscription_id'),
    invoiceId: text('invoice_id').unique(),
    offerSnapshot: jsonb('offer_snapshot').$type<PaymentOfferSnapshot>(),
    paidEvidence: jsonb('paid_evidence').$type<PaidPaymentEvidence>(),
    state: text('state').notNull().default('verified'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    receiptId: text('receipt_id'),
    grantedAtoms: bigint('granted_atoms', { mode: 'bigint' }),
    fulfilledRevision: bigint('fulfilled_revision', { mode: 'bigint' }),
  },
  (table): PgTableExtraConfigValue[] => [
    unique('billing_period_account_id').on(table.accountId, table.id),
    unique('billing_period_entitlement').on(table.subscriptionId, table.periodStart, table.periodEnd),
    foreignKey({
      columns: [table.accountId, table.subscriptionId],
      foreignColumns: [subscription.accountId, subscription.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.id, table.receiptId],
      foreignColumns: [creditTransaction.accountId, creditTransaction.periodId, creditTransaction.id],
    }).onDelete('restrict'),
    check('billing_period_range', sql`${table.creditAtoms} > 0 AND ${table.periodEnd} > ${table.periodStart}`),
    check(
      'billing_period_verified',
      sql`${table.subscriptionId} IS NULL OR (${table.offerSnapshot} IS NOT NULL AND ${table.paidEvidence} IS NOT NULL AND ${table.paidAt} IS NOT NULL AND ${table.invoiceId} IS NOT NULL)`,
    ),
    check(
      'billing_period_receipt',
      sql`(${table.state} = 'verified' AND ${table.receiptId} IS NULL AND ${table.grantedAtoms} IS NULL AND ${table.fulfilledRevision} IS NULL) OR (${table.state} = 'fulfilled' AND ${table.receiptId} IS NOT NULL AND ${table.grantedAtoms} IS NOT NULL AND ${table.grantedAtoms} BETWEEN 0 AND ${table.creditAtoms} AND ${table.fulfilledRevision} IS NOT NULL AND ${table.fulfilledRevision} > 0)`,
    ),
  ],
);

/** Immutable external request; dispatch intent can authorize exactly one POST. */
export const billingProviderLeg = billing.table(
  'billing_provider_leg',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    customerBindingId: text('customer_binding_id').notNull(),
    purchaseId: text('purchase_id'),
    subscriptionId: text('subscription_id'),
    reloadConsentId: text('reload_consent_id'),
    subscriptionOfferId: text('subscription_offer_id'),
    refundIntentId: text('refund_intent_id'),
    closureId: text('closure_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    expirationRequestedAt: timestamp('expiration_requested_at', { withTimezone: true }),
    kind: text('kind').notNull(),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    dispatchStartedAt: timestamp('dispatch_started_at', { withTimezone: true }),
    providerObjectId: text('provider_object_id'),
    redirectUrl: text('redirect_url'),
    state: text('state').notNull().default('prepared'),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    cancellationConfirmedAt: timestamp('cancellation_confirmed_at', { withTimezone: true }),
    noChargeEvidence: jsonb('no_charge_evidence').$type<NoChargeEvidence>(),
    terminalEvidence: jsonb('terminal_evidence').$type<
      | CheckoutExpiryEvidence
      | SubscriptionCancellationEvidence
      | SubscriptionCheckoutExpiryEvidence
      | PaymentCheckoutExpiryEvidence
      | RequestRejectedEvidence
    >(),
    errorCode: text('error_code'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.customerBindingId],
      foreignColumns: [billingStripeCustomer.accountId, billingStripeCustomer.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.purchaseId],
      foreignColumns: [billingPurchase.accountId, billingPurchase.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.subscriptionId],
      foreignColumns: [subscription.accountId, subscription.id],
    }).onDelete('restrict'),
    unique('billing_provider_request').on(table.accountId, table.kind, table.requestId),
    uniqueIndex('billing_provider_object')
      .on(table.customerBindingId, table.kind, table.providerObjectId)
      .where(sql`${table.kind} NOT IN ('subscription_update','subscription_cancel')`),
    foreignKey({
      columns: [table.accountId, table.reloadConsentId],
      foreignColumns: [billingReloadConsent.accountId, billingReloadConsent.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.subscriptionOfferId],
      foreignColumns: [billingSubscriptionOffer.accountId, billingSubscriptionOffer.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.refundIntentId],
      foreignColumns: [billingRefundIntent.accountId, billingRefundIntent.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.closureId],
      foreignColumns: [billingAccountClosure.accountId, billingAccountClosure.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_provider_active_purchase')
      .on(table.purchaseId)
      .where(sql`${table.state} <> 'no_charge' AND ${table.kind} IN ('payment_intent','checkout_payment')`),
    check('billing_provider_redirect_bound', sql`${table.redirectUrl} IS NULL OR length(${table.redirectUrl}) <= 4096`),
    check(
      'billing_provider_leg_kind',
      sql`(${table.kind} IN ('customer','portal','tax_calculation') AND ${table.purchaseId} IS NULL AND ${table.subscriptionId} IS NULL) OR (${table.kind} IN ('checkout_payment','payment_intent','tax_transaction') AND ${table.purchaseId} IS NOT NULL AND ${table.subscriptionId} IS NULL) OR (${table.kind} = 'checkout_subscription' AND ${table.purchaseId} IS NULL AND ${table.subscriptionId} IS NOT NULL) OR (${table.kind} = 'checkout_setup' AND ${table.reloadConsentId} IS NOT NULL AND ${table.purchaseId} IS NULL AND ${table.subscriptionId} IS NULL) OR (${table.kind} IN ('subscription_update','subscription_schedule') AND ${table.subscriptionOfferId} IS NOT NULL AND ${table.subscriptionId} IS NOT NULL AND ${table.purchaseId} IS NULL) OR (${table.kind} = 'subscription_cancel' AND ${table.closureId} IS NOT NULL AND ${table.subscriptionId} IS NOT NULL AND ${table.purchaseId} IS NULL) OR (${table.kind} = 'refund' AND ${table.refundIntentId} IS NOT NULL AND ${table.purchaseId} IS NULL AND ${table.subscriptionId} IS NULL)`,
    ),
    check(
      'billing_provider_no_charge',
      sql`${table.state} <> 'no_charge' OR ${table.dispatchStartedAt} IS NULL OR ((${table.kind} = 'payment_intent' AND (${table.noChargeEvidence} IS NOT NULL OR ${table.terminalEvidence}->>'version' = 'stripe-request-rejected-v1') OR ${table.kind} = 'subscription_cancel' AND ${table.terminalEvidence} IS NOT NULL) AND ${table.cancellationConfirmedAt} IS NOT NULL)`,
    ),
    check(
      'billing_provider_expired',
      sql`${table.state} <> 'expired' OR (${table.kind} IN ('checkout_setup','checkout_subscription','checkout_payment') AND ${table.terminalEvidence} IS NOT NULL AND ${table.expirationRequestedAt} IS NOT NULL)`,
    ),
    check('billing_provider_known', sql`${table.state} <> 'known' OR ${table.providerObjectId} IS NOT NULL`),
    check(
      'billing_provider_dispatch',
      sql`(${table.state} = 'prepared' AND ${table.dispatchStartedAt} IS NULL) OR ${table.state} = 'no_charge' OR (${table.state} IN ('dispatched','known','attention','expired') AND ${table.dispatchStartedAt} IS NOT NULL)`,
    ),
    check(
      'billing_provider_leg_state',
      sql`${table.state} IN ('prepared','dispatched','known','attention','no_charge','expired') AND (${table.cancellationConfirmedAt} IS NULL OR ${table.cancellationRequestedAt} IS NOT NULL)`,
    ),
  ],
);

/** Signed delivery evidence is retained independently of reconciliation success. */
export const stripeEventInbox = billing.table(
  'stripe_event_inbox',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    apiVersion: text('api_version').notNull(),
    eventType: text('event_type').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    eventCreatedAt: timestamp('event_created_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payloadDigest: text('payload_digest').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    state: text('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    errorCode: text('error_code'),
    claimGeneration: bigint('claim_generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
  },
  (table) => [
    unique('stripe_event_delivery').on(table.environment, table.stripeAccountId, table.livemode, table.eventId),
    index('stripe_event_due')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.state} <> 'done'`),
    check(
      'stripe_event_state',
      sql`${table.state} IN ('pending','processing','done') AND ${table.attempts} >= 0 AND ${table.claimGeneration} >= 0`,
    ),
  ],
);

/** Local generation fence serializes a source object's fetch and application. */
export const billingStripeSource = billing.table(
  'billing_stripe_source',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    state: text('state').notNull().default('pending'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    errorCode: text('error_code'),
  },
  (table) => [
    unique('billing_stripe_source_identity').on(
      table.environment,
      table.stripeAccountId,
      table.livemode,
      table.sourceType,
      table.sourceId,
    ),
    index('billing_stripe_source_due')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.state} <> 'done'`),
    check(
      'billing_stripe_source_state',
      sql`${table.state} IN ('pending','processing','done') AND ${table.generation} >= 0`,
    ),
  ],
);

export const billingPromotionIssuance = billing.table(
  'billing_promotion_issuance',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    promotionProgramId: text('promotion_program_id').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => billingBudget.id, { onDelete: 'restrict' }),
    atoms: bigint('atoms', { mode: 'bigint' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.budgetId],
      foreignColumns: [billingBudget.environment, billingBudget.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_promotion_entitlement').on(
      table.accountId,
      table.promotionProgramId,
      table.periodStart,
      table.periodEnd,
    ),
    unique('billing_promotion_account_id').on(table.accountId, table.id),
    check('billing_promotion_amount', sql`${table.atoms} > 0 AND ${table.periodEnd} > ${table.periodStart}`),
  ],
);

export const billingReversalCase = billing.table(
  'billing_reversal_case',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    purchaseId: text('purchase_id'),
    periodId: text('period_id'),
    originalAtoms: bigint('original_atoms', { mode: 'bigint' }).notNull(),
    source: text('source').notNull(),
    environment: text('environment'),
    stripeAccountId: text('stripe_account_id'),
    livemode: boolean('livemode'),
    currency: text('currency'),
    customerBindingId: text('customer_binding_id'),
    paymentIntentId: text('payment_intent_id'),
    chargeId: text('charge_id'),
    canonicalReceiptId: text('canonical_receipt_id'),
    originalPrincipalMinor: bigint('original_principal_minor', { mode: 'bigint' }),
    originalTaxMinor: bigint('original_tax_minor', { mode: 'bigint' }),
    originalGrossMinor: bigint('original_gross_minor', { mode: 'bigint' }),
    initialIssuedAtoms: bigint('initial_issued_atoms', { mode: 'bigint' }),
    withheldAtoms: bigint('withheld_atoms', { mode: 'bigint' }),
    deferredIssuedAtoms: bigint('deferred_issued_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    cumulativePrincipalLossMinor: bigint('cumulative_principal_loss_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    cumulativeTaxLossMinor: bigint('cumulative_tax_loss_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    cumulativeGrossLossMinor: bigint('cumulative_gross_loss_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    projectionDigest: text('projection_digest'),
    projectionSourceId: text('projection_source_id'),
    projectionSourceGeneration: bigint('projection_source_generation', { mode: 'bigint' }),
    projectionObservedAt: timestamp('projection_observed_at', { withTimezone: true }),
    projectionEvidence: jsonb('projection_evidence').$type<Record<string, unknown>>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    netAppliedAtoms: bigint('net_applied_atoms', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    unique('billing_reversal_account_id').on(table.accountId, table.id),
    unique('billing_reversal_charge').on(table.stripeAccountId, table.livemode, table.chargeId),
    unique('billing_reversal_payment').on(table.stripeAccountId, table.livemode, table.paymentIntentId),
    check(
      'billing_reversal_issuance',
      sql`${table.deferredIssuedAtoms} >= 0 AND (${table.initialIssuedAtoms} IS NULL OR (${table.initialIssuedAtoms} >= 0 AND ${table.withheldAtoms} >= 0 AND ${table.initialIssuedAtoms} + ${table.withheldAtoms} = ${table.originalAtoms} AND ${table.deferredIssuedAtoms} <= ${table.withheldAtoms}))`,
    ),
    check(
      'billing_reversal_cash',
      sql`(${table.originalPrincipalMinor} IS NULL AND ${table.initialIssuedAtoms} IS NULL) OR (${table.originalPrincipalMinor} IS NOT NULL AND ${table.originalTaxMinor} IS NOT NULL AND ${table.originalGrossMinor} IS NOT NULL AND ${table.environment} IS NOT NULL AND ${table.customerBindingId} IS NOT NULL AND ${table.canonicalReceiptId} IS NOT NULL AND ${table.projectionDigest} IS NOT NULL AND ${table.projectionSourceId} IS NOT NULL AND ${table.projectionSourceGeneration} IS NOT NULL AND ${table.projectionObservedAt} IS NOT NULL AND ${table.projectionEvidence} IS NOT NULL AND ${table.originalPrincipalMinor} > 0 AND ${table.originalTaxMinor} >= 0 AND ${table.originalGrossMinor}::numeric = ${table.originalPrincipalMinor}::numeric + ${table.originalTaxMinor} AND ${table.cumulativePrincipalLossMinor} BETWEEN 0 AND ${table.originalPrincipalMinor} AND ${table.cumulativeTaxLossMinor} BETWEEN 0 AND ${table.originalTaxMinor} AND ${table.cumulativeGrossLossMinor} BETWEEN 0 AND ${table.originalGrossMinor} AND ${table.initialIssuedAtoms} IS NOT NULL AND ${table.withheldAtoms} IS NOT NULL AND ${table.currency} IS NOT NULL AND ${table.stripeAccountId} IS NOT NULL AND ${table.livemode} IS NOT NULL AND ${table.chargeId} IS NOT NULL AND ${table.paymentIntentId} IS NOT NULL)`,
    ),
    uniqueIndex('billing_reversal_purchase').on(table.purchaseId),
    uniqueIndex('billing_reversal_period').on(table.periodId),
    foreignKey({
      columns: [table.accountId, table.purchaseId],
      foreignColumns: [billingPurchase.accountId, billingPurchase.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.periodId],
      foreignColumns: [billingPeriod.accountId, billingPeriod.id],
    }).onDelete('restrict'),
    check(
      'billing_reversal_bounds',
      sql`${table.originalAtoms} >= 0 AND ${table.netAppliedAtoms} BETWEEN 0 AND coalesce(${table.initialIssuedAtoms},${table.originalAtoms}) + ${table.deferredIssuedAtoms} AND num_nonnulls(${table.purchaseId}, ${table.periodId}) = 1 AND ${table.source} IN ('plan','purchased')`,
    ),
  ],
);

export const creditTransaction = billing.table(
  'credit_transaction',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
    kind: text('kind').notNull(),
    operationId: text('operation_id'),
    purchaseId: text('purchase_id'),
    periodId: text('period_id'),
    stripeAccountId: text('stripe_account_id'),
    livemode: boolean('livemode'),
    paymentIntentId: text('payment_intent_id'),
    chargeId: text('charge_id'),
    reversalCaseId: text('reversal_case_id'),
    promotionIssuanceId: text('promotion_issuance_id'),
    correctionOf: text('correction_of'),
    cashEvidence: jsonb('cash_evidence').$type<Record<string, unknown>>(),
    promoDeltaAtoms: bigint('promo_delta_atoms', { mode: 'bigint' }).notNull(),
    planDeltaAtoms: bigint('plan_delta_atoms', { mode: 'bigint' }).notNull(),
    purchasedDeltaAtoms: bigint('purchased_delta_atoms', { mode: 'bigint' }).notNull(),
    debtDeltaAtoms: bigint('debt_delta_atoms', { mode: 'bigint' }).notNull(),
    accountDeltaAtoms: bigint('account_delta_atoms', { mode: 'bigint' }).notNull(),
    balanceAfterAtoms: bigint('balance_after_atoms', { mode: 'bigint' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.accountId, table.correctionOf],
      foreignColumns: [table.accountId, table.id],
    }).onDelete('restrict'),
    unique('credit_transaction_operation_id').on(table.accountId, table.operationId, table.id),
    uniqueIndex('credit_transaction_payment_intent').on(table.stripeAccountId, table.livemode, table.paymentIntentId),
    uniqueIndex('credit_transaction_charge').on(table.stripeAccountId, table.livemode, table.chargeId),
    check(
      'credit_transaction_collected_source',
      sql`num_nonnulls(${table.stripeAccountId}, ${table.livemode}, ${table.paymentIntentId}, ${table.chargeId}) = 0 OR (${table.kind} IN ('purchase_grant', 'period_grant') AND num_nonnulls(${table.stripeAccountId}, ${table.livemode}, ${table.paymentIntentId}, ${table.chargeId}) = 4)`,
    ),
    uniqueIndex('credit_transaction_revision').on(table.accountId, table.revision),
    index('credit_transaction_corrections')
      .on(table.accountId, table.correctionOf, table.revision, table.id)
      .where(sql`${table.kind} = 'compensation'`),
    unique('credit_transaction_account_id').on(table.accountId, table.id),
    unique('credit_transaction_purchase_receipt').on(table.accountId, table.purchaseId, table.id),
    unique('credit_transaction_period_receipt').on(table.accountId, table.periodId, table.id),
    uniqueIndex('credit_transaction_resolution')
      .on(table.operationId)
      .where(sql`${table.kind} = 'operation_resolution'`),
    uniqueIndex('credit_transaction_purchase')
      .on(table.purchaseId)
      .where(sql`${table.kind} = 'purchase_grant'`),
    uniqueIndex('credit_transaction_period')
      .on(table.periodId)
      .where(sql`${table.kind} = 'period_grant'`),
    uniqueIndex('credit_transaction_promotion').on(table.promotionIssuanceId),
    foreignKey({
      columns: [table.accountId, table.operationId],
      foreignColumns: [creditOperation.accountId, creditOperation.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.purchaseId],
      foreignColumns: [billingPurchase.accountId, billingPurchase.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.periodId],
      foreignColumns: [billingPeriod.accountId, billingPeriod.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.reversalCaseId],
      foreignColumns: [billingReversalCase.accountId, billingReversalCase.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.promotionIssuanceId],
      foreignColumns: [billingPromotionIssuance.accountId, billingPromotionIssuance.id],
    }).onDelete('restrict'),
    check(
      'credit_transaction_sum',
      sql`${table.accountDeltaAtoms}::numeric = ${table.promoDeltaAtoms}::numeric + ${table.planDeltaAtoms} + ${table.purchasedDeltaAtoms} - ${table.debtDeltaAtoms} AND ${table.revision} > 0`,
    ),
    check(
      'credit_transaction_cause',
      sql`(${table.kind} = 'operation_resolution' AND ${table.operationId} IS NOT NULL AND num_nonnulls(${table.purchaseId},${table.periodId},${table.reversalCaseId},${table.promotionIssuanceId},${table.correctionOf}) = 0) OR (${table.kind} = 'purchase_grant' AND ${table.purchaseId} IS NOT NULL AND num_nonnulls(${table.operationId},${table.periodId},${table.reversalCaseId},${table.promotionIssuanceId},${table.correctionOf}) = 0) OR (${table.kind} = 'period_grant' AND ${table.periodId} IS NOT NULL AND num_nonnulls(${table.operationId},${table.purchaseId},${table.reversalCaseId},${table.promotionIssuanceId},${table.correctionOf}) = 0) OR (${table.kind} = 'promotion_grant' AND ${table.promotionIssuanceId} IS NOT NULL AND num_nonnulls(${table.operationId},${table.purchaseId},${table.periodId},${table.reversalCaseId},${table.correctionOf}) = 0) OR (${table.kind} = 'reversal' AND ${table.reversalCaseId} IS NOT NULL AND num_nonnulls(${table.operationId},${table.purchaseId},${table.periodId},${table.promotionIssuanceId},${table.correctionOf}) = 0) OR (${table.kind} = 'deferred_grant' AND ${table.reversalCaseId} IS NOT NULL AND ${table.correctionOf} IS NOT NULL AND ${table.cashEvidence} IS NOT NULL AND num_nonnulls(${table.operationId},${table.purchaseId},${table.periodId},${table.promotionIssuanceId}) = 0) OR (${table.kind} = 'compensation' AND ${table.correctionOf} IS NOT NULL AND num_nonnulls(${table.purchaseId},${table.periodId},${table.reversalCaseId},${table.promotionIssuanceId}) = 0)`,
    ),
  ],
);

export const supplierCostEvidence = billing.table(
  'supplier_cost_evidence',
  {
    id: text('id').primaryKey(),
    operationId: text('operation_id').references(() => creditOperation.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    provider: text('provider').notNull(),
    credentialAccount: text('credential_account').notNull(),
    sourceObjectId: text('source_object_id').notNull(),
    sourceRevision: text('source_revision').notNull(),
    payloadDigest: text('payload_digest').notNull(),
    numerator: numeric('numerator', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    denominator: numeric('denominator', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    completeness: text('completeness').notNull(),
    finality: text('finality').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('supplier_evidence_source').on(
      table.environment,
      table.provider,
      table.credentialAccount,
      table.sourceObjectId,
      table.sourceRevision,
    ),
    check(
      'supplier_evidence_values',
      sql`${table.numerator} >= 0 AND ${table.denominator} > 0 AND ${table.completeness} IN ('partial','complete') AND ${table.finality} IN ('preliminary','final')`,
    ),
  ],
);

/** Durable identity for a paired outbound Tau Host daemon. */
export const hostDevice = pgTable(
  'agent_device',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    credentialHash: text('credential_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    revokedAt: timestamp('revoked_at'),
    /**
     * Set on a cloud host (launcher 3) and nowhere else: the project whose
     * container this device *is*. A paired laptop keeps it null.
     *
     * It carries the idempotence of `POST /v1/agents/cloud` — one live cloud
     * host per owner and project — and is the only way the API can tell a
     * provisioned device from a paired one, which decides whether revoking it
     * also stops a container and which project a run directory row belongs to.
     */
    cloudProjectId: text('cloud_project_id'),
  },
  (table) => [
    uniqueIndex('agent_device_credential_hash_idx').on(table.credentialHash),
    index('agent_device_owner_idx').on(table.ownerId, desc(table.createdAt)),
    /* Partial: a revoked cloud host stays as history and must not block the
     * next provisioning of the same project. */
    uniqueIndex('agent_device_cloud_project_idx')
      .on(table.ownerId, table.cloudProjectId)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

/** Run lifecycle states the run directory records (PH19 ruling 2). */
export const agentRunStates = ['admitted', 'running', 'awaiting-approval', 'completed', 'failed', 'cancelled'] as const;

/**
 * The run *directory* — identity and state, never content (PH19 ruling 2).
 *
 * The canonical record of a run is `<workspace>/.tau/chats/<chatId>/events.jsonl`
 * on the host that owns it. This table exists so a client that has lost its page
 * can discover that a run is out there and which host to tail; it holds no
 * message, no tool call and no transcript, and nothing here is ever a source for
 * rendering a chat.
 *
 * Host placements only. A browser-local run registers nothing at all (charter
 * OQ-6): the rung-1 page has no API session, and a row it could not keep current
 * would be worse than the absence that already says "this run died with its tab".
 */
export const agentRun = pgTable(
  'agent_run',
  {
    runId: text('run_id').primaryKey(),
    chatId: text('chat_id').notNull(),
    /**
     * Known for a cloud host, which is provisioned per project; null for a
     * paired laptop, whose T0 wire carries no project identity.
     */
    projectId: text('project_id'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The host that owns the run's log — an `agent_device` id. */
    placement: text('placement')
      .notNull()
      .references(() => hostDevice.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('agent_run_placement_idx').on(table.placement, desc(table.updatedAt)),
    index('agent_run_owner_idx').on(table.ownerId, desc(table.updatedAt)),
    check(
      'agent_run_state_check',
      sql`${table.state} IN ('admitted', 'running', 'awaiting-approval', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

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

/** Durable projection for one logical background job. */
export const jobRun = pgTable(
  'job_run',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull(),
    streamId: text('stream_id')
      .notNull()
      .references(() => durableStream.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    definitionHash: text('definition_hash').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    state: text('state').notNull().default('queued'),
    orchestratorRunId: text('orchestrator_run_id'),
    currentAttempt: integer('current_attempt').notNull().default(0),
    runnerId: text('runner_id'),
    leaseUntil: timestamp('lease_until'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    cancelRequestedAt: timestamp('cancel_requested_at'),
    cancellationDispatchedAt: timestamp('cancellation_dispatched_at'),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    uniqueIndex('job_run_stream_idx').on(table.streamId),
    uniqueIndex('job_run_idempotency_idx').on(table.ownerId, table.projectId, table.idempotencyKey),
    uniqueIndex('job_run_orchestrator_idx').on(table.orchestratorRunId),
    index('job_run_queue_idx').on(table.state, table.createdAt),
    index('job_run_runner_lease_idx').on(table.runnerId, table.leaseUntil),
    check(
      'job_run_state_check',
      sql`${table.state} IN ('queued', 'assigned', 'preparing', 'running', 'waiting', 'uploading', 'completed', 'failed', 'cancel_requested', 'cancelled')`,
    ),
    check('job_run_attempt_check', sql`${table.currentAttempt} >= 0`),
  ],
);

/** Durable at-least-once dispatch intent; Hatchet idempotency closes the crash-after-trigger window. */
export const jobDispatchOutbox = pgTable(
  'job_dispatch_outbox',
  {
    jobId: text('job_id')
      .primaryKey()
      .references(() => jobRun.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at').defaultNow().notNull(),
    claimedUntil: timestamp('claimed_until'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('job_dispatch_outbox_ready_idx').on(table.availableAt, table.claimedUntil),
    check('job_dispatch_outbox_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

/** One leased, at-least-once execution attempt for a job. */
export const jobAttempt = pgTable(
  'job_attempt',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobRun.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    runnerId: text('runner_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    state: text('state').notNull(),
    leaseUntil: timestamp('lease_until').notNull(),
    heartbeatAt: timestamp('heartbeat_at').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
    terminalReason: text('terminal_reason'),
  },
  (table) => [
    uniqueIndex('job_attempt_number_idx').on(table.jobId, table.attempt),
    index('job_attempt_runner_idx').on(table.runnerId, table.state),
    check('job_attempt_number_check', sql`${table.attempt} > 0`),
    check(
      'job_attempt_state_check',
      sql`${table.state} IN ('assigned', 'preparing', 'running', 'uploading', 'completed', 'failed', 'cancelled', 'lost')`,
    ),
  ],
);

/** Immutable output metadata; bytes live in the artifact data plane. */
export const jobArtifact = pgTable(
  'job_artifact',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => jobAttempt.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobRun.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    role: text('role').notNull(),
    logicalPath: text('logical_path').notNull(),
    mediaType: text('media_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    sha256: text('sha256').notNull(),
    storageRef: text('storage_ref').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('job_artifact_path_idx').on(table.jobId, table.logicalPath),
    index('job_artifact_sha_idx').on(table.sha256),
    check('job_artifact_size_check', sql`${table.sizeBytes} >= 0`),
  ],
);

/** Last durable capability and capacity advertisement from an execution host. */
export const jobRunner = pgTable(
  'job_runner',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    capabilities: jsonb('capabilities').$type<Record<string, unknown>>().notNull(),
    totalSlots: integer('total_slots').notNull(),
    usedSlots: integer('used_slots').notNull().default(0),
    lastHeartbeatAt: timestamp('last_heartbeat_at').notNull(),
    drainingAt: timestamp('draining_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    index('job_runner_heartbeat_idx').on(table.lastHeartbeatAt),
    check('job_runner_total_slots_check', sql`${table.totalSlots} > 0`),
    check('job_runner_used_slots_check', sql`${table.usedSlots} >= 0 AND ${table.usedSlots} <= ${table.totalSlots}`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */

/** Versioned customer permission; accepted terms never change with current policy. */
export const billingReloadConsent = billing.table(
  'billing_reload_consent',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    version: integer('version').notNull(),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    returnPath: text('return_path').notNull(),
    customerBindingId: text('customer_binding_id').notNull(),
    policyId: text('policy_id').notNull(),
    termsDigest: text('terms_digest').notNull(),
    offerSnapshot: jsonb('offer_snapshot').$type<PaymentOfferSnapshot>().notNull(),
    taxEvidence: jsonb('tax_evidence').$type<Record<string, unknown>>().notNull(),
    currency: text('currency').notNull(),
    principalMinor: bigint('principal_minor', { mode: 'bigint' }).notNull(),
    quotedTaxMinor: bigint('quoted_tax_minor', { mode: 'bigint' }).notNull(),
    grossCeilingMinor: bigint('gross_ceiling_minor', { mode: 'bigint' }).notNull(),
    thresholdAtoms: bigint('threshold_atoms', { mode: 'bigint' }).notNull(),
    monthlyGrossCapMinor: bigint('monthly_gross_cap_minor', { mode: 'bigint' }).notNull(),
    minimumCadenceSeconds: integer('minimum_cadence_seconds').notNull(),
    terminalFailureLimit: integer('terminal_failure_limit').notNull(),
    checkoutSessionId: text('checkout_session_id'),
    setupIntentId: text('setup_intent_id'),
    paymentMethodId: text('payment_method_id'),
    paymentMethod: jsonb('payment_method').$type<PaymentOfferSnapshot['paymentMethod']>(),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    state: text('state').notNull().default('pending_setup'),
    consecutiveTerminalFailures: integer('consecutive_terminal_failures').notNull().default(0),
    lastAutomaticStartedAt: timestamp('last_automatic_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_reload_consent_owner').on(table.accountId, table.id),
    unique('billing_reload_consent_version').on(table.accountId, table.version),
    unique('billing_reload_consent_request').on(table.accountId, table.requestId),
    foreignKey({
      columns: [table.accountId, table.customerBindingId],
      foreignColumns: [billingStripeCustomer.accountId, billingStripeCustomer.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    uniqueIndex('billing_reload_consent_active')
      .on(table.accountId)
      .where(sql`${table.state} IN ('pending_setup','enabled')`),
    check(
      'billing_reload_consent_limits',
      sql`${table.version} > 0 AND ${table.principalMinor} > 0 AND ${table.quotedTaxMinor} >= 0 AND ${table.grossCeilingMinor}::numeric >= ${table.principalMinor}::numeric + ${table.quotedTaxMinor} AND ${table.monthlyGrossCapMinor} >= ${table.grossCeilingMinor} AND ${table.thresholdAtoms} > 0 AND ${table.minimumCadenceSeconds} >= 3600 AND ${table.terminalFailureLimit} BETWEEN 1 AND 2 AND ${table.consecutiveTerminalFailures} >= 0 AND ${table.currency} = 'usd'`,
    ),
    check(
      'billing_reload_consent_state',
      sql`${table.state} IN ('pending_setup','enabled','paused_terms','disabled_failures','revoked') AND (${table.state} <> 'enabled' OR (${table.checkoutSessionId} IS NOT NULL AND ${table.setupIntentId} IS NOT NULL AND ${table.paymentMethodId} IS NOT NULL AND ${table.paymentMethod} IS NOT NULL AND ${table.consentedAt} IS NOT NULL))`,
    ),
  ],
);

/** A recent funded-work signal is not authority to create a payment. */
export const billingReloadWork = billing.table(
  'billing_reload_work',
  {
    accountId: text('account_id')
      .primaryKey()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    reasonKind: text('reason_kind').notNull(),
    reasonOperationId: text('reason_operation_id'),
    reasonAttemptKey: text('reason_attempt_key'),
    reasonRequestDigest: text('reason_request_digest'),
    observedAccountRevision: bigint('observed_account_revision', { mode: 'bigint' }).notNull(),
    state: text('state').notNull().default('pending'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    index('billing_reload_work_due')
      .on(table.nextAttemptAt, table.accountId)
      .where(sql`${table.state} <> 'done'`),
    check(
      'billing_reload_work_state',
      sql`${table.state} IN ('pending','processing','done') AND ${table.generation} >= 0 AND ${table.observedAccountRevision} >= 0 AND ${table.reasonKind} IN ('admission','settlement','insufficient_funds')`,
    ),
  ],
);

/** Future disclosed renewal terms; the initial subscription snapshot stays historical. */
export const billingSubscriptionOffer = billing.table(
  'billing_subscription_offer',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    effectivePeriodStart: timestamp('effective_period_start', { withTimezone: true }).notNull(),
    disclosedAt: timestamp('disclosed_at', { withTimezone: true }).notNull(),
    policyId: text('policy_id').notNull(),
    offerSnapshot: jsonb('offer_snapshot').$type<PaymentOfferSnapshot>().notNull(),
    termsDigest: text('terms_digest').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    stripeProductId: text('stripe_product_id').notNull(),
    stripeSubscriptionItemId: text('stripe_subscription_item_id').notNull(),
    stripeScheduleId: text('stripe_schedule_id'),
    sourceEvidence: jsonb('source_evidence').$type<Record<string, unknown>>().notNull(),
    scheduleEvidence: jsonb('schedule_evidence').$type<Record<string, unknown>>(),
    state: text('state').notNull().default('prepared'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_subscription_offer_owner').on(table.accountId, table.id),
    unique('billing_subscription_offer_period').on(table.subscriptionId, table.effectivePeriodStart),
    foreignKey({
      columns: [table.accountId, table.subscriptionId],
      foreignColumns: [subscription.accountId, subscription.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    check(
      'billing_subscription_offer_state',
      sql`${table.state} IN ('prepared','dispatched','confirmed','attention') AND ${table.disclosedAt} <= ${table.effectivePeriodStart} AND (${table.state} <> 'confirmed' OR (${table.stripeScheduleId} IS NOT NULL AND ${table.scheduleEvidence} IS NOT NULL))`,
    ),
  ],
);

/** Minimal retained closure identity, including unknown external creation obligations. */
export const billingAccountClosure = billing.table(
  'billing_account_closure',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().unique(),
    bindingId: text('binding_id')
      .notNull()
      .references(() => billingOwnerBinding.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    state: text('state').notNull().default('closing'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer('attempt_count').notNull().default(0),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    bindingRevokedAt: timestamp('binding_revoked_at', { withTimezone: true }).notNull(),
    obligationsFrozenAt: timestamp('obligations_frozen_at', { withTimezone: true }).notNull(),
    authDeletedAt: timestamp('auth_deleted_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    attentionCode: text('attention_code'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('billing_account_closure_generation', sql`${table.generation} >= 0 AND ${table.attemptCount} >= 0`),
    index('billing_account_closure_due')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.state} IN ('closing','cancellation_pending','attention')`),
    unique('billing_account_closure_owner').on(table.accountId, table.id),
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    check(
      'billing_account_closure_state',
      sql`${table.state} IN ('closing','cancellation_pending','ready_for_auth_deletion','closed','attention') AND (${table.state} <> 'closed' OR ${table.closedAt} IS NOT NULL)`,
    ),
  ],
);

/** Reviewed allocation and its own source hold; provider legs own external dispatch. */
export const billingRefundIntent = billing.table(
  'billing_refund_intent',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    environment: text('environment').notNull(),
    reversalCaseId: text('reversal_case_id').notNull(),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    requestedPrincipalMinor: bigint('requested_principal_minor', { mode: 'bigint' }).notNull(),
    requestedTaxMinor: bigint('requested_tax_minor', { mode: 'bigint' }).notNull(),
    requestedGrossMinor: bigint('requested_gross_minor', { mode: 'bigint' }).notNull(),
    approvedMaximumGrossMinor: bigint('approved_maximum_gross_minor', { mode: 'bigint' }).notNull(),
    targetReversedAtoms: bigint('target_reversed_atoms', { mode: 'bigint' }).notNull(),
    holdAtoms: bigint('hold_atoms', { mode: 'bigint' }).notNull(),
    holdState: text('hold_state').notNull().default('held'),
    reviewActorId: text('review_actor_id').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    state: text('state').notNull().default('prepared'),
    sourceDigest: text('source_digest').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_refund_intent_owner').on(table.accountId, table.id),
    unique('billing_refund_intent_request').on(table.reversalCaseId, table.requestId),
    foreignKey({
      columns: [table.accountId, table.reversalCaseId],
      foreignColumns: [billingReversalCase.accountId, billingReversalCase.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.environment, table.accountId],
      foreignColumns: [creditAccount.environment, creditAccount.id],
    }).onDelete('restrict'),
    check(
      'billing_refund_intent_amount',
      sql`${table.requestedPrincipalMinor} >= 0 AND ${table.requestedTaxMinor} >= 0 AND ${table.requestedGrossMinor} > 0 AND ${table.requestedPrincipalMinor}::numeric + ${table.requestedTaxMinor} = ${table.requestedGrossMinor} AND ${table.requestedGrossMinor} <= ${table.approvedMaximumGrossMinor} AND ${table.targetReversedAtoms} >= 0 AND ${table.holdAtoms} BETWEEN 0 AND ${table.targetReversedAtoms}`,
    ),
    check(
      'billing_refund_intent_state',
      sql`${table.state} IN ('prepared','pending','attention','succeeded','failed','canceled') AND ${table.holdState} IN ('held','released','applied') AND (${table.state} NOT IN ('succeeded','failed','canceled') OR (${table.holdState} <> 'held' AND ${table.confirmedAt} IS NOT NULL))`,
    ),
  ],
);

/** Complete independent period inventory; a page limit cannot claim coverage. */
export const billingCashScan = billing.table(
  'billing_cash_scan',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    currency: text('currency').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    lookbackStart: timestamp('lookback_start', { withTimezone: true }).notNull(),
    frozenAt: timestamp('frozen_at', { withTimezone: true }).notNull().defaultNow(),
    balanceCursor: text('balance_cursor'),
    paymentIntentCursor: text('payment_intent_cursor'),
    chargeCursor: text('charge_cursor'),
    refundCursor: text('refund_cursor'),
    balanceDone: boolean('balance_done').notNull().default(false),
    paymentIntentDone: boolean('payment_intent_done').notNull().default(false),
    chargeDone: boolean('charge_done').notNull().default(false),
    refundDone: boolean('refund_done').notNull().default(false),
    journalCursor: text('journal_cursor'),
    factCursor: text('fact_cursor'),
    journalDone: boolean('journal_done').notNull().default(false),
    factDone: boolean('fact_done').notNull().default(false),
    state: text('state').notNull().default('pending'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    unique('billing_cash_scan_window').on(
      table.environment,
      table.stripeAccountId,
      table.livemode,
      table.currency,
      table.windowStart,
      table.windowEnd,
    ),
    index('billing_cash_scan_due')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.state} <> 'complete'`),
    check(
      'billing_cash_scan_bounds',
      sql`${table.lookbackStart} <= ${table.windowStart} AND ${table.windowStart} < ${table.windowEnd} AND ${table.generation} >= 0 AND ${table.attempts} >= 0`,
    ),
    check(
      'billing_cash_scan_state',
      sql`${table.state} IN ('pending','running','incomplete','complete','attention') AND (${table.state} <> 'complete' OR (${table.balanceDone} AND ${table.paymentIntentDone} AND ${table.chargeDone} AND ${table.refundDone} AND ${table.journalDone} AND ${table.factDone} AND ${table.completedAt} IS NOT NULL))`,
    ),
  ],
);

/** Immutable external observations survive internally consistent missing ledger effects. */
export const billingCashFact = billing.table(
  'billing_cash_fact',
  {
    id: text('id').primaryKey(),
    scanId: text('scan_id').references(() => billingCashScan.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceCreatedAt: timestamp('source_created_at', { withTimezone: true }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    currency: text('currency'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }),
    feeMinor: bigint('fee_minor', { mode: 'bigint' }),
    netMinor: bigint('net_minor', { mode: 'bigint' }),
    customerId: text('customer_id'),
    paymentIntentId: text('payment_intent_id'),
    chargeId: text('charge_id'),
    refundId: text('refund_id'),
    disputeId: text('dispute_id'),
    balanceTransactionId: text('balance_transaction_id'),
    objectDigest: text('object_digest').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('billing_cash_fact_identity').on(
      table.environment,
      table.stripeAccountId,
      table.livemode,
      table.sourceType,
      table.sourceId,
      table.objectDigest,
    ),
    index('billing_cash_fact_source').on(table.stripeAccountId, table.livemode, table.sourceType, table.sourceId),
  ],
);

/** Coverage links reuse immutable source facts across overlapping independent scans. */
export const billingCashScanFact = billing.table(
  'billing_cash_scan_fact',
  {
    scanId: text('scan_id')
      .notNull()
      .references(() => billingCashScan.id, { onDelete: 'restrict' }),
    factId: text('fact_id')
      .notNull()
      .references(() => billingCashFact.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.scanId, table.factId] })],
);

/** Typed operational exceptions; no cash or credit authority follows from opening a case. */
export const billingFinancialCase = billing.table(
  'billing_financial_case',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    accountId: text('account_id').references(() => creditAccount.id, { onDelete: 'restrict' }),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    currency: text('currency'),
    knownAmountMinor: bigint('known_amount_minor', { mode: 'bigint' }),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    owner: text('owner').notNull(),
    nextStep: text('next_step').notNull(),
    state: text('state').notNull().default('open'),
    firstEffectiveAt: timestamp('first_effective_at', { withTimezone: true }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionEvidence: jsonb('resolution_evidence').$type<Record<string, unknown>>(),
  },
  (table) => [
    unique('billing_financial_case_identity').on(
      table.environment,
      table.stripeAccountId,
      table.livemode,
      table.kind,
      table.dedupeKey,
    ),
    check(
      'billing_financial_case_state',
      sql`${table.state} IN ('open','attention','resolved') AND (${table.state} <> 'resolved' OR (${table.resolvedAt} IS NOT NULL AND ${table.resolutionEvidence} IS NOT NULL))`,
    ),
  ],
);

/**
 * Durable account-journal reconciliation cursors, one row per financial scope.
 *
 * The incremental keyset covers journal change markers and the sweep keyset covers accounts;
 * both advance only inside the transaction that commits the batch's own case effects, so a
 * crash re-reads the same batch instead of skipping it.
 */
export const billingJournalCheckpoint = billing.table(
  'billing_journal_checkpoint',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    /** Journal change marker `(occurred_at, id)` verified by the incremental pass. */
    incrementalOccurredAt: timestamp('incremental_occurred_at', { withTimezone: true }),
    incrementalTransactionId: text('incremental_transaction_id'),
    /** Keyset over `credit_account.id`; null restarts the bounded full sweep. */
    sweepAccountId: text('sweep_account_id'),
    sweepCycles: bigint('sweep_cycles', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
  },
  (table) => [
    unique('billing_journal_checkpoint_scope').on(table.environment, table.stripeAccountId, table.livemode),
    check(
      'billing_journal_checkpoint_bounds',
      sql`${table.generation} >= 0 AND ${table.sweepCycles} >= 0 AND num_nonnulls(${table.incrementalOccurredAt}, ${table.incrementalTransactionId}) <> 1`,
    ),
  ],
);

/** Complete tax observations form a source-fenced immutable correction chain. */
export const billingTaxFact = billing.table(
  'billing_tax_fact',
  {
    id: text('id').primaryKey(),
    environment: text('environment').notNull(),
    stripeAccountId: text('stripe_account_id').notNull(),
    livemode: boolean('livemode').notNull(),
    accountId: text('account_id').references(() => creditAccount.id, { onDelete: 'restrict' }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceClaimId: text('source_claim_id')
      .notNull()
      .references(() => billingStripeSource.id, { onDelete: 'restrict' }),
    sourceGeneration: bigint('source_generation', { mode: 'bigint' }).notNull(),
    sourceDigest: text('source_digest').notNull(),
    supersedesFactId: text('supersedes_fact_id').references((): AnyPgColumn => billingTaxFact.id, {
      onDelete: 'restrict',
    }),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    classification: text('classification').notNull(),
    reportingRevenueMinor: bigint('reporting_revenue_minor', { mode: 'bigint' }),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('billing_tax_fact_source').on(
      table.environment,
      table.stripeAccountId,
      table.livemode,
      table.sourceType,
      table.sourceId,
      table.sourceDigest,
    ),
    unique('billing_tax_fact_successor').on(table.supersedesFactId),
    index('billing_tax_fact_monitor').on(table.environment, table.stripeAccountId, table.livemode, table.effectiveAt),
    check(
      'billing_tax_fact_classification',
      sql`${table.classification} IN ('eu_b2c','uk_b2c','enterprise_vat_invoice','outside_monitor','unknown') AND ${table.sourceGeneration} > 0 AND (${table.reportingRevenueMinor} IS NULL OR ${table.reportingRevenueMinor} >= 0) AND (${table.classification} <> 'unknown' OR ${table.reportingRevenueMinor} IS NULL)`,
    ),
  ],
);

/** Deduplicated recovery delivery remains pending until transport confirms it. */
export const billingRecoveryNotice = billing.table(
  'billing_recovery_notice',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'restrict' }),
    environment: text('environment').notNull(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    subscriptionId: text('subscription_id'),
    purchaseId: text('purchase_id'),
    invoiceId: text('invoice_id'),
    consentId: text('consent_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    state: text('state').notNull().default('pending'),
    generation: bigint('generation', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer('attempt_count').notNull().default(0),
    errorCode: text('error_code'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    deliveryReceipt: text('delivery_receipt'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('billing_recovery_notice_identity').on(table.environment, table.dedupeKey),
    index('billing_recovery_notice_due')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.state} <> 'delivered'`),
    check(
      'billing_recovery_notice_state',
      sql`${table.kind} IN ('renewal_failed','authentication_required','consent_disabled') AND ${table.state} IN ('pending','processing','delivered') AND ${table.generation} >= 0 AND ${table.attemptCount} >= 0 AND (${table.state} <> 'delivered' OR (${table.deliveredAt} IS NOT NULL AND ${table.deliveryReceipt} IS NOT NULL))`,
    ),
  ],
);
