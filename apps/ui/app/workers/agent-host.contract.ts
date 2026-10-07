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
} from '@taucad/agent-host/wire';
import type { AgentWireHello } from '@taucad/agent-host/wire';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import { z } from 'zod';
import { skillMetadataSchema } from '@taucad/chat/schemas';

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

/**
 * One project host's ports and defaults, which the page provides to the resident worker (RH-S8). `hostId` names this
 * incarnation: a later `provide` for the project replaces it, and the page disposes only the replaced host's bridges
 * (RH-R4, I31).
 */
export type AgentHostProjectProvide = {
  readonly projectId: string;
  readonly hostId: string;
  readonly fileSystemPort: MessagePort;
  readonly projectRootPort: MessagePort;
  readonly computeMode?: 'off' | 'memory' | 'durable' | undefined;
  readonly computeStorePort?: MessagePort | undefined;
  /** A port into the file-manager worker's revision root for this project; the `revisions` tool is offered with it. */
  readonly revisionsPort?: MessagePort | undefined;
  /** The project's placement session in the file-manager worker (W8 TS-S5); required, so no turn runs unplaced (D13). */
  readonly placementPort: MessagePort;
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
  /**
   * The host's default row, for a bodyless resume of a run whose log committed none. Absent while
   * the model catalog cannot name a provider (offline): attach, replay and a resume on the log's
   * committed row still work, and a turn names its own row in its admission.
   */
  readonly model?: AgentHostModel | undefined;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly testingEnabled?: boolean | undefined;
  /** The signed-in account the session cookie funds, which the host checks an attempt against (W11 GI-Q6). */
  readonly principal?: string | undefined;
};

/**
 * Fresh bridges for a project host that stays open (RV1-F1), as after a file-manager restart: the host named by
 * `hostId` swaps them in and keeps its launcher and runs; the page then disposes the ones it replaced.
 */
