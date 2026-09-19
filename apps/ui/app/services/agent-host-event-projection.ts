import { z } from 'zod';
import type { UIMessageChunk } from 'ai';
import type { AgentLiveEvent, AgentLogEvent, ProviderMessageMetadata } from '@taucad/agent-host';
import { externalAgentStopSchema } from '@taucad/agent-host';
import type { AcpSessionData, BillingInvocationStatus, MyUIMessage } from '@taucad/chat';
import { acpSessionDataSchema, billingInvocationStatusSchema } from '@taucad/chat';
import { errorCategoryTitles, httpStatusToCategory } from '@taucad/chat/utils';
import { errorCategory } from '@taucad/types/constants';
import type { ErrorCategory } from '@taucad/types';
import type { TurnConflictedEvent, TurnFailedEvent, TurnFinalizedEvent } from '@taucad/revisions/revision-effects';
import { isRecord } from '@taucad/utils/schema';
import { isAttachmentUrl } from '#utils/attachment.utils.js';

type ProviderMessage = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message'];
type AssistantProviderMessage = Extract<ProviderMessage, { readonly role: 'assistant' }>;
type UserProviderMessage = Extract<ProviderMessage, { readonly role: 'user' }>;
type JsonValue = ProviderMessage['content'];

/**
 * The category a gateway code names, whatever status carried it.
 *
 * The gateway rewrites a classified provider failure into a Tau frame once the
 * stream is already open, so a mid-stream failure rides the relayed response's
 * own 200: `httpStatusToCategory(200)` answers the generic card, and a quota
 * cut mid-turn reads as an unexplained error instead of a rate limit. Each code
 * here answers exactly one pre-stream status too — `RATE_LIMITED` 429,
 * `UPSTREAM_REJECTED` 502, the other two 503 — so naming the card from the code
 * leaves every pre-stream failure rendering exactly as it did.
 *
 * `PROVIDER_UNAVAILABLE` is the one code the gateway answers with two statuses:
 * 503 on every classified path, but 502 for a body-less provider response. The
 * code names the overloaded card for both, which is what a customer whose
 * provider is unavailable is told either way — and it is the only way a
 * mid-stream 499 or 5xx cut reaches that card instead of the generic one.
 */
const gatewayCodeCategories = new Map<string, ErrorCategory>([
  ['INSUFFICIENT_CREDIT', errorCategory.credits],
  ['PROVIDER_ACCOUNT_EXHAUSTED', errorCategory.overloaded],
  ['PROVIDER_UNAVAILABLE', errorCategory.overloaded],
  ['RATE_LIMITED', errorCategory.rateLimit],
  ['UPSTREAM_REJECTED', errorCategory.server],
]);

