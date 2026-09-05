/**
 * The T0 event-log command vocabulary, transport-free.
 *
 * This is the *same* vocabulary the browser worker speaks over a MessagePort
 * (`apps/ui/app/workers/agent-host.contract.ts`), minus the two frames that are
 * MessagePort-only by construction: `initialize` (it transfers ports) and
 * `capabilities` (it probes OPFS). A daemon is configured from its own CLI, so
 * the client never initializes it — everything else is byte-identical, which is
 * what lets one client projection render a run without knowing whether it came
 * from a worker or a socket.
 *
 * Zod only: no `node:` import may reach here, because the WebSocket client half
 * validates against these same schemas inside a browser bundle.
 */

import { z } from 'zod';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import {
  agentLogEventSchema,
  jsonValueSchema,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { modelProviderKinds } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { isGatewayProviderKind } from '#transport/gateway-model-transport.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLiveEvent, HostRunSnapshot, InterruptRequest, InterruptResolution } from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogBatch } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent, RunTrigger, UserProviderMessage } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { TauAgentAdmissionConfig } from '#host/tau-agent-host.js';

/** Maximum durable events transferred in one replay window. @public */
export const agentChannelTailBatchLimit = 16;

const nonEmptyString = z.string().min(1);

const systemPromptBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  cacheControl: z.strictObject({ type: z.literal('ephemeral'), scope: z.literal('global').optional() }).optional(),
});

const modelCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});

const hostModelSchema = z.strictObject({
  id: nonEmptyString,
  providerKind: z.enum(modelProviderKinds).refine(isGatewayProviderKind),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive().optional(),
  cost: modelCostSchema.optional(),
});

const toolChoiceSchema = z.union([z.enum(['none', 'auto', 'any', 'custom']), z.array(z.string())]);

/* Loose, deliberately: the browser assembles richer skill rows than the host
 * consumes (`resourceUri`, `source`, `version`, …) and a strict relist here
 * would reject real client payloads at admission. */
const clientContextSchema = z.strictObject({
  skills: z
    .array(z.looseObject({ name: nonEmptyString, description: z.string(), fingerprint: z.string().optional() }))
    .optional(),
  memory: z.record(z.string(), z.string()).optional(),
});

/**
 * Which agent runs the turn.
 *
 * Absent — the overwhelming case — the daemon's own pi harness runs it against
 * a Tau model. Present, the daemon starts an *external* agent through its
 * pinned ACP adapter, which brings its own model, its own tools and the user's
 * own CLI login (X6). Nothing about the Tau model rows applies to that run.
 *
 * @public
 */
export const agentChannelRunKindSchema = z.strictObject({ kind: z.literal('acp'), id: nonEmptyString });

/** Per-admission model, prompt, tool and client context accepted over the wire. @public */
export const agentChannelAdmissionConfigSchema = z.strictObject({
  agent: agentChannelRunKindSchema.optional(),
  systemPrompt: z.string(),
  systemPromptBlocks: z
    .union([
      z.tuple([systemPromptBlockSchema, systemPromptBlockSchema]),
      z.tuple([systemPromptBlockSchema, systemPromptBlockSchema, systemPromptBlockSchema]),
    ])
    .optional(),
  model: hostModelSchema.optional(),
  toolChoice: toolChoiceSchema,
  allowedTools: z.array(z.string()).optional(),
  snapshot: jsonValueSchema.optional(),
  contextPayload: clientContextSchema.optional(),
  contextMessages: z.array(userProviderMessageSchema).optional(),
});

/** Client-supplied admission overrides. @public */
export type AgentChannelAdmissionConfig = z.infer<typeof agentChannelAdmissionConfigSchema>;

const commandBase = { chatId: nonEmptyString };
const startBase = {
  ...commandBase,
  type: z.literal('start'),
  runId: nonEmptyString,
  message: userProviderMessageSchema,
  config: agentChannelAdmissionConfigSchema.optional(),
};
const tailWindow = {
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(agentChannelTailBatchLimit),
};