export type AgentHostProjectRebridge = {
  readonly projectId: string;
  readonly hostId: string;
  readonly fileSystemPort: MessagePort;
  readonly projectRootPort: MessagePort;
  readonly computeStorePort?: MessagePort | undefined;
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

/** One project in the worker: the host incarnation that serves it, if any, and the worker's capability (LT14). */
export type AgentHostProjectStatus = {
  readonly hostId?: string | undefined;
  readonly capability: AgentHostCapabilityReport;
};

/** A close prompt's read-only answer from this worker's leadership actor. @public */
export type AgentHostRunStoppability = ReturnType<AgentLauncher['stoppability']>;

/**
 * The page↔resident-worker control channel (RH-S8). One worker per document serves every project and chat of the
 * tab: `provide` opens a project host, `connect` hands it one `MessagePort` per stream, served with the agent wire
 * (`serveAgentChannel`), `rebridge` gives it fresh bridges and `release` closes it once the project's last client
 * closed. Closing a stream only detaches it (D17). The host appends every settlement row itself (W8 TS-S6).
 */
export type AgentHostWorkerProtocol = {
  readonly hello: AgentWireHello;
  readonly calls: {
    /** This tab's identity among the origin's tabs (RH-R5); sent once per worker incarnation. */
    readonly init: {
      readonly args: { readonly tabId: string };
      readonly result: undefined;
      readonly wireResult: unknown;
    };
    readonly capabilities: {
      readonly args: { readonly durability: StorageDurabilityClass };
      readonly result: AgentHostCapabilityReport;
    };
    /** Open a project host; answers the incarnation it replaced, whose bridges the page disposes. */
    readonly provide: {
      readonly args: AgentHostProjectProvide;
      readonly result: { readonly replaced?: string | undefined };
    };
    /** Swap fresh bridges into an open host; `needs` when no open host has that id, and the worker closes the ports. */
    readonly rebridge: {
      readonly args: AgentHostProjectRebridge;
      readonly result: { readonly status: 'rebridged' | 'needs' };
    };
    /** The project's last client closed: close its host if it is still the one named (RH-R4, I31). */
    readonly release: {
      readonly args: { readonly projectId: string; readonly hostId: string };
      readonly result: undefined;
      readonly wireResult: unknown;
    };
    /** Serve one stream on a project host; `needs` when this worker has no host with that id (a new incarnation). */
    readonly connect: {
      readonly args: { readonly projectId: string; readonly hostId: string; readonly port: MessagePort };
      readonly result: { readonly status: 'connected' | 'needs' };
    };
    readonly status: {
      readonly args: { readonly projectId: string };
      readonly result: AgentHostProjectStatus;
    };
    readonly runStoppability: {
      readonly args: { readonly projectId: string; readonly chatId: string };
      readonly result: AgentHostRunStoppability;
    };
    /** The page's visibility: a hidden page never queues for a chat's lock (RH-R16). */
    readonly visibility: {
      readonly args: { readonly visible: boolean };
      readonly result: undefined;
      readonly wireResult: unknown;
    };
  };
  readonly notifies: Record<never, never>;
  readonly listens: Record<never, never>;
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
const provideSchema = z.strictObject({
  projectId: nonEmptyString,
  hostId: nonEmptyString,
  fileSystemPort: messagePortSchema,
  projectRootPort: messagePortSchema,
  computeMode: z.enum(['off', 'memory', 'durable']).optional(),
  computeStorePort: messagePortSchema.optional(),
  revisionsPort: messagePortSchema.optional(),
  placementPort: messagePortSchema,
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
  model: agentChannelModelSchema.optional(),
  runtimeConfig: z.strictObject({ tauApiUrl: z.url(), tauWebSocketUrl: z.url() }),
  testingEnabled: z.boolean().optional(),
  principal: nonEmptyString.optional(),
});
const durabilitySchema = z.enum(['exclusive-append', 'stream-append', 'transactional-rewrite', 'ephemeral']);

/** Wire validators for {@link AgentHostWorkerProtocol}. The rpc carries an absent argument or result as `null`. */
export const agentHostWorkerProtocolSchemas = {
  hello: agentWireHelloSchema,
  calls: {
    init: { args: z.strictObject({ tabId: nonEmptyString }), result: z.unknown() },
    capabilities: { args: z.strictObject({ durability: durabilitySchema }), result: capabilityReportSchema },
    provide: { args: provideSchema, result: z.strictObject({ replaced: nonEmptyString.optional() }) },
    rebridge: {
      args: z.strictObject({
        projectId: nonEmptyString,
        hostId: nonEmptyString,
        fileSystemPort: messagePortSchema,
        projectRootPort: messagePortSchema,
        computeStorePort: messagePortSchema.optional(),
      }),
      result: z.strictObject({ status: z.enum(['rebridged', 'needs']) }),
    },
    release: { args: z.strictObject({ projectId: nonEmptyString, hostId: nonEmptyString }), result: z.unknown() },
    connect: {
      args: z.strictObject({ projectId: nonEmptyString, hostId: nonEmptyString, port: messagePortSchema }),
      result: z.strictObject({ status: z.enum(['connected', 'needs']) }),
    },
    status: {
      args: z.strictObject({ projectId: nonEmptyString }),
      result: z.strictObject({ hostId: nonEmptyString.optional(), capability: capabilityReportSchema }),
    },
    runStoppability: {
      args: z.strictObject({ projectId: nonEmptyString, chatId: nonEmptyString }),
      result: z.enum(['stoppable', 'other-build', 'background-window']),
    },
    visibility: { args: z.strictObject({ visible: z.boolean() }), result: z.unknown() },
  },
  notifies: {},
  listens: {},
} satisfies WireProtocolSchemas<AgentHostWorkerProtocol>;

const agentHostWorkerConnectSchema = z.strictObject({
  type: z.literal('agent-host/connect'),
  sessionId: nonEmptyString,
  port: messagePortSchema,
});

/** Validate the only raw Worker frame; all subsequent traffic belongs to the transferred Channel. */
export const parseAgentHostWorkerConnect = (value: unknown): AgentHostWorkerConnect =>
  agentHostWorkerConnectSchema.parse(value);
