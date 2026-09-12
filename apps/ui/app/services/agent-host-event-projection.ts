import { z } from 'zod';
import type { UIMessageChunk } from 'ai';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import type { BillingInvocationStatus, MyUIMessage } from '@taucad/chat';
import { billingInvocationStatusSchema } from '@taucad/chat';
import { errorCategoryTitles, httpStatusToCategory } from '@taucad/chat/utils';
import type { AuthoritativeRevisionFinalization } from '#types/revision.types.js';
import { isRecord } from '@taucad/utils/schema';

type ProviderMessage = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message'];
type AssistantProviderMessage = Extract<ProviderMessage, { readonly role: 'assistant' }>;
type UserProviderMessage = Extract<ProviderMessage, { readonly role: 'user' }>;
type JsonValue = ProviderMessage['content'];

const errorText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value['message'] === 'string') {
    if (typeof value['code'] === 'string' && typeof value['status'] === 'number') {
      const category = httpStatusToCategory(value['status']);
      const { details } = value;
      return JSON.stringify({
        category,
        title: errorCategoryTitles[category],
        message: value['message'],
        code: value['code'],
        httpStatus: value['status'],
        // A denial's structured fields (an `INSUFFICIENT_CREDIT` shortfall, say)
        // ride the same JSON so the card can name the amount it is short.
        ...(isRecord(details) ? { details } : {}),
      });
    }
    return value['message'];
  }
  return value === undefined ? fallback : JSON.stringify(value);
};

const blockKey = (runId: string, messageId: string, contentIndex: number): string =>
  JSON.stringify([runId, messageId, contentIndex]);

const blockId = (type: 'text-delta' | 'thinking-delta', messageId: string, contentIndex: number): string =>
  `${messageId}:${type === 'text-delta' ? 'text' : 'thinking'}:${String(contentIndex)}`;

/**
 * The funded-operation identity the harness stamped on a Tau turn.
 *
 * `usage.cost.*` is deliberately not read: it is the catalog price the local
 * model row quotes, and a charge is whatever the account's own receipt says it
 * was. Carrying the identity instead lets the reader ask the authority (B4 R2).
 *
 * @param tauInternal - The durable `tauInternal` metadata marker, when present.
 * @returns The billing fields of the `data-usage` part, or none.
 */
const billingIdentity = (
  tauInternal: Record<string, unknown> | undefined,
): { operationId?: string; attemptId?: string; billingStatus?: BillingInvocationStatus } => {
  if (tauInternal?.['kind'] !== 'billing-invocation') {
    return {};
  }
  const { operationId, attemptId, status } = tauInternal;
  const billingStatus = billingInvocationStatusSchema.safeParse(status).data;
  return {
    ...(typeof operationId === 'string' ? { operationId } : {}),
    ...(typeof attemptId === 'string' ? { attemptId } : {}),
    ...(billingStatus === undefined ? {} : { billingStatus }),
  };
};

const usageChunks = (message: AssistantProviderMessage): UIMessageChunk[] => {
  const { metadata } = message;
  const usage = metadata?.usage;
  if (!usage) {
    return [];
  }
  const id = `${message.id}:usage`;
  /* Who produced these tokens, from the durable marker rather than from
   * whatever the composer is selected on now (V6). An external turn carries no
   * Tau operation — Tau did not sell it — so the reader needs the agent's name
   * to know that the missing charge is a fact and not a gap. */
  const tauInternal = isRecord(metadata.tauInternal) ? metadata.tauInternal : undefined;
  const agent = tauInternal?.['origin'] === 'external' ? tauInternal['agentId'] : undefined;
  return [
    {
      type: 'data-usage',
      id,
      data: {
        type: 'usage',
        id,
        ...(typeof agent === 'string' ? { agent } : {}),
        ...billingIdentity(tauInternal),
        model: metadata.responseModel ?? metadata.model ?? 'unknown',
        inputTokens: usage.input,
        outputTokens: usage.output,
        ...(usage.reasoning === undefined ? {} : { reasoningTokens: usage.reasoning }),
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
      },
    },
  ];
};

