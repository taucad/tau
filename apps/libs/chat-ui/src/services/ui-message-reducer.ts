/**
 * The last step of the transcript fold: an assistant message's chunks to its parts, synchronously
 * (use_skill startup latency blueprint, T1).
 *
 * `agent-host-event-projection.ts` owns the chunk vocabulary; this owns what a run of those chunks shows. It reads them
 * as the pinned AI SDK's stream reader does (`readUIMessageStream`), with three differences by design: it is pure (its
 * input and output are never mutated, and a part that did not change keeps its identity), synchronous, and total. A
 * chunk that does not fit (a delta with no open block, an output with no call) is skipped and counted where the SDK
 * throws and ends the stream; `error` and `abort` change no part, because the ledger owns failure.
 */

import type { UIMessageChunk } from 'ai';
import type { MyMessagePart, MyUIMessage } from '@taucad/chat';
import { parsePartialJson } from '#utils/partial-json.js';

/** A part while this reduction owns it: the SDK's fields, written as the SDK writes them. */
type DraftPart = { type: string } & Record<string, unknown>;

type PartialToolCall = Readonly<{
  text: string;
  toolName: string;
  dynamic: boolean;
  title: unknown;
  toolMetadata: unknown;
}>;

/**
 * One assistant message's chunks, reduced: the message they show and what a later suffix continues from.
 *
 * @public
 */
export type ChunkReduction = Readonly<{
  /** The message as shown: `undefined` until a chunk changes what the message shows. */
  message: MyUIMessage | undefined;
  /** Chunks consumed, including skipped ones; a continuation reduces only chunks past this count. */
  length: number;
  /** Chunks that did not fit and changed nothing, which the SDK would have thrown on. */
  skipped: number;
  /** Continuation state; read only by {@link reduceChunks}. */
  working: Readonly<{
    id: string;
    metadata: MyUIMessage['metadata'];
    parts: readonly MyMessagePart[];
    /** Open text and reasoning blocks by chunk id, as part indices. */
    text: Readonly<Record<string, number>>;
    reasoning: Readonly<Record<string, number>>;
    tools: Readonly<Record<string, PartialToolCall>>;
    /** Trailing `step-start` parts no shown change has published yet; the SDK publishes them with the next one. */
    unshown: number;
    shown: boolean;
  }>;
}>;

