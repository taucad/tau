import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';
import { durableStream } from '#schema/durable-events.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

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

/** Historical durable dispatch intent retained with existing job data while job execution is paused. */
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