const assistantChunks = (
  message: AssistantProviderMessage,
  runId: string,
  streamedBlocks?: Set<string>,
): UIMessageChunk[] => {
  const { content: messageContent } = message;
  const content: readonly JsonValue[] = Array.isArray(messageContent)
    ? messageContent
    : typeof messageContent === 'string'
      ? [{ type: 'text', text: messageContent }]
      : [messageContent];
  const chunks: UIMessageChunk[] = [];
  let hasToolCall = false;
  for (const [index, value] of content.entries()) {
    if (!isRecord(value)) {
      continue;
    }
    if (value['type'] === 'toolCall') {
      hasToolCall = true;
      continue;
    }
    if (value['type'] === 'text' && typeof value['text'] === 'string') {
      const id = `${message.id}:text:${String(index)}`;
      chunks.push(
        ...(streamedBlocks?.delete(blockKey(runId, message.id, index))
          ? ([{ type: 'text-end', id }] as const)
          : ([
              { type: 'text-start', id },
              { type: 'text-delta', id, delta: value['text'] },
              { type: 'text-end', id },
            ] as const)),
      );
      continue;
    }
    if (value['type'] === 'thinking' && typeof value['thinking'] === 'string') {
      const id = `${message.id}:thinking:${String(index)}`;
      chunks.push(
        ...(streamedBlocks?.delete(blockKey(runId, message.id, index))
          ? ([{ type: 'reasoning-end', id }] as const)
          : ([
              { type: 'reasoning-start', id },
              { type: 'reasoning-delta', id, delta: value['thinking'] },
              { type: 'reasoning-end', id },
            ] as const)),
      );
    }
    // Tool-call blocks are projected from their explicit tool-input log row.
  }
  chunks.push(...usageChunks(message));
  if (!hasToolCall) {
    chunks.push({ type: 'finish-step' });
  }
  return chunks;
};

type ToolProviderMessage = Extract<ProviderMessage, { readonly role: 'tool-input' | 'tool-output' }>;

/** The SDK's own JSON-object shape for a tool part's metadata; `ai` does not export the alias. */
type ToolChunkMetadata = NonNullable<Extract<UIMessageChunk, { type: 'tool-input-available' }>['toolMetadata']>;

/**
 * The emitter's own tool-call facts, in the shape the AI SDK carries them.
 *
 * ACP is the boundary vocabulary (V3): an external agent's call becomes a
 * `dynamic-tool` part, so no `tool-${title}` type is ever minted and the
 * unknown-part fallback is unreachable for tool parts by construction rather
 * than by adding a branch per agent. `call` rides along as the part's `toolMetadata`
 * under one `tau` namespace — Tau's own dispatch records the same field, so a
 * renderer reads one shape for both emitters.
 *
 * @param message - The durable tool row.
 * @returns Chunk fields shared by the input and output chunks.
 */
const toolChunkFacts = (
  message: ToolProviderMessage,
): { dynamic?: true; title?: string; toolMetadata?: ToolChunkMetadata } => {
  const tauInternal = isRecord(message.metadata?.tauInternal) ? message.metadata.tauInternal : undefined;
  const external = tauInternal?.['origin'] === 'external';
  const { call } = message;
  const agentId = tauInternal?.['agentId'];
  /* The SDK carries a part's `toolMetadata` from the *input* chunk and reuses it
   * for the result, so the emitter's `status` is deliberately not forwarded:
   * frozen at `pending` it would contradict the part's own state, which is the
   * one lifecycle a renderer should read. The durable log keeps it either way.
   *
   * The durable log's JSON and the SDK's `JSONValue` describe the same bytes and
   * differ only in array readonly-ness, so this asserts rather than re-copies. */
  const { status: _status, ...facts } = call ?? {};
  const durable = {
    ...facts,
    ...(external ? { origin: 'external' } : {}),
    ...(typeof agentId === 'string' ? { agentId } : {}),
  };
  const tau = durable as ToolChunkMetadata;
  return {
    ...(external ? { dynamic: true } : {}),
    ...(call?.title === undefined ? {} : { title: call.title }),
    ...(Object.keys(tau).length === 0 ? {} : { toolMetadata: { tau } }),
  };
};

const messageChunks = (message: ProviderMessage, runId: string, streamedBlocks?: Set<string>): UIMessageChunk[] => {
  switch (message.role) {
    case 'user': {
      return [];
    }
    case 'assistant': {
      return assistantChunks(message, runId, streamedBlocks);
    }
    case 'tool-input': {
      return [
        {
          type: 'tool-input-available',
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          input: message.content,
          ...toolChunkFacts(message),
        },
      ];
    }
    case 'tool-output': {
      const { title: _title, ...facts } = toolChunkFacts(message);
      const output: UIMessageChunk = message.isError
        ? {
            type: 'tool-output-error',
            toolCallId: message.toolCallId,
            errorText: errorText(message.content, `${message.toolName} failed`),
            ...facts,
          }
        : { type: 'tool-output-available', toolCallId: message.toolCallId, output: message.content, ...facts };
      return [output, { type: 'finish-step' }, { type: 'start-step' }];
    }
  }
};