const errorText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value['message'] === 'string') {
    const { code, status, details } = value;
    // A coded refusal is a card, not prose: the code is what the card's copy is
    // keyed on, and a host refusal such as `NO_EVICTABLE_HISTORY` carries
    // neither an HTTP status nor structured fields.
    if (typeof code === 'string') {
      // The gateway code is authoritative; the status is only the fallback for
      // codes that name no category of their own.
      const category =
        gatewayCodeCategories.get(code) ??
        (typeof status === 'number'
          ? httpStatusToCategory(status)
          : /* `rateLimit` is the external agent's *stop* card, and that card is
             * keyed on the stop details. A limit refused before the adapter
             * classified anything carries the code alone, and claiming the
             * category without the details it needs dropped the person onto a
             * card with no "Try again" (R3-F4). */
            code === 'EXTERNAL_AGENT_LIMIT_REACHED' && externalAgentStopSchema.safeParse(details).success
            ? errorCategory.rateLimit
            : errorCategory.generic);
      return JSON.stringify({
        category,
        title: errorCategoryTitles[category],
        message: value['message'],
        code,
        ...(typeof status === 'number' ? { httpStatus: status } : {}),
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

const blockId = (type: 'text' | 'thinking', messageId: string, contentIndex: number): string =>
  `${messageId}:${type}:${String(contentIndex)}`;

/** Run-scoped blocks, including closed identities to fence late live frames. */
export type AgentHostLiveBlocks = Map<
  string,
  | { readonly type: 'text' | 'thinking'; content: string; closed: boolean; startedAtMs?: number | undefined }
  | { readonly type: 'tool'; content: ''; closed: true }
>;

/**
 * The key a settled tool call is fenced under. Durable and live rows travel on
 * independent subscriptions, so a live `tool-input-*` row can land after the
 * call's durable `tool-output`; projecting it would rewind the settled part and
 * drop its output, after which the finalize pass marks a successful call as
 * orphaned ("File edits failed", lane H5).
 */
const settledToolKey = (toolCallId: string): string => `tool:${toolCallId}`;

const reasoningTiming = (
  metadata: ProviderMessageMetadata | undefined,
  contentIndex: number,
): { startedAt: number; endedAt?: number | undefined } | undefined => {
  const timings = metadata?.['reasoningTimings'];
  if (!Array.isArray(timings)) {
    return undefined;
  }
  const timing: unknown = timings.find((value) => isRecord(value) && value['contentIndex'] === contentIndex);
  if (!isRecord(timing) || typeof timing['startedAtMs'] !== 'number') {
    return undefined;
  }
  return {
    startedAt: timing['startedAtMs'],
    ...(typeof timing['endedAtMs'] === 'number' ? { endedAt: timing['endedAtMs'] } : {}),
  };
};

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
  streamedBlocks?: AgentHostLiveBlocks,
): UIMessageChunk[] => {
  const { content: messageContent } = message;
  const tauInternal = isRecord(message.metadata?.tauInternal) ? message.metadata.tauInternal : undefined;
  const streamCheckpoint = tauInternal?.['streamState'] === 'checkpoint';
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
      const key = blockKey(runId, message.id, index);
      const streamed = streamedBlocks?.get(key);
      if (streamed?.type === 'text') {
        if (!streamed.closed) {
          const suffix = value['text'].startsWith(streamed.content) ? value['text'].slice(streamed.content.length) : '';
          if (suffix) {
            chunks.push({ type: 'text-delta', id, delta: suffix });
          }
          if (value['text'].startsWith(streamed.content)) {
            streamed.content = value['text'];
          }
          if (!streamCheckpoint) {
            chunks.push({ type: 'text-end', id });
          }
        }
        if (!streamCheckpoint) {
          streamed.closed = true;
        }
      } else {
        chunks.push({ type: 'text-start', id }, { type: 'text-delta', id, delta: value['text'] });
        streamedBlocks?.set(key, { type: 'text', content: value['text'], closed: !streamCheckpoint });
        if (!streamCheckpoint || !streamedBlocks) {
          chunks.push({ type: 'text-end', id });
        }
      }
      continue;
    }
    if (value['type'] === 'thinking' && typeof value['thinking'] === 'string') {
      const id = `${message.id}:thinking:${String(index)}`;
      const key = blockKey(runId, message.id, index);
      const streamed = streamedBlocks?.get(key);
      const timing = reasoningTiming(message.metadata, index);
      if (streamed?.type === 'thinking') {
        if (!streamed.closed) {
          const suffix = value['thinking'].startsWith(streamed.content)
            ? value['thinking'].slice(streamed.content.length)
            : '';
          if (suffix) {
            chunks.push({ type: 'reasoning-delta', id, delta: suffix });
          }
          if (value['thinking'].startsWith(streamed.content)) {
            streamed.content = value['thinking'];
          }
          if (!streamCheckpoint) {
            chunks.push({
              type: 'reasoning-end',
              id,
              ...(timing === undefined && streamed.startedAtMs === undefined
                ? {}
                : {
                    providerMetadata: {
                      common: {
                        reasoningStartedAtMs: timing?.startedAt ?? streamed.startedAtMs,
                        ...(timing?.endedAt === undefined ? {} : { reasoningEndedAtMs: timing.endedAt }),
                      },
                    },
                  }),
            });
          }
        }
        if (!streamCheckpoint) {
          streamed.closed = true;
        }
      } else {
        chunks.push(
          {
            type: 'reasoning-start',
            id,
            ...(timing === undefined
              ? {}
              : { providerMetadata: { common: { reasoningStartedAtMs: timing.startedAt } } }),
          },
          { type: 'reasoning-delta', id, delta: value['thinking'] },
        );
        if (streamedBlocks) {
          streamedBlocks.set(key, {
            type: 'thinking',
            content: value['thinking'],
            closed: !streamCheckpoint,
            ...(timing === undefined ? {} : { startedAtMs: timing.startedAt }),
          });
        }
        if (!streamCheckpoint || !streamedBlocks) {
          chunks.push({
            type: 'reasoning-end',
            id,
            ...(timing === undefined
              ? {}
              : {
                  providerMetadata: {
                    common: {
                      reasoningStartedAtMs: timing.startedAt,
                      ...(timing.endedAt === undefined ? {} : { reasoningEndedAtMs: timing.endedAt }),
                    },
                  },
                }),
          });
        }
      }
      continue;
    }
    if (
      (value['type'] === 'image' || value['type'] === 'audio') &&
      typeof value['mimeType'] === 'string' &&
      typeof value['data'] === 'string'
    ) {
      chunks.push({
        type: 'file',
        mediaType: value['mimeType'],
        url: `data:${value['mimeType']};base64,${value['data']}`,
      });
      continue;
    }
    if (value['type'] === 'resource_link' && typeof value['uri'] === 'string' && typeof value['name'] === 'string') {
      chunks.push({
        type: 'source-url',
        sourceId: `${message.id}:source:${String(index)}`,
        url: value['uri'],
        title: typeof value['title'] === 'string' ? value['title'] : value['name'],
      });
      continue;
    }
    const embedded = value['type'] === 'resource' && isRecord(value['resource']) ? value['resource'] : undefined;
    if (embedded && typeof embedded['uri'] === 'string') {
      chunks.push({
        type: 'source-document',
        sourceId: `${message.id}:source:${String(index)}`,
        mediaType: typeof embedded['mimeType'] === 'string' ? embedded['mimeType'] : 'application/octet-stream',
        title: embedded['uri'],
        filename: embedded['uri'],
      });
      continue;
    }
    if (value['type'] === 'acp-session') {
      const id = `${message.id}:acp-session:${String(index)}`;
      const parsed = acpSessionDataSchema.safeParse({ ...value, id });
      if (parsed.success) {
        chunks.push({ type: 'data-acp-session', id, data: parsed.data });
      }
    }
    // Tool-call blocks are projected from their explicit tool-input log row.
  }
  chunks.push(...usageChunks(message));
  // ACP message identities span tool calls; it does not report model step boundaries.
  if (
    message.metadata?.tauInternal?.['origin'] !== 'external' &&
    !streamCheckpoint &&
    !hasToolCall &&
    chunks.some((chunk) => chunk.type !== 'data-acp-session')
  ) {
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
 * ACP is the boundary vocabulary (V3): every external call becomes a
 * `dynamic-tool` part, including a host-normalized Tau MCP call. This keeps one
 * SDK part when a native identity arrives after the sparse initial call; the
 * renderer applies the qualified native porcelain without changing identity.
 * `call` rides along as the part's `toolMetadata`
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
  const presentation = tauInternal?.['presentation'];
  /* The SDK carries a part's `toolMetadata` from the *input* chunk and reuses it
   * for the result. Omit transient status, but retain a terminal replacement so
   * the real SDK consumer sees the final ACP facts.
   *
   * The durable log's JSON and the SDK's `JSONValue` describe the same bytes and
   * differ only in array readonly-ness, so this asserts rather than re-copies. */
  const { status: _status, ...facts } = call ?? {};
  const durable = {
    ...facts,
    ...(call?.status === 'completed' || call?.status === 'failed' ? { status: call.status } : {}),
    ...(external ? { origin: 'external' } : {}),
    ...(typeof agentId === 'string' ? { agentId } : {}),
    ...(presentation === 'tau-mcp' ? { presentation } : {}),
  };
  const tau = durable as ToolChunkMetadata;
  return {
    ...(external ? { dynamic: true } : {}),
    ...(call?.title === undefined ? {} : { title: call.title }),
    ...(Object.keys(tau).length === 0 ? {} : { toolMetadata: { tau } }),
  };
};

const messageChunks = (
  message: ProviderMessage,
  runId: string,
  streamedBlocks?: AgentHostLiveBlocks,
): UIMessageChunk[] => {
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
      streamedBlocks?.set(settledToolKey(message.toolCallId), { type: 'tool', content: '', closed: true });
      const { title: _title, ...facts } = toolChunkFacts(message);
      const output: UIMessageChunk = message.isError
        ? {
            type: 'tool-output-error',
            toolCallId: message.toolCallId,
            errorText: errorText(message.content, `${message.toolName} failed`),
            ...facts,
          }
        : { type: 'tool-output-available', toolCallId: message.toolCallId, output: message.content, ...facts };
      return facts.dynamic ? [output] : [output, { type: 'finish-step' }, { type: 'start-step' }];
    }
  }
};

