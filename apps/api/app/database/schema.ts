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
  primaryKey,
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

/**
 * Owner-scoped Paseo daemon **directory** record. The complete connection offer
 * and password exist only inside ciphertext, and are released to their owner
 * through `POST /v1/connectors/paseo/:id/offer` so the browser can open the
 * E2EE session itself (SP-10). Live connection state is the client's, not the
 * API's — `last_connected_at` / `last_error` left with the API's SDK client.
 */
export const paseoConnection = pgTable(
  'paseo_connection',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    serverId: text('server_id').notNull(),
    relayEndpoint: text('relay_endpoint').notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    uniqueIndex('paseo_connection_owner_server_idx')
      .on(table.ownerId, table.serverId)
      .where(sql`${table.revokedAt} IS NULL`),
    index('paseo_connection_owner_idx').on(table.ownerId, desc(table.createdAt)),
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