/** Reconstruct one canonical user row without routing it through assistant stream chunks. */
export const projectAgentHostUserMessage = (message: UserProviderMessage, recordedAt?: string): MyUIMessage => {
  const values: readonly JsonValue[] = Array.isArray(message.content) ? message.content : [message.content];
  const parts: MyUIMessage['parts'] = [];
  for (const value of values) {
    if (typeof value === 'string') {
      parts.push({ type: 'text', text: value });
      continue;
    }
    if (!isRecord(value)) {
      continue;
    }
    if (value['type'] === 'text' && typeof value['text'] === 'string') {
      parts.push({ type: 'text', text: value['text'] });
      continue;
    }
    if (value['type'] === 'image' && typeof value['mimeType'] === 'string' && typeof value['data'] === 'string') {
      parts.push({
        type: 'file',
        mediaType: value['mimeType'],
        url: `data:${value['mimeType']};base64,${value['data']}`,
      });
    }
  }
  /** Milliseconds. */
  const recordedTimestamp = recordedAt === undefined ? undefined : Date.parse(recordedAt);
  const createdAt =
    message.metadata?.timestamp ??
    (recordedTimestamp !== undefined && Number.isFinite(recordedTimestamp) ? recordedTimestamp : undefined);
  return {
    id: message.id,
    role: 'user',
    parts,
    metadata: { status: 'success', ...(createdAt === undefined ? {} : { createdAt }) },
  };
};

/**
 * Read back the revision a *host* recorded for one turn.
 *
 * A browser-placed turn's revision is finalized by the workspace authority in
 * this tab, so the finalization is already in hand. A host-placed turn's is
 * finalized on the host, which owns the files (VI11) — the only thing that
 * crosses to the client is this durable record, and it carries the whole
 * finalization so the graph node it becomes is identical either way.
 *
 * @param event - One durable log record.
 * @param chatId - The chat whose log carried it; the record does not repeat it.
 * @returns The finalization, or `undefined` for every other record.
 */
export const projectAgentHostRevisionFinalized = (
  event: AgentLogEvent,
  chatId: string,
): AuthoritativeRevisionFinalization | undefined =>
  event.type === 'revision.finalized'
    ? {
        turnId: event.turnId,
        revisionId: event.revisionId,
        baseRevisionId: event.baseRevisionId,
        treeId: event.treeId,
        branchName: event.branchName,
        publication: event.publication,
        changedPaths: event.changedPaths,
        provenance: event.provenance,
        generatedSummary: event.generatedSummary,
        chatId,
        /* The host runs no Tau jobs against a turn; a browser-placed turn's
         * ids come from its own claim, which a host placement never mints. */
        jobIds: [],
        workspaceId: event.workspaceId,
        nativeGit: event.nativeGit,
      }
    : undefined;

/** Extract the durable user turn carried by either canonical commit event. */
export const projectAgentHostUserTurn = (event: AgentLogEvent): MyUIMessage | undefined => {
  if (event.type === 'message.appended' && event.message.role === 'user') {
    return projectAgentHostUserMessage(event.message, event.recordedAt);
  }
  if (event.type === 'turn.history-projection-committed') {
    return projectAgentHostUserMessage(event.message, event.recordedAt);
  }
  return undefined;
};

/** Project one non-durable model delta while retaining its open content block. */
export const projectAgentHostLiveEvent = (
  event: AgentLiveEvent,
  streamedBlocks: Set<string>,
): readonly UIMessageChunk[] => {
  const key = blockKey(event.runId, event.messageId, event.contentIndex);
  const id = blockId(event.type, event.messageId, event.contentIndex);
  const first = !streamedBlocks.has(key);
  streamedBlocks.add(key);
  if (event.type === 'text-delta') {
    return [...(first ? ([{ type: 'text-start', id }] as const) : []), { type: 'text-delta', id, delta: event.delta }];
  }
  return [
    ...(first ? ([{ type: 'reasoning-start', id }] as const) : []),
    { type: 'reasoning-delta', id, delta: event.delta },
  ];
};

const lifecycleChunks = (
  event: Extract<AgentLogEvent, { readonly type: 'run.lifecycle' }>,
): readonly UIMessageChunk[] => {
  const { state } = event;
  switch (state) {
    case 'admitted': {
      return [
        {
          type: 'start',
          messageId: event.runId,
          messageMetadata: { createdAt: Date.parse(event.recordedAt), status: 'pending' },
        },
      ];
    }
    case 'running': {
      return [{ type: 'start-step' }];
    }
    case 'paused': {
      return [{ type: 'finish-step' }];
    }
    case 'completed': {
      return [{ type: 'finish', finishReason: 'stop', messageMetadata: { status: 'success' } }];
    }
    case 'failed': {
      return [{ type: 'error', errorText: errorText(event.detail, 'Browser agent host failed.') }];
    }
    case 'cancelled': {
      return [{ type: 'abort', reason: errorText(event.detail, 'cancelled') }];
    }
  }
};