/** Every command one client may issue on the `/agent` channel. @public */
export const agentChannelCommandSchema = z.union([
  z.strictObject({ ...startBase, trigger: z.literal('submit') }),
  z.strictObject({
    ...startBase,
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  }),
  z.strictObject({ ...commandBase, type: z.literal('steer'), runId: nonEmptyString, message: z.string() }),
  z.strictObject({ ...commandBase, type: z.literal('cancel'), runId: nonEmptyString }),
  z.strictObject({ ...commandBase, type: z.literal('resume') }),
  /* Additive beside the browser vocabulary, never a replacement: a daemon runs
   * unattended, so something has to be able to *raise* the approval a later
   * client resolves. A browser-shaped client simply never sends it. */
  z.strictObject({
    ...commandBase,
    type: z.literal('interrupt'),
    runId: nonEmptyString,
    interruptId: nonEmptyString,
    kind: z.enum(['approval', 'operator', 'safeguard']),
    prompt: z.string(),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({
    ...commandBase,
    type: z.literal('resolve-interrupt'),
    runId: nonEmptyString,
    interruptId: nonEmptyString,
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    payload: jsonValueSchema.optional(),
  }),
  /* Additive for W4-PASEO: a Paseo agent runs on the *user’s* machine, so
   * the only Tau tools it can reach are a paired daemon's own MCP endpoint.
   * The page cannot mint that capability (the signing secret never leaves
   * the daemon), so it asks the daemon to, naming the run it is for. */
  z.strictObject({
    ...commandBase,
    type: z.literal('mint-mcp-capability'),
    runId: nonEmptyString,
  }),
  z.strictObject({ ...commandBase, type: z.literal('attach'), ...tailWindow }),
  z.strictObject({ ...commandBase, type: z.literal('tail'), ...tailWindow }),
]);

type AgentChannelStartCommand = {
  readonly type: 'start';
  readonly chatId: string;
  readonly runId: string;
  readonly message: UserProviderMessage;
  readonly config?: AgentChannelAdmissionConfig | undefined;
} & (
  | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
  | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
);

/** One client command on the `/agent` channel. @public */
export type AgentChannelCommand =
  | AgentChannelStartCommand
  | { readonly type: 'steer'; readonly chatId: string; readonly runId: string; readonly message: string }
  | { readonly type: 'cancel'; readonly chatId: string; readonly runId: string }
  | { readonly type: 'resume'; readonly chatId: string }
  | ({ readonly type: 'interrupt'; readonly chatId: string } & InterruptRequest)
  | ({ readonly type: 'resolve-interrupt'; readonly chatId: string; readonly runId: string } & InterruptResolution)
  | { readonly type: 'mint-mcp-capability'; readonly chatId: string; readonly runId: string }
  | { readonly type: 'tail'; readonly chatId: string; readonly cursor: number; readonly limit: number }
  | { readonly type: 'attach'; readonly chatId: string; readonly cursor: number; readonly limit: number };

/** Operations that answer with a run projection. @public */
export type AgentChannelResultOperation = 'start' | 'steer' | 'cancel' | 'resume' | 'interrupt' | 'resolve-interrupt';

/** Leadership marker; a daemon is always the single leader for its workspace. @public */
export type AgentChannelLeadership =
  | { readonly role: 'leader'; readonly generation: string }
  | { readonly role: 'follower'; readonly generation?: string | undefined };

/** One answer to an {@link AgentChannelCommand}. @public */
export type AgentChannelResponse =
  | { readonly type: 'result'; readonly operation: AgentChannelResultOperation; readonly snapshot: HostRunSnapshot }
  | {
      readonly type: 'mcp-capability';
      readonly chatId: string;
      /** Absolute `/mcp` URL on the daemon that minted it. */
      readonly url: string;
      /** Headers the agent session must send, already including the bearer. */
      readonly headers: Readonly<Record<string, string>>;
      readonly expiresAt: string;
    }
  | { readonly type: 'tail'; readonly chatId: string; readonly batch: EventLogBatch }
  | {
      readonly type: 'attach';
      readonly chatId: string;
      readonly batch: EventLogBatch;
      readonly leadership: AgentChannelLeadership;
      readonly snapshot?: HostRunSnapshot | undefined;
      readonly takeover: boolean;
    };

const hostRunSnapshotSchema = z.strictObject({
  chatId: nonEmptyString,
  runId: nonEmptyString,
  turnId: nonEmptyString,
  state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  messages: z.array(providerMessageSchema),
  failure: z
    .strictObject({ code: nonEmptyString, message: z.string(), status: z.number().int().optional() })
    .optional(),
});

const eventLogBatchSchema = z
  .strictObject({
    cursor: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative(),
    endCursor: z.number().int().nonnegative(),
    events: z.array(agentLogEventSchema).max(agentChannelTailBatchLimit),
  })
  .refine(({ cursor, events, nextCursor }) => nextCursor === cursor + events.length, {
    path: ['nextCursor'],
    message: 'must equal cursor plus event count',
  })
  .refine(({ nextCursor, endCursor }) => endCursor >= nextCursor, {
    path: ['endCursor'],
    message: 'before nextCursor',
  });

const leadershipSchema = z.union([
  z.strictObject({ role: z.literal('leader'), generation: nonEmptyString }),
  z.strictObject({ role: z.literal('follower'), generation: z.string().optional() }),
]);

/** Every answer a daemon may return on the `/agent` channel. @public */
export const agentChannelResponseSchema = z.union([
  z.strictObject({
    type: z.literal('result'),
    operation: z.enum(['start', 'steer', 'cancel', 'resume', 'interrupt', 'resolve-interrupt']),
    snapshot: hostRunSnapshotSchema,
  }),
  z.strictObject({
    type: z.literal('mcp-capability'),
    chatId: nonEmptyString,
    url: z.url(),
    headers: z.record(z.string(), z.string()),
    expiresAt: nonEmptyString,
  }),
  z.strictObject({ type: z.literal('tail'), chatId: nonEmptyString, batch: eventLogBatchSchema }),
  z.strictObject({
    type: z.literal('attach'),
    chatId: nonEmptyString,
    batch: eventLogBatchSchema,
    leadership: leadershipSchema,
    snapshot: hostRunSnapshotSchema.optional(),
    takeover: z.boolean(),
  }),
]);

/** One durable event, addressed to its chat. @public */
export type AgentChannelEvent = { readonly chatId: string; readonly event: AgentLogEvent };
/** One ephemeral model delta, addressed to its chat. @public */
export type AgentChannelLiveEvent = { readonly chatId: string; readonly event: AgentLiveEvent };

/** Durable-event stream frame schema. @public */
export const agentChannelEventSchema = z.strictObject({ chatId: nonEmptyString, event: agentLogEventSchema });

/** Ephemeral-delta stream frame schema. @public */
export const agentChannelLiveEventSchema = z.strictObject({
  chatId: nonEmptyString,
  event: z.strictObject({
    type: z.enum(['text-delta', 'thinking-delta']),
    chatId: nonEmptyString,
    runId: nonEmptyString,
    messageId: nonEmptyString,
    contentIndex: z.number().int().nonnegative(),
    delta: z.string(),
  }),
});

/**
 * The `/agent` channel protocol, shaped exactly like the browser worker's.
 *
 * Kept as a plain structural type so this module stays free of `@taucad/rpc`:
 * the binding to a channel server lives with whichever transport mounts it.
 *
 * @public
 */
export type AgentChannelProtocol = {
  readonly calls: {
    readonly request: { readonly args: AgentChannelCommand; readonly result: AgentChannelResponse };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    readonly events: { readonly args: undefined; readonly wireArgs: unknown; readonly event: AgentChannelEvent };
    readonly liveEvents: {
      readonly args: undefined;
      readonly wireArgs: unknown;
      readonly event: AgentChannelLiveEvent;
    };
  };
};

/** Wire validators for {@link AgentChannelProtocol}, ready for `protocolSchemas`. @public */
export const agentChannelProtocolSchemas = {
  calls: { request: { args: agentChannelCommandSchema, result: agentChannelResponseSchema } },
  notifies: {},
  listens: {
    events: { args: z.null(), event: agentChannelEventSchema },
    liveEvents: { args: z.null(), event: agentChannelLiveEventSchema },
  },
};

/** Narrow a validated command into the admission request the host core takes. @public */
export const admissionConfigFor = (
  config: AgentChannelAdmissionConfig | undefined,
  fallback: { readonly systemPrompt: string; readonly model: TauAgentAdmissionConfig['model'] },
): TauAgentAdmissionConfig => ({
  systemPrompt: config?.systemPrompt ?? fallback.systemPrompt,
  ...(config?.systemPromptBlocks ? { systemPromptBlocks: config.systemPromptBlocks } : {}),
  model: config?.model ?? fallback.model,
  toolChoice: config?.toolChoice ?? 'auto',
  ...(config?.allowedTools ? { allowedTools: config.allowedTools } : {}),
  ...(config?.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  ...(config?.contextPayload ? { clientContext: config.contextPayload } : {}),
  ...(config?.contextMessages ? { contextMessages: config.contextMessages } : {}),
});
