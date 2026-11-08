import { sql, desc } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '#schema/auth.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

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
    /**
     * The cloud host's repository-scoped push credential (D21, I10), hashed;
     * null on a paired laptop. A second secret beside `credential_hash`
     * because that one also opens the model gateway, jobs and the control
     * socket: this one opens `cloud_project_id`'s git routes and nothing else,
     * and dies with `revoked_at`. Only `git-transport.ts` reads it.
     */
    gitCredentialHash: text('git_credential_hash'),
  },
  (table) => [
    uniqueIndex('agent_device_credential_hash_idx').on(table.credentialHash),
    uniqueIndex('agent_device_git_credential_hash_idx').on(table.gitCredentialHash),
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

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
