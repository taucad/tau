import type {
  AgentLiveEvent,
  AgentLogEvent,
  AgentSessionModel,
  ClientContext,
  EventLogBatch,
  HostRunSnapshot,
  JsonValue,
  ModelProviderKind,
  ModelSystemPromptBlock,
  RunTrigger,
  StorageDurabilityClass,
  TauAgentAdmissionConfig,
  UserProviderMessage,
  WireProtocolSchemas,
} from '@taucad/agent-host';
import {
  agentLogEventSchema,
  isGatewayProviderKind,
  jsonValueSchema,
  modelProviderKinds,
  providerMessageSchema,
  userProviderMessageSchema,
} from '@taucad/agent-host';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type { LengthSymbol } from '@taucad/units';
import { z } from 'zod';
import { skillMetadataSchema } from '@taucad/chat/schemas';

/** Maximum durable events transferred in one follower replay window. */
export const agentHostTailBatchLimit = 16;

type AgentHostCapabilityChecks = {
  readonly worker: boolean;
  readonly webLocks: boolean;
  readonly broadcastChannel: boolean;
  readonly opfs: boolean;
  readonly syncAccessHandle: boolean;
};

export type AgentHostCapabilityReport = { readonly checks: AgentHostCapabilityChecks } & (
  | { readonly supported: true }
  | {
      readonly supported: false;
      readonly reason:
        | 'WORKER_UNAVAILABLE'
        | 'WEB_LOCKS_UNAVAILABLE'
        | 'BROADCAST_CHANNEL_UNAVAILABLE'
        | 'STORAGE_NOT_WRITABLE'
        | 'SYNC_ACCESS_HANDLE_UNAVAILABLE';
    }
);

export const createAgentHostCapabilityReport = (
  checks: AgentHostCapabilityChecks,
  durability: StorageDurabilityClass = 'exclusive-append',
): AgentHostCapabilityReport => {
  const requiredChecks = [
    ['worker', 'WORKER_UNAVAILABLE'],
    ['webLocks', 'WEB_LOCKS_UNAVAILABLE'],
    ['broadcastChannel', 'BROADCAST_CHANNEL_UNAVAILABLE'],
  ] as const;
  const exclusiveAppendChecks = [
    ['opfs', 'STORAGE_NOT_WRITABLE'],
    ['syncAccessHandle', 'SYNC_ACCESS_HANDLE_UNAVAILABLE'],
  ] as const;
  const failed = [...requiredChecks, ...(durability === 'exclusive-append' ? exclusiveAppendChecks : [])].find(
    ([check]) => !checks[check],
  );
  return failed ? { supported: false, reason: failed[1], checks } : { supported: true, checks };
};

export type AgentHostModel = AgentSessionModel & { readonly providerKind: ModelProviderKind };

export type AgentHostAdmissionConfig = Omit<
  TauAgentAdmissionConfig,
  'systemPromptBlocks' | 'model' | 'allowedTools' | 'clientContext'
> & {
  /**
   * Ordered cache blocks: static, an optional workspace block, then dynamic.
   * The workspace block is omitted when it has no content — emitting it empty
   * burned one of the three Anthropic cache breakpoints on nothing.
   */
  readonly systemPromptBlocks:
    | readonly [ModelSystemPromptBlock, ModelSystemPromptBlock]
    | readonly [ModelSystemPromptBlock, ModelSystemPromptBlock, ModelSystemPromptBlock];
  readonly model: AgentHostModel;
  readonly allowedTools: readonly string[];
  readonly testingEnabled?: boolean | undefined;
  readonly contextPayload?: ClientContext | undefined;
};

export type AgentHostWorkerInitializeRequest = {
  readonly type: 'initialize';
  readonly fileSystemPort: MessagePort;
  readonly projectRootPort: MessagePort;
  readonly projectStorage: ProjectFileSystemConfig;
  readonly authority: { readonly projectId: string; readonly workspaceId: string };
  readonly gatewayBaseUrl: string;
  readonly systemPrompt: string;
  /**
   * Ordered cache blocks: static, an optional workspace block, then dynamic.
   * The workspace block is omitted when it has no content — emitting it empty
   * burned one of the three Anthropic cache breakpoints on nothing.
   */
  readonly systemPromptBlocks:
    | readonly [ModelSystemPromptBlock, ModelSystemPromptBlock]
    | readonly [ModelSystemPromptBlock, ModelSystemPromptBlock, ModelSystemPromptBlock];
  readonly model: AgentHostModel;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly lengthSymbol: LengthSymbol;
  readonly testingEnabled?: boolean | undefined;
};

