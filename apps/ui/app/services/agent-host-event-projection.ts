import { z } from 'zod';
import type { UIMessageChunk } from 'ai';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';

type ProviderMessage = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message'];
type AssistantProviderMessage = Extract<ProviderMessage, { readonly role: 'assistant' }>;
type UserProviderMessage = Extract<ProviderMessage, { readonly role: 'user' }>;
type JsonValue = ProviderMessage['content'];

const errorText = (value: JsonValue | undefined, fallback: string): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value['message'] === 'string') {
    return value['message'];
  }
  return value === undefined ? fallback : JSON.stringify(value);
};

const blockKey = (runId: string, messageId: string, contentIndex: number): string =>
  JSON.stringify([runId, messageId, contentIndex]);

const blockId = (type: 'text-delta' | 'thinking-delta', messageId: string, contentIndex: number): string =>
  `${messageId}:${type === 'text-delta' ? 'text' : 'thinking'}:${String(contentIndex)}`;

const usageChunks = (message: AssistantProviderMessage): UIMessageChunk[] => {
  const { metadata } = message;
  const usage = metadata?.usage;
  if (!usage) {
    return [];
  }
  const { cost } = usage;
  const id = `${message.id}:usage`;
  return [
    {
      type: 'data-usage',
      id,
      data: {
        type: 'usage',
        id,
        model: metadata.responseModel ?? metadata.model ?? 'unknown',
        inputTokens: usage.input,
        outputTokens: usage.output,
        reasoningTokens: usage.reasoning ?? 0,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        inputTokensCost: cost.input,
        outputTokensCost: cost.output,
        cacheReadTokensCost: cost.cacheRead,
        cacheWriteTokensCost: cost.cacheWrite,
        totalCost: cost.total,
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
        },
      ];
    }
    case 'tool-output': {
      const output: UIMessageChunk = message.isError
        ? {
            type: 'tool-output-error',
            toolCallId: message.toolCallId,
            errorText: errorText(message.content, `${message.toolName} failed`),
          }
        : { type: 'tool-output-available', toolCallId: message.toolCallId, output: message.content };
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

const unmappedEvent = (event: never): never => {
  const { type } = event as { readonly type?: unknown };
  throw new TypeError(`Unmapped agent-host event: ${typeof type === 'string' ? type : 'unknown'}`);
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
  context: z
    .looseObject({
      toolCall: z.looseObject({ title: z.string().optional() }).optional(),
      options: z.array(approvalOptionSchema).optional(),
    })
    .optional(),
});

const interruptResolutionSchema = z.looseObject({
  outcome: z.enum(['approved', 'denied', 'cancelled']).optional(),
});

const agentHostApprovalSchema = z.object({
  interruptId: z.string().min(1),
  kind: z.enum(['approval', 'operator', 'safeguard']),
  prompt: z.string(),
  options: z.array(z.object({ optionId: z.string().min(1), name: z.string(), kind: z.string().optional() })),
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
  const input: AgentHostApproval = {
    interruptId: event.interruptId,
    kind: request?.kind ?? 'approval',
    prompt: request?.prompt ?? request?.context?.toolCall?.title ?? event.reason,
    options: (request?.context?.options ?? []).map((option) => ({
      optionId: option.optionId,
      name: option.name ?? option.optionId,
      ...(option.kind === undefined ? {} : { kind: option.kind }),
    })),
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
    case 'turn.history-projection-committed': {
      return [];
    }
    case 'interrupt.recorded': {
      return approvalChunks(event);
    }
    default: {
      return unmappedEvent(event);
    }
  }
};