/** Read the latest ACP session record for the selected agent from durable UI messages. @public */
export const latestAcpSessionData = (messages: readonly MyUIMessage[], agentId: string): AcpSessionData | undefined => {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const parts = messages[messageIndex]?.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex];
      if (part?.type === 'data-acp-session' && part.data.agentId === agentId) {
        return part.data;
      }
    }
  }
  return undefined;
};

type UserFilePart = Extract<MyUIMessage['parts'][number], { type: 'file' }>;

/**
 * Project one durable attachment block onto the file part a transcript renders.
 *
 * Two arms (D14): a `file-ref` keeps the relative `attachments/…` path so the
 * renderer resolves the bytes against the chat's own directory, and the legacy
 * inline `image` block is still re-synthesized as a `data:` URL. A block whose
 * path is not a resolvable attachment is dropped rather than rendered as a
 * broken source — the rest of the turn still reads.
 *
 * @param value - One durable content block from a user message.
 * @returns The file part, or none when the block is not a renderable attachment.
 */
const userFilePart = (value: Record<string, unknown>): UserFilePart | undefined => {
  if (value['type'] === 'file-ref') {
    const { path, mimeType, filename, byteLength } = value;
    if (typeof path !== 'string' || !isAttachmentUrl(path) || typeof mimeType !== 'string') {
      return undefined;
    }
    return {
      type: 'file',
      mediaType: mimeType,
      url: path,
      ...(typeof filename === 'string' ? { filename } : {}),
      // `FileUIPart` has no size field; `common` is where Tau's own part facts ride.
      ...(typeof byteLength === 'number' ? { providerMetadata: { common: { byteLength } } } : {}),
    };
  }
  if (value['type'] === 'image' && typeof value['mimeType'] === 'string' && typeof value['data'] === 'string') {
    return { type: 'file', mediaType: value['mimeType'], url: `data:${value['mimeType']};base64,${value['data']}` };
  }
  return undefined;
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
    const file = userFilePart(value);
    if (file) {
      parts.push(file);
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

/** One host-attested turn outcome. @public */
export type ProjectedTurnSettlement = TurnConflictedEvent | TurnFailedEvent | TurnFinalizedEvent;

/**
 * Read back the turn settlement a *host* attested.
 *
 * One schema on every host: the browser's revision root emits exactly this
 * shape from the same `turn.machine`, and a Node host writes it into the chat's
 * own durable log, so the revision card is projected from one shape wherever
 * the turn ran. The card's `Rev N` is not here — it is the first-parent ordinal
 * on the selected branch, derived from the graph at read time (I3).
 *
 * @param event - One durable log record.
 * @returns The settlement, or `undefined` for every other record.
 * @public
 */
export const projectTurnSettlement = (event: AgentLogEvent): ProjectedTurnSettlement | undefined => {
  switch (event.type) {
    case 'turn.finalized': {
      return {
        type: 'turn.finalized',
        turnId: event.turnId,
        runId: event.runId,
        chatId: event.chatId,
        projectId: event.projectId,
        checkoutId: event.checkoutId,
        ...(event.revisionId === undefined ? {} : { revisionId: event.revisionId }),
        ...(event.branch === undefined ? {} : { branch: event.branch }),
        changedPaths: event.changedPaths,
        ...(event.treeId === undefined ? {} : { treeId: event.treeId }),
        trigger: 'turn',
        runIds: event.runIds,
      };
    }
    case 'turn.conflicted': {
      return {
        type: 'turn.conflicted',
        turnId: event.turnId,
        runId: event.runId,
        chatId: event.chatId,
        checkoutId: event.checkoutId,
      };
    }
    case 'turn.failed': {
      return {
        type: 'turn.failed',
        turnId: event.turnId,
        runId: event.runId,
        chatId: event.chatId,
        checkoutId: event.checkoutId,
        reason: event.reason,
      };
    }
    default: {
      return undefined;
    }
  }
};

/** Read the finalized member used by revision cards. @public */
export const projectTurnFinalized = (event: AgentLogEvent): TurnFinalizedEvent | undefined => {
  const settlement = projectTurnSettlement(event);
  return settlement?.type === 'turn.finalized' ? settlement : undefined;
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
  streamedBlocks: AgentHostLiveBlocks,
): readonly UIMessageChunk[] => {
  if ('toolCallId' in event && streamedBlocks.get(settledToolKey(event.toolCallId))?.closed) {
    return [];
  }
  if (event.type === 'tool-input-start') {
    return [{ type: 'tool-input-start', toolCallId: event.toolCallId, toolName: event.toolName }];
  }
  if (event.type === 'tool-input-delta') {
    return [{ type: 'tool-input-delta', toolCallId: event.toolCallId, inputTextDelta: event.delta }];
  }
  if (event.type === 'tool-input-end') {
    return [
      {
        type: 'tool-input-available',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      },
    ];
  }
  if (event.type === 'tool-output-update') {
    return [
      event.isError
        ? {
            type: 'tool-output-error',
            toolCallId: event.toolCallId,
            errorText: errorText(event.output, `${event.toolName} failed`),
          }
        : {
            type: 'tool-output-available',
            toolCallId: event.toolCallId,
            output: event.output,
            preliminary: true,
          },
    ];
  }
  const key = blockKey(event.runId, event.messageId, event.contentIndex);
  const type = event.type.startsWith('text-') ? 'text' : 'thinking';
  const id = blockId(type, event.messageId, event.contentIndex);
  const current = streamedBlocks.get(key);
  if (current?.closed) {
    return [];
  }
  if (event.type === 'text-start' || event.type === 'thinking-start') {
    if (current) {
      return [];
    }
    streamedBlocks.set(key, {
      type,
      content: '',
      closed: false,
      ...(event.type === 'thinking-start' && event.timestamp !== undefined ? { startedAtMs: event.timestamp } : {}),
    });
    return [
      {
        type: type === 'text' ? 'text-start' : 'reasoning-start',
        id,
        ...(event.type === 'thinking-start' && event.timestamp !== undefined
          ? { providerMetadata: { common: { reasoningStartedAtMs: event.timestamp } } }
          : {}),
      },
    ];
  }
  const start: UIMessageChunk[] = current ? [] : [{ type: type === 'text' ? 'text-start' : 'reasoning-start', id }];
  const block = current ?? { type, content: '', closed: false };
  if (event.type === 'text-delta' || event.type === 'thinking-delta') {
    // Durable checkpoints and live deltas travel on independent subscriptions.
    // A missing prefix is recovered by the next checkpoint/end, never guessed.
    const offset = event.offset ?? block.content.length;
    if (offset > block.content.length) {
      return [];
    }
    const delta = event.delta.slice(block.content.length - offset);
    block.content += delta;
    streamedBlocks.set(key, block);
    return delta ? [...start, { type: type === 'text' ? 'text-delta' : 'reasoning-delta', id, delta }] : start;
  }
  const { content } = event;
  const suffix = content.startsWith(block.content) ? content.slice(block.content.length) : '';
  block.content = content;
  block.closed = true;
  streamedBlocks.set(key, block);
  const chunks: UIMessageChunk[] = [...start];
  if (suffix) {
    chunks.push({ type: type === 'text' ? 'text-delta' : 'reasoning-delta', id, delta: suffix });
  }
  chunks.push({
    type: type === 'text' ? 'text-end' : 'reasoning-end',
    id,
    ...(event.type === 'thinking-end' && (block.startedAtMs !== undefined || event.timestamp !== undefined)
      ? {
          providerMetadata: {
            common: {
              ...(block.startedAtMs === undefined ? {} : { reasoningStartedAtMs: block.startedAtMs }),
              ...(event.timestamp === undefined ? {} : { reasoningEndedAtMs: event.timestamp }),
            },
          },
        }
      : {}),
  });
  return chunks;
};

/** Whether this run left a checkpointed block open, so its next delta continues the same part. */
const hasOpenBlock = (runId: string, streamedBlocks: AgentHostLiveBlocks | undefined): boolean => {
  const prefix = `[${JSON.stringify(runId)},`;
  for (const [key, block] of streamedBlocks ?? []) {
    if (!block.closed && key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

const lifecycleChunks = (
  event: Extract<AgentLogEvent, { readonly type: 'run.lifecycle' }>,
  streamedBlocks: AgentHostLiveBlocks | undefined,
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
      /* The reducer forgets its active parts on `finish-step` without closing
       * them, so a resumed checkpoint block would throw on its next delta
       * (chat activity indicator closeout R5). The step stays open instead. */
      return hasOpenBlock(event.runId, streamedBlocks) ? [] : [{ type: 'finish-step' }];
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
  streamedBlocks?: AgentHostLiveBlocks,
): readonly UIMessageChunk[] => {
  switch (event.type) {
    case 'message.appended': {
      return messageChunks(event.message, event.runId, streamedBlocks);
    }
    case 'run.lifecycle': {
      return lifecycleChunks(event, streamedBlocks);
    }
    case 'message.envelope-replaced': {
      return messageChunks(event.replacement, event.runId, streamedBlocks);
    }
    case 'history.rewound':
    case 'history.compacted':
    case 'snapshot-context.refreshed':
    case 'safeguard.recorded':
    case 'model.invocation-prepared':
    case 'model.invocation-bound':
    case 'turn.finalized':
    case 'turn.conflicted':
    case 'turn.failed':
    case 'turn.history-projection-committed': {
      /* The three turn settlements are facts about the project's revision
       * graph, not about the transcript: they are read by
       * `projectTurnFinalized` and render no chunk of their own. */
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