/**
 * Dynamic tool name every durable interrupt is projected onto.
 *
 * A host's interrupt inbox is not a tool call — it is its own durable record —
 * but the UI SDK's only per-message approval vocabulary hangs off a tool part,
 * so the interrupt gets a part of its own keyed by `interruptId`. Keying it on
 * the *interrupt* rather than joining it to whatever tool provoked it is what
 * makes the projection total: an external agent's `session/request_permission`
 * names a tool call in the agent's own id space (`packages/host/src/acp/session.ts`
 * mints separate Tau-side call ids), a safeguard names no tool at all, and the
 * SDK throws `No tool invocation found` for an approval addressed to a part
 * that does not exist.
 *
 * @public
 */
export const agentApprovalToolName = 'tau_agent_approval';

/** One choice the host recorded beside a pending interrupt. @public */
export type AgentHostApprovalOption = {
  readonly optionId: string;
  readonly name: string;
  readonly kind?: string | undefined;
};

/** The pending interrupt a presenter renders, projected from `interrupt.recorded`. @public */
export type AgentHostApproval = {
  readonly interruptId: string;
  readonly kind: 'approval' | 'operator' | 'safeguard';
  readonly prompt: string;
  readonly options: readonly AgentHostApprovalOption[];
  /**
   * External agent that raised this interrupt, when one did.
   *
   * Durable, so a banner rendered after a reload — or while the composer has
   * moved on to another agent — still names who is actually waiting (V6).
   */
  readonly agentId?: string | undefined;
  /**
   * A sign-in the agent is waiting on, when that is what this interrupt is.
   *
   * Present, the interrupt is not a decision at all — nothing here is approved
   * or denied. It is what the *user* has to do somewhere else: open a
   * verification URL, or run a command in their own terminal (V11). Tau never
   * performs it, so a presenter renders the facts and no action of its own.
   */
  readonly login?: AgentHostLogin | undefined;
};

/** One sign-in method an external agent offered. @public */
export type AgentHostLoginMethod = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  /** A command line the user runs themselves; Tau never runs it (X6). */
  readonly terminalCommand?: string | undefined;
};

/** The sign-in an external agent is waiting on. @public */
export type AgentHostLogin = {
  readonly agentId: string;
  readonly methods: readonly AgentHostLoginMethod[];
  /** Where the user completes a device-code login. */
  readonly url?: string | undefined;
  /** The code that page asks for. */
  readonly code?: string | undefined;
};

/*
 * `interrupt.recorded.payload` is `JsonValue` on the wire. The launcher writes
 * `{ kind, prompt, context }` and `context` is whatever the runner handed it —
 * an ACP permission request puts its `toolCall` and its `options` there, a
 * channel `interrupt` command may put nothing. Parsed, never cast (CL11), and
 * loose because a richer context from a newer host must not blank the banner.
 */
const approvalOptionSchema = z.looseObject({
  optionId: z.string().min(1),
  name: z.string().optional(),
  kind: z.string().optional(),
});

const interruptRequestSchema = z.looseObject({
  kind: z.enum(['approval', 'operator', 'safeguard']).optional(),
  prompt: z.string().optional(),
  agentId: z.string().optional(),
  context: z
    .looseObject({
      toolCall: z.looseObject({ title: z.string().optional() }).optional(),
      options: z.array(approvalOptionSchema).optional(),
    })
    .optional(),
});

/* `externalAgentLoginSchema` in `agent-wire.ts` is the writer's own shape; this
 * is the reader's, loose for the same reason as the rest of the payload. */
const loginPayloadSchema = z.looseObject({
  kind: z.literal('external-agent-login'),
  agentId: z.string().min(1),
  authMethods: z
    .array(
      z.looseObject({
        id: z.string().min(1),
        name: z.string().optional(),
        description: z.string().optional(),
        terminalCommand: z.string().optional(),
      }),
    )
    .optional(),
  url: z.string().optional(),
  code: z.string().optional(),
});

const loginMethodSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  terminalCommand: z.string().optional(),
});

const agentHostLoginSchema = z.object({
  agentId: z.string().min(1),
  methods: z.array(loginMethodSchema),
  url: z.string().optional(),
  code: z.string().optional(),
});

