import type {
  AgentSessionModel,
  ClientContext,
  JsonValue,
  ModelProviderKind,
  ModelSystemPromptBlock,
  StorageDurabilityClass,
  TauAgentAdmissionConfig,
  WireProtocolSchemas,
} from '@taucad/agent-host';
import { jsonValueSchema, userProviderMessageSchema } from '@taucad/agent-host';
import {
  agentChannelModelSchema,
  agentChannelSystemPromptBlockSchema,
  agentChannelToolChoiceSchema,
  agentWireHelloSchema,
  agentWireProtocolSchemas,
} from '@taucad/agent-host/wire';
import type { AgentWireHello, AgentWireProtocol } from '@taucad/agent-host/wire';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import { z } from 'zod';
import { skillMetadataSchema } from '@taucad/chat/schemas';
import type { TurnConflictedEvent, TurnFailedEvent, TurnFinalizedEvent } from '@taucad/revisions/revision-effects';

/** The page's build, the worker's hello `build` (I32); the timestamp `vite.config.ts` injects, as `build-skew.ts` reads it. */
export const agentHostWorkerBuild = String(typeof tauBuildId === 'number' ? tauBuildId : 0);

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
  readonly fileSystemPort: MessagePort;
  readonly projectRootPort: MessagePort;
  readonly computeMode?: 'off' | 'memory' | 'durable' | undefined;
  readonly computeStorePort?: MessagePort | undefined;
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
export type AgentHostExternalAgent = {
  readonly kind: 'acp';
  readonly id: string;
  readonly model?: string;
  readonly config?: Readonly<Record<string, string | boolean>>;
};

/**
 * The CAD context an external turn carries (V12).
 *
 * Deliberately *not* {@link AgentHostAdmissionConfig}: none of what a Tau turn
 * negotiates — the model row, the cache blocks, the tool grant — applies to an
 * agent that brings its own. What the client *composed* does apply, because it
 * is the same knowledge a Tau turn works from, and the daemon sends it as
 * embedded resources on the session's first prompt.
 *
 * @public
 */
export type AgentHostExternalContext = {
  /** The CAD system prompt, kernel facts included. */
  readonly systemPrompt: string;
  /** Skills and memory the client assembled for this turn. */
  readonly contextPayload?: ClientContext | undefined;
  /** The editor snapshot this turn was composed against. */
  readonly snapshot?: JsonValue | undefined;
};

type AgentHostWorkerSettlement =
  | (Omit<TurnFinalizedEvent, 'checkoutId'> & { readonly checkoutId?: string | undefined })
  | (Omit<TurnConflictedEvent, 'checkoutId'> & { readonly checkoutId?: string | undefined })
  | (Omit<TurnFailedEvent, 'checkoutId'> & { readonly checkoutId?: string | undefined });

/** One revision settlement the page records in the chat's log. ponytail: worker-only until W8 deletes it (drift 7). */
export type AgentHostWorkerSettlementRecord = { readonly chatId: string; readonly event: AgentHostWorkerSettlement };

/**
 * The page↔worker protocol: the agent wire's verbs and `read` (`@taucad/agent-host/wire`), the live deltas, and the
 * worker-only calls. ponytail: `capabilities`, `initialize` and `close` stay until W6 makes them the hello, and
 * `record-settlement` until W8 deletes it.
 */
export type AgentHostWorkerProtocol = {
  readonly hello: AgentWireHello;
  readonly calls: Omit<AgentWireProtocol['calls'], 'revision'> & {
    readonly capabilities: {
      readonly args: { readonly durability: StorageDurabilityClass };
      readonly result: AgentHostCapabilityReport;
    };
    readonly initialize: {
      readonly args: AgentHostWorkerInitializeRequest;
      readonly result: undefined;
      readonly wireResult: unknown;
    };
    readonly close: {
      readonly args: undefined;
      readonly wireArgs: unknown;
      readonly result: undefined;
      readonly wireResult: unknown;
    };
    readonly 'record-settlement': {
      readonly args: AgentHostWorkerSettlementRecord;
      readonly result: undefined;
      readonly wireResult: unknown;
    };
  };
  readonly notifies: Record<never, never>;
  readonly listens: Pick<AgentWireProtocol['listens'], 'liveEvents'>;
};

export type AgentHostWorkerConnect = {
  readonly type: 'agent-host/connect';
  readonly sessionId: string;
  readonly port: MessagePort;
};

const nonEmptyString = z.string().min(1);
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
    z.tuple([agentChannelSystemPromptBlockSchema, agentChannelSystemPromptBlockSchema]),
    z.tuple([
      agentChannelSystemPromptBlockSchema,
      agentChannelSystemPromptBlockSchema,
      agentChannelSystemPromptBlockSchema,
    ]),
  ]),
  model: agentChannelModelSchema,
  toolChoice: agentChannelToolChoiceSchema,
  allowedTools: z.array(z.string()),
  testingEnabled: z.boolean().optional(),
  snapshot: jsonValueSchema.optional(),
  contextPayload: clientContextSchema.optional(),
  contextMessages: z.array(userProviderMessageSchema).optional(),
});