/**
 * Which agent runs the turn (W4-ACP).
 *
 * Absent — the overwhelming case — the host's own harness runs it against a Tau
 * model. Present, a *daemon* starts an external ACP agent, which brings its own
 * model, its own tools and the user's own CLI login, so none of
 * {@link AgentHostAdmissionConfig} applies and none of it travels. The browser
 * worker never sees one: an `acp` execution is only ever placed on a daemon.
 *
 * @public
 */
export type AgentHostExternalAgent =
  | { readonly kind: 'acp'; readonly id: string }
  | {
      readonly kind: 'paseo';
      readonly id: string;
      readonly connectionId: string;
      readonly mcpUrl?: string | undefined;
      readonly mcpHeaders?: Readonly<Record<string, string>> | undefined;
    };

type AgentHostWorkerStartRequestBase = {
  readonly type: 'start';
  readonly chatId: string;
  readonly runId: string;
  readonly message: UserProviderMessage;
  readonly config?: AgentHostAdmissionConfig | undefined;
  readonly agent?: AgentHostExternalAgent | undefined;
};

export type AgentHostWorkerStartRequest = AgentHostWorkerStartRequestBase &
  (
    | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
    | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
  );

export type AgentHostWorkerCommandInput =
  | AgentHostWorkerStartRequest
  | { readonly type: 'steer'; readonly chatId: string; readonly runId: string; readonly message: string }
  | { readonly type: 'cancel'; readonly chatId: string; readonly runId: string }
  | { readonly type: 'resume'; readonly chatId: string }
  | {
      readonly type: 'resolve-interrupt';
      readonly chatId: string;
      readonly runId: string;
      readonly interruptId: string;
      readonly outcome: 'approved' | 'denied' | 'cancelled';
      readonly payload?: JsonValue | undefined;
    }
  | { readonly type: 'tail'; readonly chatId: string; readonly cursor: number; readonly limit: number }
  | { readonly type: 'attach'; readonly chatId: string; readonly cursor: number; readonly limit: number };

type WithBroadcastEnvelope<Command> = Command extends AgentHostWorkerCommandInput
  ? Command & { readonly requestId: string; readonly sessionId: string }
  : never;

/** Generation-addressed BroadcastChannel command; this fan-out protocol deliberately remains enveloped. */
export type AgentHostWorkerCommand = WithBroadcastEnvelope<AgentHostWorkerCommandInput>;

export type AgentHostWorkerCallRequest =
  | { readonly type: 'capabilities'; readonly durability: StorageDurabilityClass }
  | AgentHostWorkerInitializeRequest
  | AgentHostWorkerCommandInput
  | { readonly type: 'close' };

export type AgentHostWorkerResultResponse = {
  readonly type: 'result';
  readonly requestId: string;
  readonly operation: Exclude<AgentHostWorkerCommand['type'], 'tail' | 'attach'>;
  readonly snapshot: HostRunSnapshot;
};

export type AgentHostWorkerTailResponse = {
  readonly type: 'tail';
  readonly requestId: string;
  readonly chatId: string;
  readonly batch: EventLogBatch;
};

export type AgentHostWorkerAttachResponse = {
  readonly type: 'attach';
  readonly requestId: string;
  readonly chatId: string;
  readonly batch: EventLogBatch;
  readonly leadership:
    | { readonly role: 'leader'; readonly generation: string }
    | { readonly role: 'follower'; readonly generation?: string | undefined };
  readonly snapshot?: HostRunSnapshot | undefined;
  readonly takeover: boolean;
};

export type AgentHostWorkerErrorResponse = {
  readonly type: 'error';
  readonly requestId: string;
  readonly code: string;
  readonly message: string;
};

