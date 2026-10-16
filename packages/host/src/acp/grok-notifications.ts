/** Bounded xAI session notifications; wire names stay vendor-owned at this boundary. */
import { z } from 'zod';
import type { ExternalAgentStop } from '@taucad/agent-host/wire';

const identifier = z.string().min(1).max(256);
const detail = z.string().max(8192);
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/* eslint-disable @typescript-eslint/naming-convention -- These object keys are xAI's external snake_case wire contract. */
const retrySchema = z.discriminatedUnion('type', [
  z.object({
    sessionUpdate: z.literal('retry_state'),
    type: z.literal('retrying'),
    attempt: counter,
    max_retries: counter,
    reason: detail,
    error_type: identifier.nullish(),
  }),
  z.object({
    sessionUpdate: z.literal('retry_state'),
    type: z.literal('exhausted'),
    attempts: counter,
    reason: detail,
    is_rate_limited: z.boolean().optional(),
  }),
  z.object({
    sessionUpdate: z.literal('retry_state'),
    type: z.literal('failed'),
    error_type: identifier,
    message: detail,
  }),
]);

const subagentIdentity = {
  subagent_id: identifier,
  child_session_id: identifier,
  attempt_id: identifier.nullish(),
};

const updateSchema = z.union([
  retrySchema,
  z.discriminatedUnion('sessionUpdate', [
    z.object({
      sessionUpdate: z.literal('auto_recovery_started'),
      attempt: counter,
      max_retries: counter,
      error: detail,
      delay_ms: counter,
    }),
    z.object({ sessionUpdate: z.literal('auto_recovery_exhausted'), attempts: counter, error: detail }),
    z.object({
      sessionUpdate: z.literal('auto_compact_started'),
      tokens_used: counter,
      context_window: counter.positive(),
      percentage: z.number().int().min(0).max(255),
      reason: detail,
    }),
    z.object({
      sessionUpdate: z.literal('auto_compact_completed'),
      tokens_before: counter.nullish(),
      tokens_after: counter,
      elapsed_ms: counter.nullish(),
      summary_preview: detail.nullish(),
    }),
    z.object({ sessionUpdate: z.literal('auto_compact_failed'), error: detail }),
    z.object({ sessionUpdate: z.literal('auto_compact_cancelled'), reason: detail }),
    z.object({ sessionUpdate: z.literal('served_model'), display_name: z.string().min(1).max(256) }),
    z.object({
      sessionUpdate: z.literal('subagent_spawned'),
      ...subagentIdentity,
      parent_session_id: identifier,
      parent_prompt_id: identifier.nullish(),
      subagent_type: identifier,
      description: detail,
      model: identifier.nullish(),
      capability_mode: identifier.nullish(),
      resumed_from: identifier.nullish(),
    }),
    z.object({
      sessionUpdate: z.literal('subagent_progress'),
      ...subagentIdentity,
      parent_session_id: identifier,
      duration_ms: counter,
      turn_count: counter,
      tool_call_count: counter,
      tokens_used: counter,
      context_window_tokens: counter,
      context_usage_pct: z.number().int().min(0).max(100),
      tools_used: z.array(identifier).max(256),
      error_count: counter,
    }),
    z.object({
      sessionUpdate: z.literal('subagent_finished'),
      ...subagentIdentity,
      status: z.enum(['completed', 'failed', 'cancelled']),
      error: detail.nullish(),
      tool_calls: counter,
      turns: counter,
      duration_ms: counter,
      tokens_used: counter.optional(),
      output: z.string().max(65_536).nullish(),
    }),
  ]),
]);

/* eslint-enable @typescript-eslint/naming-convention -- End of vendor wire names. */

/** Accepted extension envelope; unknown fields, including live child addresses, are stripped. @internal */
export const grokNotificationSchema = z.object({
  sessionId: identifier,
  update: updateSchema,
  _meta: z
    .object({ promptId: identifier.optional(), eventId: identifier.optional(), isReplay: z.boolean().optional() })
    .nullish(),
});

/** Validated notification before session/prompt ownership checks. @internal */
export type GrokNotification = z.infer<typeof grokNotificationSchema>;
/** Only the vendor updates Tau intentionally supports. @internal */
export type GrokNotificationUpdate = GrokNotification['update'];

/**
 * Ignore unknown or malformed optional vendor events without breaking the ACP connection.
 * @internal
 * @param value - Untrusted extension payload.
 * @returns The bounded event, or nothing when unsupported.
 */
export const grokNotificationOf = (value: unknown): GrokNotification | undefined =>
  grokNotificationSchema.safeParse(value).data;

/**
 * Classify a terminal vendor hint without treating its internal retries as failed turns.
 * The caller applies this only when the prompt has actually stopped unsuccessfully.
 * @internal
 * @param update - Validated session notification.
 * @returns Shared stop presentation, if this is a terminal failure hint.
 */
export const grokFailureOf = (update: GrokNotificationUpdate): ExternalAgentStop['failure'] | undefined => {
  if (update.sessionUpdate === 'auto_recovery_exhausted') {
    return { category: 'service', title: update.error, actions: ['retry'] };
  }
  if (update.sessionUpdate !== 'retry_state' || update.type === 'retrying') {
    return undefined;
  }
  if (update.type === 'exhausted') {
    return { category: update.is_rate_limited ? 'limit' : 'service', title: update.reason, actions: ['retry'] };
  }
  const title = update.message;
  switch (update.error_type) {
    case 'auth': {
      return { category: 'access', title, actions: ['login'] };
    }
    case 'context_length': {
      return { category: 'limit', title, actions: ['new_session'] };
    }
    case 'rate_limited': {
      return { category: 'limit', title, actions: ['retry'] };
    }
    case 'encrypted_content_mismatch': {
      return { category: 'request', title, actions: ['new_session'] };
    }
    case 'invalid_params': {
      return { category: 'request', title, actions: [] };
    }
    case 'legacy_auth': {
      return { category: 'access', title, actions: [] };
    }
    case 'auth_transient':
    case 'http':
    case 'server':
    case 'idle_timeout':
    case 'empty_response': {
      return { category: 'service', title, actions: ['retry'] };
    }
    default: {
      return { category: 'service', title, actions: [] };
    }
  }
};