/**
 * Wire validator for {@link AgentHostExternalAgent}.
 *
 * `acp` is a daemon-spawned adapter and needs nothing beyond the agent id and,
 * optionally, the adapter's own model id.
 *
 * @public
 */
export const agentHostExternalAgentSchema = z.strictObject({
  kind: z.literal('acp'),
  id: nonEmptyString,
  model: nonEmptyString.optional(),
  config: z.record(nonEmptyString, z.union([z.string(), z.boolean()])).optional(),
});

/**
 * Wire validator for {@link AgentHostExternalContext}.
 *
 * @public
 */
export const agentHostExternalContextSchema = z.strictObject({
  systemPrompt: z.string(),
  contextPayload: clientContextSchema.optional(),
  snapshot: jsonValueSchema.optional(),
});

/** Wire validator for {@link AgentHostWorkerSettlementRecord}. */
export const agentHostSettlementRecordSchema = z.strictObject({
  chatId: nonEmptyString,
  event: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('turn.finalized'),
      turnId: nonEmptyString,
      runId: nonEmptyString,
      chatId: nonEmptyString,
      projectId: nonEmptyString,
      checkoutId: nonEmptyString.optional(),
      revisionId: nonEmptyString.optional(),
      branch: nonEmptyString.optional(),
      changedPaths: z.array(z.string()),
      treeId: nonEmptyString.optional(),
      trigger: z.literal('turn'),
      runIds: z.array(nonEmptyString),
    }),
    z.strictObject({
      type: z.literal('turn.conflicted'),
      turnId: nonEmptyString,
      runId: nonEmptyString,
      chatId: nonEmptyString,
      checkoutId: nonEmptyString.optional(),
    }),
    z.strictObject({
      type: z.literal('turn.failed'),
      turnId: nonEmptyString,
      runId: nonEmptyString,
      chatId: nonEmptyString,
      checkoutId: nonEmptyString.optional(),
      reason: z.string(),
      /* Why, as the page phrases it (P4); `reason` stays the diagnostic. */
      code: nonEmptyString.optional(),
    }),
  ]),
});

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
  fileSystemPort: messagePortSchema,
  projectRootPort: messagePortSchema,
  computeMode: z.enum(['off', 'memory', 'durable']).optional(),
  computeStorePort: messagePortSchema.optional(),
  projectStorage: projectStorageSchema,
  authority: z.strictObject({ projectId: nonEmptyString, workspaceId: nonEmptyString }),
  gatewayBaseUrl: z.url(),
  systemPrompt: z.string(),
  systemPromptBlocks: z.union([
    z.tuple([agentChannelSystemPromptBlockSchema, agentChannelSystemPromptBlockSchema]),
    z.tuple([
      agentChannelSystemPromptBlockSchema,
      agentChannelSystemPromptBlockSchema,
      agentChannelSystemPromptBlockSchema,
    ]),
  ]),
  model: agentChannelModelSchema,
  runtimeConfig: z.strictObject({ tauApiUrl: z.url(), tauWebSocketUrl: z.url() }),
  testingEnabled: z.boolean().optional(),
});
const durabilitySchema = z.enum(['exclusive-append', 'stream-append', 'transactional-rewrite', 'ephemeral']);
const { revision: _revision, ...wireCalls } = agentWireProtocolSchemas.calls;

/** Wire validators for {@link AgentHostWorkerProtocol}: the agent wire's own, plus the worker-only calls (drift 12, 13). */
export const agentHostWorkerProtocolSchemas = {
  hello: agentWireHelloSchema,
  calls: {
    ...wireCalls,
    capabilities: { args: z.strictObject({ durability: durabilitySchema }), result: capabilityReportSchema },
    // The rpc carries an absent argument as `null`; an empty result is not read.
    initialize: { args: initializeRequestSchema, result: z.unknown() },
    close: { args: z.null(), result: z.unknown() },
    'record-settlement': { args: agentHostSettlementRecordSchema, result: z.unknown() },
  },
  notifies: {},
  listens: { liveEvents: agentWireProtocolSchemas.listens.liveEvents },
} satisfies WireProtocolSchemas<AgentHostWorkerProtocol>;

const agentHostWorkerConnectSchema = z.strictObject({
  type: z.literal('agent-host/connect'),
  sessionId: nonEmptyString,
  port: messagePortSchema,
});

/** Validate the only raw Worker frame; all subsequent traffic belongs to the transferred Channel. */
export const parseAgentHostWorkerConnect = (value: unknown): AgentHostWorkerConnect =>
  agentHostWorkerConnectSchema.parse(value);