const emptyReduction: ChunkReduction = Object.freeze({
  message: undefined,
  length: 0,
  skipped: 0,
  working: Object.freeze({
    id: '',
    metadata: undefined,
    parts: [],
    text: {},
    reasoning: {},
    tools: {},
    unshown: 0,
    shown: false,
  }),
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMergeable = (value: unknown): value is Readonly<Record<string, unknown>> =>
  isRecord(value) && !(value instanceof Date) && !(value instanceof RegExp);

/** Deep-merge message metadata as the SDK does: objects merge, anything else replaces, `undefined` is ignored. */
const mergeMetadata = (base: unknown, overrides: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const result: Record<string, unknown> = isRecord(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const prior = result[key];
    result[key] = isMergeable(value) && isMergeable(prior) ? mergeMetadata(prior, value) : value;
  }
  return result;
};

const isToolPart = (part: Readonly<{ type: string }>): boolean =>
  part.type.startsWith('tool-') || part.type === 'dynamic-tool';

type ToolUpdate = Readonly<{
  toolCallId: string;
  toolName: string;
  state: string;
  dynamic: boolean;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
  rawInput?: unknown;
  preliminary?: unknown;
  providerExecuted?: unknown;
  providerMetadata?: unknown;
  title?: unknown;
  toolMetadata?: unknown;
}>;

const settledStates: ReadonlySet<string> = new Set(['output-available', 'output-error']);

/**
 * Reduce chunks onto a message, continuing a previous reduction.
 *
 * Pure: neither `from` nor any chunk is mutated, and a part this call does not change is the same object in the
 * result. Reducing a sequence in two calls gives the same message as reducing it in one.
 *
 * @param chunks - The chunks after `from`'s, in stream order.
 * @param from - The reduction these chunks continue; omitted for a message's first chunk.
 * @returns The reduction after them; `from` itself when there are none.
 * @public
 */
// oxlint-disable-next-line complexity, max-statements, max-lines-per-function -- One reducer over the chunk vocabulary; each case mirrors the SDK reader it replaces.
export const reduceChunks = (
  chunks: Iterable<UIMessageChunk>,
  from: ChunkReduction = emptyReduction,
): ChunkReduction => {
  const start = from.working;
  let { id, metadata, unshown, shown } = start;
  let { length, skipped } = from;
  let parts: DraftPart[] | undefined;
  let text: Record<string, number> | undefined;
  let reasoning: Record<string, number> | undefined;
  let tools: Record<string, PartialToolCall> | undefined;
  /* Parts created or copied by this call, which it may write in place. */
  const owned = new Set<DraftPart>();

  // oxlint-disable-next-line typescript/consistent-type-assertions -- A part's fields are the SDK's own; this reducer writes them by name.
  const startParts = start.parts as readonly DraftPart[];
  const draftParts = (): DraftPart[] => {
    parts ??= [...startParts];
    return parts;
  };
  const ownPart = (index: number): DraftPart => {
    const all = draftParts();
    const part = all[index]!;
    if (owned.has(part)) {
      return part;
    }
    const copy = { ...part };
    owned.add(copy);
    all[index] = copy;
    return copy;
  };
  const push = (part: DraftPart): number => {
    owned.add(part);
    return draftParts().push(part) - 1;
  };
  const textIds = (): Record<string, number> => {
    text ??= { ...start.text };
    return text;
  };
  const reasoningIds = (): Record<string, number> => {
    reasoning ??= { ...start.reasoning };
    return reasoning;
  };
  const toolCalls = (): Record<string, PartialToolCall> => {
    tools ??= { ...start.tools };
    return tools;
  };
  const currentParts = (): readonly DraftPart[] => parts ?? startParts;
  const currentStepStart = (): number => currentParts().findLastIndex((part) => part.type === 'step-start') + 1;
  const write = (): void => {
    shown = true;
    unshown = 0;
  };

  /** The tool part a chunk for `toolCallId` addresses: in the current step first, then the latest anywhere. */
  const findInvocation = (toolCallId: string): number => {
    const all = currentParts();
    const stepStart = currentStepStart();
    for (let index = stepStart; index < all.length; index++) {
      const part = all[index]!;
      if (isToolPart(part) && part['toolCallId'] === toolCallId) {
        return index;
      }
    }
    return all.findLastIndex((part) => isToolPart(part) && part['toolCallId'] === toolCallId);
  };

  // oxlint-disable-next-line complexity -- The SDK's tool-part update, field by field.
  const updateTool = (update: ToolUpdate, existing?: number): void => {
    const all = currentParts();
    let index = existing ?? -1;
    if (index < 0) {
      const stepStart = currentStepStart();
      for (let at = stepStart; at < all.length; at++) {
        const part = all[at]!;
        const kind = update.dynamic ? part.type === 'dynamic-tool' : part.type.startsWith('tool-');
        if (kind && part['toolCallId'] === update.toolCallId) {
          index = at;
          break;
        }
      }
    }
    const settled = settledStates.has(update.state);
    if (index >= 0) {
      const part = ownPart(index);
      part['state'] = update.state;
      if (update.dynamic) {
        part['toolName'] = update.toolName;
      }
      part['input'] = update.input;
      part['output'] = update.output;
      part['errorText'] = update.errorText;
      part['rawInput'] = update.rawInput;
      part['preliminary'] = update.preliminary;
      if (update.title !== undefined) {
        part['title'] = update.title;
      }
      if (update.toolMetadata !== undefined) {
        part['toolMetadata'] = update.toolMetadata;
      }
      part['providerExecuted'] = update.providerExecuted ?? part['providerExecuted'];
      if (update.providerMetadata !== undefined && update.providerMetadata !== null) {
        part[settled ? 'resultProviderMetadata' : 'callProviderMetadata'] = update.providerMetadata;
      }
      return;
    }
    push({
      type: update.dynamic ? 'dynamic-tool' : `tool-${update.toolName}`,
      ...(update.dynamic ? { toolName: update.toolName } : {}),
      toolCallId: update.toolCallId,
      state: update.state,
      title: update.title,
      ...(update.toolMetadata === undefined ? {} : { toolMetadata: update.toolMetadata }),
      input: update.input,
      output: update.output,
      ...(update.dynamic ? {} : { rawInput: update.rawInput }),
      errorText: update.errorText,
      providerExecuted: update.providerExecuted,
      preliminary: update.preliminary,
      ...(update.providerMetadata === undefined || update.providerMetadata === null
        ? {}
        : { [settled ? 'resultProviderMetadata' : 'callProviderMetadata']: update.providerMetadata }),
    });
  };

  const endBlock = (ids: Record<string, number>, chunkId: string, providerMetadata: unknown): boolean => {
    const index = ids[chunkId];
    if (index === undefined) {
      return false;
    }
    const part = ownPart(index);
    part['state'] = 'done';
    part['providerMetadata'] = providerMetadata ?? part['providerMetadata'];
    // oxlint-disable-next-line typescript/no-dynamic-delete -- `ids` is this call's own copy.
    delete ids[chunkId];
    return true;
  };

  const appendDelta = (index: number | undefined, delta: string, providerMetadata: unknown): boolean => {
    if (index === undefined) {
      return false;
    }
    const part = ownPart(index);
    part['text'] = `${String(part['text'])}${delta}`;
    part['providerMetadata'] = providerMetadata ?? part['providerMetadata'];
    return true;
  };

  let consumed = 0;
  for (const chunk of chunks) {
    consumed++;
    let fits = true;
    switch (chunk.type) {
      case 'text-start': {
        textIds()[chunk.id] = push({
          type: 'text',
          text: '',
          providerMetadata: chunk.providerMetadata,
          state: 'streaming',
        });
        write();
        break;
      }
      case 'text-delta': {
        fits = appendDelta(textIds()[chunk.id], chunk.delta, chunk.providerMetadata);
        break;
      }
      case 'text-end': {
        fits = endBlock(textIds(), chunk.id, chunk.providerMetadata);
        break;
      }
      case 'reasoning-start': {
        reasoningIds()[chunk.id] = push({
          type: 'reasoning',
          id: chunk.id,
          text: '',
          providerMetadata: chunk.providerMetadata,
          state: 'streaming',
        });
        write();
        break;
      }
      case 'reasoning-delta': {
        fits = appendDelta(reasoningIds()[chunk.id], chunk.delta, chunk.providerMetadata);
        break;
      }
      case 'reasoning-end': {
        fits = endBlock(reasoningIds(), chunk.id, chunk.providerMetadata);
        break;
      }
      case 'file': {
        push({
          type: 'file',
          mediaType: chunk.mediaType,
          url: chunk.url,
          ...(chunk.providerMetadata === undefined ? {} : { providerMetadata: chunk.providerMetadata }),
        });
        break;
      }
      case 'source-url': {
        push({
          type: 'source-url',
          sourceId: chunk.sourceId,
          url: chunk.url,
          title: chunk.title,
          providerMetadata: chunk.providerMetadata,
        });
        break;
      }
      case 'source-document': {
        push({
          type: 'source-document',
          sourceId: chunk.sourceId,
          mediaType: chunk.mediaType,
          title: chunk.title,
          filename: chunk.filename,
          providerMetadata: chunk.providerMetadata,
        });
        break;
      }
      case 'tool-input-start': {
        const dynamic = chunk.dynamic === true;
        toolCalls()[chunk.toolCallId] = {
          text: '',
          toolName: chunk.toolName,
          dynamic,
          title: chunk.title,
          toolMetadata: chunk.toolMetadata,
        };
        updateTool({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          dynamic,
          state: 'input-streaming',
          providerExecuted: chunk.providerExecuted,
          title: chunk.title,
          toolMetadata: chunk.toolMetadata,
          providerMetadata: chunk.providerMetadata,
        });
        break;
      }
      case 'tool-input-delta': {
        const calls = toolCalls();
        const partial = calls[chunk.toolCallId];
        if (partial === undefined) {
          fits = false;
          break;
        }
        const raw = `${partial.text}${chunk.inputTextDelta}`;
        calls[chunk.toolCallId] = { ...partial, text: raw };
        updateTool({
          toolCallId: chunk.toolCallId,
          toolName: partial.toolName,
          dynamic: partial.dynamic,
          state: 'input-streaming',
          input: parsePartialJson(raw),
          rawInput: raw,
          title: partial.title,
          toolMetadata: partial.toolMetadata,
        });
        break;
      }
      case 'tool-input-available': {
        updateTool({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          dynamic: chunk.dynamic === true,
          state: 'input-available',
          input: chunk.input,
          providerExecuted: chunk.providerExecuted,
          providerMetadata: chunk.providerMetadata,
          title: chunk.title,
          toolMetadata: chunk.toolMetadata,
        });
        break;
      }
      case 'tool-approval-request': {
        const index = findInvocation(chunk.toolCallId);
        if (index < 0) {
          fits = false;
          break;
        }
        const part = ownPart(index);
        part['state'] = 'approval-requested';
        part['approval'] = {
          id: chunk.approvalId,
          ...(chunk.approvalDescriptor === undefined || chunk.approvalDescriptor === null
            ? {}
            : { descriptor: chunk.approvalDescriptor }),
          ...(Object.hasOwn(chunk, 'inputSchemaInput') ? { inputSchemaInput: chunk.inputSchemaInput } : {}),
          ...(chunk.signature === undefined ? {} : { signature: chunk.signature }),
        };
        break;
      }
      case 'tool-output-available':
      case 'tool-output-error': {
        const index = findInvocation(chunk.toolCallId);
        if (index < 0) {
          fits = false;
          break;
        }
        const invocation = currentParts()[index]!;
        const dynamic = invocation.type === 'dynamic-tool';
        const available = chunk.type === 'tool-output-available';
        updateTool(
          {
            toolCallId: chunk.toolCallId,
            toolName: dynamic ? String(invocation['toolName']) : invocation.type.slice('tool-'.length),
            dynamic,
            state: available ? 'output-available' : 'output-error',
            input: invocation['input'],
            ...(available
              ? { output: chunk.output, preliminary: chunk.preliminary }
              : { errorText: chunk.errorText, ...(dynamic ? {} : { rawInput: invocation['rawInput'] }) }),
            providerExecuted: chunk.providerExecuted,
            providerMetadata: chunk.providerMetadata,
            title: invocation['title'],
            toolMetadata: chunk.toolMetadata ?? invocation['toolMetadata'],
          },
          index,
        );
        break;
      }
      case 'start-step': {
        push({ type: 'step-start' });
        unshown++;
        continue;
      }
      case 'finish-step': {
        text = {};
        reasoning = {};
        continue;
      }
      case 'start': {
        const reset = chunk.messageId !== undefined && chunk.messageId !== id;
        if (reset) {
          parts = [];
          text = {};
          reasoning = {};
          tools = {};
          metadata = undefined;
          unshown = 0;
        }
        if (chunk.messageId !== undefined) {
          ({ messageId: id } = chunk);
        }
        if (isRecord(chunk.messageMetadata)) {
          metadata = mergeMetadata(metadata, chunk.messageMetadata);
        }
        if (reset || chunk.messageId !== undefined || isRecord(chunk.messageMetadata)) {
          write();
        }
        continue;
      }
      case 'finish': {
        if (isRecord(chunk.messageMetadata)) {
          metadata = mergeMetadata(metadata, chunk.messageMetadata);
          write();
        }
        continue;
      }
      case 'error':
      case 'abort': {
        // The ledger owns failure; neither changes a part.
        continue;
      }
      case 'message-metadata': {
        // A run's end time (`endedChunk`, `reopenedChunk` in `agent-host-event-projection.ts`).
        if (isRecord(chunk.messageMetadata)) {
          metadata = mergeMetadata(metadata, chunk.messageMetadata);
          write();
        }
        continue;
      }
      case 'tool-input-error':
      case 'tool-output-denied': {
        // Not in the projection's vocabulary (`agent-host-event-projection.ts`).
        fits = false;
        break;
      }
      default: {
        // The remaining SDK chunk types are `data-*`.
        const data = chunk;
        if (data.transient === true) {
          continue;
        }
        const index =
          data.id === undefined
            ? -1
            : currentParts().findIndex((part) => part.type === data.type && part['id'] === data.id);
        if (index >= 0) {
          ownPart(index)['data'] = data.data;
        } else {
          push({ ...data });
        }
        break;
      }
    }
    if (fits) {
      write();
    } else {
      skipped++;
    }
  }
  if (consumed === 0) {
    return from;
  }
  length += consumed;
  const working = {
    id,
    metadata,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Each part is written field by field as the SDK writes it.
    parts: (parts ?? start.parts) as readonly MyMessagePart[],
    text: text ?? start.text,
    reasoning: reasoning ?? start.reasoning,
    tools: tools ?? start.tools,
    unshown,
    shown,
  };
  const visible = unshown === 0 ? working.parts : working.parts.slice(0, -unshown);
  const unchanged =
    from.message !== undefined &&
    from.message.id === id &&
    from.message.metadata === metadata &&
    from.message.parts === visible;
  let message: MyUIMessage | undefined;
  if (shown) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- The SDK's message type holds its parts mutably; these are never written again.
    message = unchanged ? from.message : { id, metadata, role: 'assistant', parts: visible as MyMessagePart[] };
  }
  return {
    message,
    length,
    skipped,
    working,
  };
};