export type ForwardedAgentHostResponse =
  | AgentHostWorkerResultResponse
  | AgentHostWorkerTailResponse
  | AgentHostWorkerAttachResponse
  | AgentHostWorkerErrorResponse;

export type AgentHostWorkerCallResponse =
  | { readonly type: 'capabilities'; readonly report: AgentHostCapabilityReport }
  | { readonly type: 'initialized' }
  | Omit<AgentHostWorkerResultResponse, 'requestId'>
  | Omit<AgentHostWorkerTailResponse, 'requestId'>
  | Omit<AgentHostWorkerAttachResponse, 'requestId'>
  | { readonly type: 'closed' };

export type AgentHostWorkerEvent = { readonly chatId: string; readonly event: AgentLogEvent };
export type AgentHostWorkerLiveEvent = { readonly chatId: string; readonly event: AgentLiveEvent };

export type AgentHostWorkerProtocol = {
  readonly calls: {
    readonly request: { readonly args: AgentHostWorkerCallRequest; readonly result: AgentHostWorkerCallResponse };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    readonly events: { readonly args: undefined; readonly wireArgs: unknown; readonly event: AgentHostWorkerEvent };
    readonly liveEvents: {
      readonly args: undefined;
      readonly wireArgs: unknown;
      readonly event: AgentHostWorkerLiveEvent;
    };
  };
};

export type AgentHostWorkerConnect = {
  readonly type: 'agent-host/connect';
  readonly sessionId: string;
  readonly port: MessagePort;
};

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
const clientContextSchema = z.strictObject({
  // The canonical client-authored skill metadata wire shape — a local strict
  // relist here rejected real payloads (resourceUri/source/version/whenToUse/
  // enabled) at admission; single-source it instead.
  skills: z.array(skillMetadataSchema).optional(),
  memory: z.record(z.string(), z.string()).optional(),
});
const projectStorageSchema = z.discriminatedUnion('backend', [
  z.strictObject({ projectId: nonEmptyString, backend: z.literal('indexeddb'), providerBasePath: nonEmptyString }),
  z.strictObject({ projectId: nonEmptyString, backend: z.literal('opfs'), providerBasePath: nonEmptyString }),
  // A project on real disk (the desktop shell's node backend): `path` is the
  // picked root and is absent for Home, whose root is ambient — the same shape
  // `ProjectFileSystemConfig` declares. Durability comes from the provider's
  // own report (`transactional-rewrite`), never from OPFS sync handles.
  z.strictObject({
    projectId: nonEmptyString,
    backend: z.literal('node'),
    path: nonEmptyString.optional(),
    providerBasePath: nonEmptyString,
  }),
  z.strictObject({
    projectId: nonEmptyString,
    backend: z.literal('memory'),
    storageRootKey: nonEmptyString,
    providerBasePath: nonEmptyString,
  }),
  z.strictObject({
    projectId: nonEmptyString,
    backend: z.literal('webaccess'),
    workspaceId: nonEmptyString,
    providerBasePath: nonEmptyString,
  }),
]);
const messagePortSchema = z.custom<MessagePort>(
  (value) => typeof MessagePort !== 'undefined' && value instanceof MessagePort,
  'Expected a MessagePort',
);

export const agentHostAdmissionConfigSchema = z.strictObject({
  systemPrompt: z.string(),
  systemPromptBlocks: z.union([
    z.tuple([systemPromptBlockSchema, systemPromptBlockSchema]),
    z.tuple([systemPromptBlockSchema, systemPromptBlockSchema, systemPromptBlockSchema]),
  ]),
  model: hostModelSchema,
  toolChoice: toolChoiceSchema,
  allowedTools: z.array(z.string()),
  testingEnabled: z.boolean().optional(),
  snapshot: jsonValueSchema.optional(),
  contextPayload: clientContextSchema.optional(),
  contextMessages: z.array(userProviderMessageSchema).optional(),
});

const commandBase = { chatId: nonEmptyString };
/** Wire validator for {@link AgentHostExternalAgent}. @public */
/**
 * Which external runner owns the turn.
 *
 * `acp` is a daemon-spawned adapter and needs nothing beyond the agent id.
 * `paseo` also names the paired connection its session opens on, because the
 * page holds that session and the agent id alone does not say which daemon it
 * lives on.
 */