/**
 * The sign-in one interrupt payload describes, if it describes one.
 *
 * @param payload - The durable `interrupt.recorded` payload.
 * @returns The login facts a presenter renders, or `undefined`.
 */
const loginOf = (payload: unknown): AgentHostLogin | undefined => {
  const parsed = loginPayloadSchema.safeParse(payload).data;
  if (!parsed) {
    return undefined;
  }
  return {
    agentId: parsed.agentId,
    methods: (parsed.authMethods ?? []).map((method) => ({
      id: method.id,
      name: method.name ?? method.id,
      ...(method.description === undefined ? {} : { description: method.description }),
      ...(method.terminalCommand === undefined ? {} : { terminalCommand: method.terminalCommand }),
    })),
    ...(parsed.url === undefined ? {} : { url: parsed.url }),
    ...(parsed.code === undefined ? {} : { code: parsed.code }),
  };
};

const interruptResolutionSchema = z.looseObject({
  outcome: z.enum(['approved', 'denied', 'cancelled']).optional(),
});

const agentHostApprovalSchema = z.object({
  interruptId: z.string().min(1),
  kind: z.enum(['approval', 'operator', 'safeguard']),
  prompt: z.string(),
  options: z.array(z.object({ optionId: z.string().min(1), name: z.string(), kind: z.string().optional() })),
  agentId: z.string().optional(),
  login: agentHostLoginSchema.optional(),
});

/**
 * Read back the approval a presenter renders from its projected tool part.
 *
 * The part round-trips through the chat's own persistence before a reload
 * re-renders it, so the presenter parses rather than trusts (CL11).
 *
 * @param input - The dynamic tool part's `input`.
 * @returns The approval, or `undefined` when the part is not one.
 * @public
 */
export const parseAgentHostApproval = (input: unknown): AgentHostApproval | undefined =>
  agentHostApprovalSchema.safeParse(input).data;

const approvalChunks = (
  event: Extract<AgentLogEvent, { readonly type: 'interrupt.recorded' }>,
): readonly UIMessageChunk[] => {
  if (event.phase === 'resolved') {
    // `reason` carries the outcome verbatim on every host that writes one.
    const outcome = interruptResolutionSchema.safeParse(event.payload).data?.outcome ?? event.reason;
    return [{ type: 'tool-output-available', toolCallId: event.interruptId, output: { outcome } }];
  }
  const request = interruptRequestSchema.safeParse(event.payload).data;
  const login = loginOf(event.payload);
  const input: AgentHostApproval = {
    interruptId: event.interruptId,
    kind: request?.kind ?? 'approval',
    prompt: request?.prompt ?? request?.context?.toolCall?.title ?? event.reason,
    options: (request?.context?.options ?? []).map((option) => ({
      optionId: option.optionId,
      name: option.name ?? option.optionId,
      ...(option.kind === undefined ? {} : { kind: option.kind }),
    })),
    ...(request?.agentId === undefined ? {} : { agentId: request.agentId }),
    ...(login === undefined ? {} : { login }),
  };
  return [
    {
      type: 'tool-input-available',
      toolCallId: event.interruptId,
      toolName: agentApprovalToolName,
      dynamic: true,
      input,
    },
    { type: 'tool-approval-request', approvalId: event.interruptId, toolCallId: event.interruptId },
  ];
};

/** Convert one durable browser-host event into the UI SDK chunk vocabulary used by API chat. */
export const projectAgentHostEvent = (
  event: AgentLogEvent,
  streamedBlocks?: Set<string>,
): readonly UIMessageChunk[] => {
  switch (event.type) {
    case 'message.appended': {
      return messageChunks(event.message, event.runId, streamedBlocks);
    }
    case 'run.lifecycle': {
      return lifecycleChunks(event);
    }
    case 'message.envelope-replaced':
    case 'history.rewound':
    case 'history.compacted':
    case 'snapshot-context.refreshed':
    case 'safeguard.recorded':
    case 'model.invocation-prepared':
    case 'model.invocation-bound':
    case 'revision.finalized':
    case 'turn.history-projection-committed': {
      /* `revision.finalized` is a fact about the project's revision graph, not
       * about the transcript: it is read by `projectAgentHostRevisionFinalized`
       * and renders no chunk of its own. */
      return [];
    }
    case 'interrupt.recorded': {
      return approvalChunks(event);
    }
    default: {
      /* D14: the log preserves records this reader does not know (a newer
       * daemon, a cached older bundle); they project to nothing rather than
       * aborting the chat stream. A *known* type without a case is still a
       * compile error. */
      event satisfies never;
      return [];
    }
  }
};
