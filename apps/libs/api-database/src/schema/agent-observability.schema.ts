import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/**
 * The protection each evidence source carried when Tau first received it
 * (blueprint T06). First write wins: a later upload under another tier, or a
 * client claim, can make a source stricter but never relabel it. There is no
 * project foreign key, so the lineage outlives a project cascade.
 */
export const agentEvidenceSource = pgTable(
  'agent_evidence_source',
  {
    principalId: text('principal_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull(),
    sourceId: text('source_id').notNull(),
    digest: text('digest').notNull(),
    protection: text('protection').$type<'pro' | 'free' | 'unknown'>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.principalId, table.projectId, table.sourceId] }),
    index('agent_evidence_source_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * One durable acceptance per immutable source projection (blueprint T06). The
 * row commits before the client is answered, so a replay finds it; the client
 * never learns of a receipt the database does not hold.
 */
export const agentEvidenceReceipt = pgTable(
  'agent_evidence_receipt',
  {
    id: text('id').primaryKey(),
    principalId: text('principal_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull(),
    sourceKey: text('source_key').notNull(),
    semanticKey: text('semantic_key').notNull(),
    projectionKey: text('projection_key').notNull(),
    sourceDigest: text('source_digest').notNull(),
    projectionDigest: text('projection_digest').notNull(),
    plane: text('plane').$type<'summary' | 'feedback' | 'content'>().notNull(),
    family: text('family').notNull(),
    /** The server's protection per lineage source at receipt; never the client's claim alone. */
    lineage: jsonb('lineage')
      .$type<ReadonlyArray<Readonly<{ source: string; protection: 'pro' | 'free' | 'unknown' }>>>()
      .notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('agent_evidence_receipt_projection_idx').on(table.projectionKey),
    index('agent_evidence_receipt_source_idx').on(table.sourceKey),
    index('agent_evidence_receipt_scope_idx').on(table.principalId, table.projectId),
    index('agent_evidence_receipt_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * The delivery backlog for an accepted receipt (blueprint T06, drained by T08).
 * `payload` is the sealed immutable evidence and is cleared once delivery is
 * confirmed or the record expires; it is a backlog, not an archive.
 */
export const agentEvidenceOutbox = pgTable(
  'agent_evidence_outbox',
  {
    receiptId: text('receipt_id')
      .primaryKey()
      .references(() => agentEvidenceReceipt.id, { onDelete: 'cascade' }),
    state: text('state')
      .$type<'pending' | 'sending' | 'confirmed' | 'uncertain' | 'rejected' | 'expired'>()
      .default('pending')
      .notNull(),
    keyVersion: integer('key_version').notNull(),
    payload: text('payload'),
    payloadBytes: integer('payload_bytes').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    leaseOwner: text('lease_owner'),
    /** A lease's end while `sending` or reconciling; otherwise when the row is next due. */
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    /** Langfuse trace id of the observation once sent; with the receipt it names the span (T08). */
    traceId: text('trace_id'),
    /** The observation's start time, the lower bound of a reconciliation read. */
    observedAt: timestamp('observed_at', { withTimezone: true }),
    /** When the last send began; a reconciliation gap is measured from it. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Bounded code for the last outcome (e.g. `http-503`, `gap`, `revoked`); never vendor text. */
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('agent_evidence_outbox_dispatch_idx').on(table.state, table.leaseExpiresAt),
    index('agent_evidence_outbox_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * An admitted erasure of an account's or a project's agent evidence (blueprint
 * T13). Content-free, and deliberately **without** foreign keys: it is written
 * before the account cascade or the project retirement it precedes, and has to
 * outlive both, because afterwards nothing else says which Langfuse traces were
 * theirs. One row per subject; a second request for it is the same erasure.
 */
export const agentEvidenceErasure = pgTable(
  'agent_evidence_erasure',
  {
    id: text('id').primaryKey(),
    scope: text('scope').$type<'account' | 'project'>().notNull(),
    /** The account or project id the erasure covers. */
    subjectId: text('subject_id').notNull(),
    admittedAt: timestamp('admitted_at', { withTimezone: true }).defaultNow().notNull(),
    /** Set once every trace it named was read back absent. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('agent_evidence_erasure_subject_idx').on(table.scope, table.subjectId),
    check('agent_evidence_erasure_scope_check', sql`${table.scope} IN ('account', 'project')`),
  ],
);

/**
 * One Langfuse trace an erasure must remove, copied from the backlog when the
 * erasure was admitted. A trace is deleted, then read back after delivery's
 * visibility window; only an absent read settles it.
 */
export const agentEvidenceErasureTrace = pgTable(
  'agent_evidence_erasure_trace',
  {
    erasureId: text('erasure_id')
      .notNull()
      .references(() => agentEvidenceErasure.id, { onDelete: 'cascade' }),
    traceId: text('trace_id').notNull(),
    state: text('state').$type<'pending' | 'requested' | 'absent'>().default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    leaseOwner: text('lease_owner'),
    /** A lease's end while held; otherwise when the trace is next due. */
    dueAt: timestamp('due_at', { withTimezone: true }).defaultNow().notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }),
    /** Bounded code for the last outcome (e.g. `http-503`); never vendor text. */
    reason: text('reason'),
  },
  (table) => [
    primaryKey({ columns: [table.erasureId, table.traceId] }),
    index('agent_evidence_erasure_trace_due_idx').on(table.state, table.dueAt),
    check('agent_evidence_erasure_trace_state_check', sql`${table.state} IN ('pending', 'requested', 'absent')`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