export const agentHostExternalAgentSchema = z.union([
  z.strictObject({ kind: z.literal('acp'), id: nonEmptyString }),
  z.strictObject({
    kind: z.literal('paseo'),
    id: nonEmptyString,
    connectionId: nonEmptyString,
    /**
     * A paired Tau Host's `/mcp` endpoint and its run-scoped bearer.
     *
     * Minted by that daemon at admission (the page cannot sign one; the
     * secret never leaves the daemon). Absent means the agent runs with no
     * Tau tools, which the selector says out loud rather than failing.
     */
    mcpUrl: z.url().optional(),
    mcpHeaders: z.record(z.string(), z.string()).optional(),
  }),
]);

const startBase = {
  ...commandBase,
  type: z.literal('start'),
  runId: nonEmptyString,
  message: userProviderMessageSchema,
  config: agentHostAdmissionConfigSchema.optional(),
  agent: agentHostExternalAgentSchema.optional(),
};
const startRequestSchema = z.union([
  z.strictObject({ ...startBase, trigger: z.literal('submit') }),
  z.strictObject({
    ...startBase,
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  }),
]);
const tailWindow = {
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(agentHostTailBatchLimit),
};
const commandSchemas = [
  ...startRequestSchema.options,
  z.strictObject({ ...commandBase, type: z.literal('steer'), runId: nonEmptyString, message: z.string() }),
  z.strictObject({ ...commandBase, type: z.literal('cancel'), runId: nonEmptyString }),
  z.strictObject({ ...commandBase, type: z.literal('resume') }),
  z.strictObject({
    ...commandBase,
    type: z.literal('resolve-interrupt'),
    runId: nonEmptyString,
    interruptId: nonEmptyString,
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({ ...commandBase, type: z.literal('attach'), ...tailWindow }),
  z.strictObject({ ...commandBase, type: z.literal('tail'), ...tailWindow }),
] as const;
const broadcastEnvelope = { requestId: nonEmptyString, sessionId: nonEmptyString };
export const agentHostWorkerCommandSchema = z.union(
  commandSchemas.map((schema) => schema.extend(broadcastEnvelope)) as unknown as typeof commandSchemas,
);

const capabilityChecksSchema = z.strictObject({
  worker: z.boolean(),
  webLocks: z.boolean(),
  broadcastChannel: z.boolean(),
  opfs: z.boolean(),
  syncAccessHandle: z.boolean(),
});
const capabilityReportSchema = z.union([
  z.strictObject({ supported: z.literal(true), checks: capabilityChecksSchema }),
  z.strictObject({
    supported: z.literal(false),
    reason: z.enum([
      'WORKER_UNAVAILABLE',
      'WEB_LOCKS_UNAVAILABLE',
      'BROADCAST_CHANNEL_UNAVAILABLE',
      'STORAGE_NOT_WRITABLE',
      'SYNC_ACCESS_HANDLE_UNAVAILABLE',
    ]),
    checks: capabilityChecksSchema,
  }),
]);
const initializeRequestSchema = z.strictObject({
  type: z.literal('initialize'),
  fileSystemPort: messagePortSchema,
  projectRootPort: messagePortSchema,
  projectStorage: projectStorageSchema,
  authority: z.strictObject({ projectId: nonEmptyString, workspaceId: nonEmptyString }),
  gatewayBaseUrl: z.url(),
  systemPrompt: z.string(),
  systemPromptBlocks: z.union([
    z.tuple([systemPromptBlockSchema, systemPromptBlockSchema]),
    z.tuple([systemPromptBlockSchema, systemPromptBlockSchema, systemPromptBlockSchema]),
  ]),
  model: hostModelSchema,
  runtimeConfig: z.strictObject({ tauApiUrl: z.url(), tauWebSocketUrl: z.url() }),
  lengthSymbol: z.custom<LengthSymbol>((value) => typeof value === 'string' && value.length > 0),
  testingEnabled: z.boolean().optional(),
});
const agentHostWorkerCallRequestSchema = z.union([
  z.strictObject({
    type: z.literal('capabilities'),
    durability: z.enum(['exclusive-append', 'stream-append', 'transactional-rewrite', 'ephemeral']),
  }),
  initializeRequestSchema,
  ...commandSchemas,
  z.strictObject({ type: z.literal('close') }),
]);

export const hostRunSnapshotSchema = z.strictObject({
  chatId: nonEmptyString,
  runId: nonEmptyString,
  turnId: nonEmptyString,
  state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  messages: z.array(providerMessageSchema),
  failure: z
    .strictObject({ code: nonEmptyString, message: z.string(), status: z.number().int().optional() })
    .optional(),
});

export const eventLogBatchSchema = z
  .strictObject({
    cursor: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative(),
    endCursor: z.number().int().nonnegative(),
    events: z.array(agentLogEventSchema).max(agentHostTailBatchLimit),
  })
  .refine(({ cursor, events, nextCursor }) => nextCursor === cursor + events.length, {
    path: ['nextCursor'],
    message: 'must equal cursor plus event count',
  })
  .refine(({ nextCursor, endCursor }) => endCursor >= nextCursor, {
    path: ['endCursor'],
    message: 'before nextCursor',
  });

export const agentLiveEventSchema = z.strictObject({
  type: z.enum(['text-delta', 'thinking-delta']),
  chatId: nonEmptyString,
  runId: nonEmptyString,
  messageId: nonEmptyString,
  contentIndex: z.number().int().nonnegative(),
  delta: z.string(),
});
const leadershipSchema = z.union([
  z.strictObject({ role: z.literal('leader'), generation: nonEmptyString }),
  z.strictObject({ role: z.literal('follower'), generation: z.string().optional() }),
]);

export const forwardedAgentHostResponseSchema = z.union([
  z.strictObject({ type: z.literal('error'), requestId: nonEmptyString, code: nonEmptyString, message: z.string() }),
  z.strictObject({
    type: z.literal('result'),
    requestId: nonEmptyString,
    operation: z.enum(['start', 'steer', 'cancel', 'resume', 'resolve-interrupt']),
    snapshot: hostRunSnapshotSchema,
  }),
  z.strictObject({
    type: z.literal('tail'),
    requestId: nonEmptyString,
    chatId: nonEmptyString,
    batch: eventLogBatchSchema,
  }),
  z.strictObject({
    type: z.literal('attach'),
    requestId: nonEmptyString,
    chatId: nonEmptyString,
    batch: eventLogBatchSchema,
    leadership: leadershipSchema,
    snapshot: hostRunSnapshotSchema.optional(),
    takeover: z.boolean(),
  }),
]);

const agentHostWorkerCallResponseSchema = z.union([
  z.strictObject({ type: z.literal('capabilities'), report: capabilityReportSchema }),
  z.strictObject({ type: z.literal('initialized') }),
  z.strictObject({
    type: z.literal('result'),
    operation: z.enum(['start', 'steer', 'cancel', 'resume', 'resolve-interrupt']),
    snapshot: hostRunSnapshotSchema,
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
  z.strictObject({ type: z.literal('closed') }),
]);
const workerEventSchema = z.strictObject({ chatId: nonEmptyString, event: agentLogEventSchema });
const workerLiveEventSchema = z.strictObject({ chatId: nonEmptyString, event: agentLiveEventSchema });

export const agentHostWorkerProtocolSchemas = {
  calls: { request: { args: agentHostWorkerCallRequestSchema, result: agentHostWorkerCallResponseSchema } },
  notifies: {},
  listens: {
    events: { args: z.null(), event: workerEventSchema },
    liveEvents: { args: z.null(), event: workerLiveEventSchema },
  },
} satisfies WireProtocolSchemas<AgentHostWorkerProtocol>;

const agentHostWorkerConnectSchema = z.strictObject({
  type: z.literal('agent-host/connect'),
  sessionId: nonEmptyString,
  port: messagePortSchema,
});

/** Validate the only raw Worker frame; all subsequent traffic belongs to the transferred Channel. */
export const parseAgentHostWorkerConnect = (value: unknown): AgentHostWorkerConnect =>
  agentHostWorkerConnectSchema.parse(value);
