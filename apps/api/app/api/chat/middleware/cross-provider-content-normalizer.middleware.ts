import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ProviderId } from '#api/providers/provider.schema.js';
import { cloneAiMessage } from '#api/chat/utils/ai-message-clone.js';

type CanonicalToolCall = NonNullable<AIMessage['tool_calls']>[number];

const toolCallContentBlockTypes = new Set([
  'tool_use',
  'tool_call',
  'tool_call_chunk',
  'input_json_delta',
  'server_tool_use',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMessageType(message: unknown): string | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  const typeGetter = message['_getType'];
  if (typeof typeGetter === 'function') {
    const type = Reflect.apply(typeGetter, message, []) as unknown;
    return typeof type === 'string' ? type : undefined;
  }

  const { type } = message;
  return typeof type === 'string' ? type : undefined;
}

function isAiMessageLike(message: unknown): message is BaseMessage & {
  content: AIMessage['content'];
  tool_calls?: AIMessage['tool_calls'];
  invalid_tool_calls?: AIMessage['invalid_tool_calls'];
  additional_kwargs?: AIMessage['additional_kwargs'];
  response_metadata?: AIMessage['response_metadata'];
  usage_metadata?: AIMessage['usage_metadata'];
  id?: string;
} {
  return AIMessage.isInstance(message) || getMessageType(message) === 'ai';
}

function toAiMessage(message: BaseMessage): AIMessage {
  if (AIMessage.isInstance(message)) {
    return message;
  }

  const record = message as unknown as Record<string, unknown>;
  return new AIMessage({
    content: record['content'] as AIMessage['content'],
    id: typeof record['id'] === 'string' ? record['id'] : undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_calls: Array.isArray(record['tool_calls']) ? (record['tool_calls'] as AIMessage['tool_calls']) : undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    invalid_tool_calls: Array.isArray(record['invalid_tool_calls'])
      ? (record['invalid_tool_calls'] as AIMessage['invalid_tool_calls'])
      : undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    additional_kwargs: isRecord(record['additional_kwargs'])
      ? (record['additional_kwargs'] as AIMessage['additional_kwargs'])
      : undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    response_metadata: isRecord(record['response_metadata'])
      ? (record['response_metadata'] as AIMessage['response_metadata'])
      : undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    usage_metadata: isRecord(record['usage_metadata'])
      ? (record['usage_metadata'] as AIMessage['usage_metadata'])
      : undefined,
  });
}

function isToolCallContentBlockType(type: string): boolean {
  return toolCallContentBlockTypes.has(type);
}

function toolCallArgsNeedHeal(args: unknown): boolean {
  if (args === '' || args === undefined) {
    return true;
  }

  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return Object.keys(args).length === 0;
  }

  return false;
}

function cloneAdditionalKwargsWithoutProviderVisibleLegacyToolMetadata(
  additionalKwargs: AIMessage['additional_kwargs'],
): AIMessage['additional_kwargs'] {
  const next: Record<string, unknown> = { ...additionalKwargs };
  delete next['tool_calls'];
  delete next['function_call'];
  return next as AIMessage['additional_kwargs'];
}

function parseLegacyToolArguments(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return isRecord(value) ? value : undefined;
}

function parseReplaySafeLegacyToolCall(value: unknown): CanonicalToolCall | undefined {
  const record = isRecord(value) ? value : undefined;
  const functionValue = record?.['function'];
  const functionRecord = isRecord(functionValue) ? functionValue : undefined;
  const rawName = functionRecord?.['name'];
  const rawId = record?.['id'];

  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return undefined;
  }

  if (typeof rawId !== 'string' || rawId.trim().length === 0) {
    return undefined;
  }

  const args = parseLegacyToolArguments(functionRecord?.['arguments']);
  if (!args) {
    return undefined;
  }

  return {
    id: rawId,
    name: rawName.trim(),
    args,
    type: 'tool_call',
  };
}

function parseReplaySafeLegacyToolCalls(additionalKwargs: AIMessage['additional_kwargs']): CanonicalToolCall[] {
  const rawToolCalls = (additionalKwargs as Record<string, unknown>)['tool_calls'];
  if (!Array.isArray(rawToolCalls)) {
    return [];
  }

  return rawToolCalls.flatMap((rawToolCall) => {
    const parsed = parseReplaySafeLegacyToolCall(rawToolCall);
    return parsed ? [parsed] : [];
  });
}

function normalizeCanonicalToolCallTypes(toolCalls: AIMessage['tool_calls']): AIMessage['tool_calls'] {
  return toolCalls?.map((toolCall) => ({
    ...toolCall,
    type: 'tool_call',
  }));
}

// The Responses API rejects an empty `id`/`call_id`; a present id must match this.
const validResponsesIdPattern = /^[\w-]+$/;

function hasValidResponsesId(value: unknown): boolean {
  return typeof value === 'string' && validResponsesIdPattern.test(value);
}

function rebuildAiMessage(
  message: AIMessage,
  options: {
    readonly content: AIMessage['content'];
    readonly responseMetadata?: AIMessage['response_metadata'];
    readonly toolCalls?: AIMessage['tool_calls'];
    readonly additionalKwargs?: AIMessage['additional_kwargs'];
  },
): AIMessage {
  const { content } = options;
  const responseMetadata = options.responseMetadata ?? message.response_metadata;
  const toolCallOverride = options.toolCalls === undefined ? {} : { toolCalls: options.toolCalls };
  const additionalKwargsOverride =
    options.additionalKwargs === undefined ? {} : { additionalKwargs: options.additionalKwargs };

  return cloneAiMessage(message, {
    content,
    responseMetadata,
    ...toolCallOverride,
    ...additionalKwargsOverride,
  });
}

function dropOutputVersion(responseMetadata: AIMessage['response_metadata']): AIMessage['response_metadata'] {
  if (responseMetadata.output_version === undefined) {
    return responseMetadata;
  }

  const next = { ...responseMetadata };
  delete next.output_version;
  return next;
}

function dropGoogleReplayOutputVersion(
  responseMetadata: AIMessage['response_metadata'],
  toolCalls: AIMessage['tool_calls'],
): AIMessage['response_metadata'] {
  return (toolCalls?.length ?? 0) > 0 ? dropOutputVersion(responseMetadata) : responseMetadata;
}

/**
 * Lets LangChain's Responses converter replay a same-provider OpenAI response
 * from its preserved raw `response_metadata.output`.
 *
 * That raw output is the only lossless copy of a reasoning + custom-tool turn:
 * V1 content drops the reasoning `rs_*` id and the custom-call `ctc_*` item
 * identity. Keeping `output_version: 'v1'` forces the lossy content-block
 * converter and OpenAI rejects the orphaned custom call on the next turn.
 */
function preferNativeOpenAiResponsesOutput(message: AIMessage): AIMessage {
  const { response_metadata: responseMetadata } = message;
  const { output } = responseMetadata as { output?: unknown };
  if (
    responseMetadata.output_version !== 'v1' ||
    responseMetadata.model_provider !== 'openai' ||
    !Array.isArray(output) ||
    output.length === 0 ||
    !output.every((item) => isRecord(item) && typeof item['type'] === 'string')
  ) {
    return message;
  }

  return rebuildAiMessage(message, {
    content: message.content,
    responseMetadata: dropOutputVersion(responseMetadata),
  });
}

function normalizeContentBlock(block: unknown, targetIsAnthropic: boolean): unknown {
  if (!isRecord(block)) {
    return block;
  }

  const blockType = block['type'];
  if (typeof blockType !== 'string') {
    return block;
  }

  if (blockType === 'thinking') {
    const { thinking, signature } = block;
    if (typeof thinking !== 'string') {
      return block;
    }

    const next: Record<string, unknown> = {
      type: 'reasoning',
      reasoning: thinking,
    };

    if (targetIsAnthropic && typeof signature === 'string' && signature.length > 0) {
      next['signature'] = signature;
    }

    return next;
  }

  if (blockType === 'redacted_thinking' || blockType === 'compaction') {
    return {
      type: 'non_standard',
      value: block,
    };
  }

  if (blockType === 'reasoning' && !targetIsAnthropic) {
    if (!('signature' in block) && !('thoughtSignature' in block)) {
      return block;
    }

    const rest = { ...block };
    delete rest['signature'];
    delete rest['thoughtSignature'];
    return rest;
  }

  return block;
}

function stripToolCallBlocksForGoogle(message: AIMessage): AIMessage {
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  const nextContent = content.filter((block) => {
    if (!isRecord(block)) {
      return true;
    }

    const blockType = block.type;
    return typeof blockType !== 'string' || !isToolCallContentBlockType(blockType);
  });

  if (nextContent.length === content.length) {
    return message;
  }

  return rebuildAiMessage(message, {
    content: nextContent,
    responseMetadata: dropOutputVersion(message.response_metadata),
  });
}

function canonicalizeLegacyToolMetadataForGoogle(message: AIMessage): AIMessage {
  const additionalKwargs = message.additional_kwargs;
  const additionalKwargsRecord = additionalKwargs as Record<string, unknown>;
  const withoutLegacyToolMetadata = cloneAdditionalKwargsWithoutProviderVisibleLegacyToolMetadata(additionalKwargs);
  const hasLegacyToolMetadata =
    additionalKwargsRecord['tool_calls'] !== undefined || additionalKwargsRecord['function_call'] !== undefined;
  const hasCanonicalToolCalls = (message.tool_calls?.length ?? 0) > 0;

  if (hasCanonicalToolCalls) {
    const responseMetadata = dropGoogleReplayOutputVersion(message.response_metadata, message.tool_calls);
    if (!hasLegacyToolMetadata && responseMetadata === message.response_metadata) {
      return message;
    }

    return rebuildAiMessage(message, {
      content: message.content,
      responseMetadata,
      additionalKwargs: hasLegacyToolMetadata ? withoutLegacyToolMetadata : message.additional_kwargs,
      toolCalls: normalizeCanonicalToolCallTypes(message.tool_calls),
    });
  }

  const replaySafeToolCalls = parseReplaySafeLegacyToolCalls(additionalKwargs);
  if (replaySafeToolCalls.length === 0) {
    if (!hasLegacyToolMetadata) {
      return message;
    }

    return rebuildAiMessage(message, {
      content: message.content,
      responseMetadata: message.response_metadata,
      additionalKwargs: withoutLegacyToolMetadata,
      toolCalls: [],
    });
  }

  return rebuildAiMessage(message, {
    content: message.content,
    responseMetadata: dropGoogleReplayOutputVersion(message.response_metadata, replaySafeToolCalls),
    additionalKwargs: withoutLegacyToolMetadata,
    toolCalls: replaySafeToolCalls,
  });
}

/**
 * Recovers empty V1 `tool_call` / `tool_use` block args from the parsed
 * `message.tool_calls` entry. Applies to Anthropic and OpenAI targets — both
 * format assistant tool calls from the content block (`_formatStandardContent`
 * reads `tool_use.input`; the OpenAI Responses v1 converter reads `tool_call.args`
 * via `convertFunctionCall`), so an empty `args`/`input` left behind by the
 * upstream streaming-merge gap (`tool_use` + `input_json_delta` not merged)
 * produces an invalid request. Google does not need this — it is stripped and
 * rebuilt from `message.tool_calls` instead.
 */
function healEmptyToolCallArgs(message: AIMessage): AIMessage {
  const { content } = message;

  const { tool_calls: toolCalls } = message;
  if (!Array.isArray(content) || toolCalls === undefined || toolCalls.length === 0) {
    return message;
  }

  const nextContent = content.map((block) => {
    if (!isRecord(block)) {
      return block;
    }

    const blockType = block.type;
    if (blockType !== 'tool_call' && blockType !== 'tool_use') {
      return block;
    }

    const args = blockType === 'tool_use' ? block['input'] : block['args'];
    if (!toolCallArgsNeedHeal(args)) {
      return block;
    }

    const blockId = block.id;
    const match = toolCalls.find((toolCall) => toolCall.id === blockId);
    if (!match) {
      return block;
    }

    if (blockType === 'tool_use') {
      return { ...block, input: match.args };
    }

    return { ...block, args: match.args };
  });

  const unchanged = nextContent.every((block, index) => block === content[index]);
  if (unchanged) {
    return message;
  }

  return rebuildAiMessage(message, { content: nextContent });
}

function toolCallPayloadScore(block: Record<string, unknown>): number {
  const payload = block['type'] === 'tool_call' || block['type'] === 'tool_call_chunk' ? block['args'] : block['input'];
  if (typeof payload === 'string') {
    return payload.length > 0 ? 1 : 0;
  }

  if (isRecord(payload)) {
    return Object.keys(payload).length > 0 ? 2 : 0;
  }

  return payload === undefined ? 0 : 1;
}

function shouldDedupeAnthropicToolCallBlock(block: unknown): block is Record<string, unknown> & { id: string } {
  if (!isRecord(block)) {
    return false;
  }

  const { type, id } = block;
  return (
    (type === 'tool_call' || type === 'tool_call_chunk' || type === 'tool_use' || type === 'server_tool_use') &&
    typeof id === 'string' &&
    id.length > 0
  );
}

function canonicalizeAnthropicV1ToolCallBlock(block: unknown, message: AIMessage): unknown {
  if (message.response_metadata.output_version !== 'v1' || !isRecord(block)) {
    return block;
  }

  if (block['type'] === 'tool_use') {
    return {
      type: 'tool_call',
      id: block['id'],
      name: typeof block['name'] === 'string' ? block['name'] : '',
      args: block['input'],
    };
  }

  if (block['type'] === 'server_tool_use') {
    return {
      type: 'server_tool_call',
      id: block['id'],
      name: typeof block['name'] === 'string' ? block['name'] : '',
      args: block['input'],
    };
  }

  return block;
}

/**
 * Anthropic rejects an assistant message that contains more than one native
 * tool-use content block with the same id. Standard V1 `tool_call` blocks
 * become Anthropic `tool_use` blocks during formatting, so they must be
 * collapsed by the same provider id before the Anthropic converter runs.
 */
function dedupeAnthropicToolCallBlocks(message: AIMessage): AIMessage {
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  const nextContent: typeof content = [];
  const seenToolUseIndexesById = new Map<string, number>();
  let changed = false;

  for (const block of content) {
    if (!shouldDedupeAnthropicToolCallBlock(block)) {
      nextContent.push(block);
      continue;
    }

    const existingIndex = seenToolUseIndexesById.get(block.id);
    if (existingIndex === undefined) {
      seenToolUseIndexesById.set(block.id, nextContent.length);
      nextContent.push(block);
      continue;
    }

    changed = true;
    const existing = nextContent[existingIndex];
    if (isRecord(existing) && toolCallPayloadScore(block) > toolCallPayloadScore(existing)) {
      nextContent[existingIndex] = block;
    }
  }

  const canonicalizedContent = nextContent.map((block) => canonicalizeAnthropicV1ToolCallBlock(block, message));
  const canonicalized = canonicalizedContent.some((block, index) => block !== nextContent[index]);

  return changed || canonicalized
    ? rebuildAiMessage(message, { content: canonicalizedContent as typeof content })
    : message;
}

/**
 * Drops `reasoning` content blocks that cannot be validly replayed to the
 * Responses API.
 *
 * `convertResponsesMessageToAIMessage` persists an OpenAI reasoning item as a
 * lossy V1 `{ type: 'reasoning', reasoning }` block that **drops the real `rs_`
 * id** (the full item is kept only in `additional_kwargs.reasoning`). On replay,
 * `convertReasoningBlock` hardcodes `id: block.id ?? ''`, so an id-less block
 * yields a reasoning item with `id: ''` — which the API rejects
 * (`400 Invalid 'input[n].id': ''`). The converter offers no hook to omit the id,
 * and a reasoning item is only validly replayable carrying its original id, so a
 * block lacking a valid id is unreplayable and is dropped (consistent with the
 * contract that reasoning traces are dropped — not text-downgraded — across
 * turns). Reasoning blocks that DO carry a valid id pass through unchanged.
 */
function dropUnreplayableReasoningForResponses(message: AIMessage): AIMessage {
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  if (message.response_metadata.output_version !== 'v1') {
    return message;
  }

  const nextContent = content.filter(
    (block) => !isRecord(block) || block.type !== 'reasoning' || hasValidResponsesId(block.id),
  );

  if (nextContent.length === content.length) {
    return message;
  }

  return rebuildAiMessage(message, { content: nextContent });
}

/**
 * Builds the OpenAI Responses API assistant message item that carries
 * `output_text` (the valid assistant-role text content type), wrapped as a
 * LangChain `non_standard` content block.
 *
 * The OpenAI Responses v1 converter (`convertStandardContentMessageToResponsesInput`)
 * always emits `input_text` for `text` blocks regardless of role — which the API
 * rejects for the assistant role. Its only verbatim-passthrough is the
 * `non_standard` branch, which yields `block.value` directly as a top-level
 * `ResponsesInputItem`. So the value must be a complete message item (not a bare
 * content part). The shape mirrors the converter's own legacy assistant path
 * (`{ type: 'output_text', text, annotations: [] }`).
 */
function buildResponsesAssistantTextItem(text: string): Record<string, unknown> {
  return {
    type: 'non_standard',
    value: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  };
}

/**
 * Rewrites V1 assistant `text` blocks into native Responses API `output_text`
 * message items (via `non_standard` passthrough) so the OpenAI Responses
 * converter emits assistant-role `output_text` instead of the rejected
 * `input_text` — **without** clearing the load-bearing `output_version: 'v1'`.
 *
 * The `non_standard` passthrough is gated by `isResponsesMessage`
 * (`response_metadata.model_provider === 'openai'`), so cross-provider replays
 * (whose `model_provider` is e.g. `'anthropic'`) require normalizing
 * `model_provider` to `'openai'`. That gate's only effect in the send path is to
 * enable the `non_standard` branch, so the change is surgical. Because flipping
 * it also un-gates *foreign* `non_standard` wrappers (Anthropic
 * `redacted_thinking` / `compaction`, which are not valid Responses items), those
 * are dropped here — matching today's effective behaviour where the gate already
 * discards them for OpenAI targets.
 *
 * `tool_call` / `reasoning` blocks are left in place: the v1 converter handles
 * them natively (`convertFunctionCall` / `convertReasoningBlock`).
 */
function rewriteAssistantTextForResponses(message: AIMessage): AIMessage {
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  const { response_metadata: responseMetadata } = message;
  if (responseMetadata.output_version !== 'v1') {
    return message;
  }

  const hasTextBlock = content.some(
    (block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string',
  );
  if (!hasTextBlock) {
    // No assistant `text` block means no `input_text` hazard. Leave content and
    // `model_provider` untouched (foreign `non_standard` blocks stay gated out).
    return message;
  }

  const nextContent: unknown[] = [];
  let textBuffer = '';
  let bufferOpen = false;
  const flushText = (): void => {
    if (!bufferOpen) {
      return;
    }
    if (textBuffer.length > 0) {
      nextContent.push(buildResponsesAssistantTextItem(textBuffer));
    }
    textBuffer = '';
    bufferOpen = false;
  };

  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      textBuffer += block.text;
      bufferOpen = true;
      continue;
    }

    // Drop foreign `non_standard` wrappers: once `model_provider` is `'openai'`
    // the converter would yield their (Anthropic-only) value verbatim.
    if (isRecord(block) && block.type === 'non_standard') {
      continue;
    }

    flushText();
    nextContent.push(block);
  }
  flushText();

  return rebuildAiMessage(message, {
    content: nextContent as AIMessage['content'],
    responseMetadata: {
      ...responseMetadata,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      model_provider: 'openai',
    },
  });
}

/**
 * Translates a generic LangChain `ToolMessage` content array into the OpenAI
 * Responses API native shape (`input_text` / `input_image`).
 *
 * `langchain-openai`'s Responses converter only forwards a tool-message content
 * array as a typed `function_call_output.output` list when **every** block is
 * `input_text|input_image|input_file`; any other shape (notably the LangChain
 * V1 `text`/`image_url` blocks our screenshot trimmer emits) falls back to
 * `JSON.stringify`, which surfaces base64 image data as raw text to the model.
 *
 * Block rewrites:
 *  - `{type:'image_url', image_url:{url}|string}` -> `{type:'input_image', image_url:url, detail:'auto'}`
 *  - `{type:'text', text}` -> `{type:'input_text', text}`
 *  - already-native blocks pass through unchanged
 *  - string content passes through unchanged
 *
 * Required because `isProviderNativeContent` demands a homogeneously-`input_*`
 * array; leaving a single `text` block would still trigger `JSON.stringify`.
 */
function normalizeToolMessageForResponses(message: ToolMessage): ToolMessage {
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  const nextContent = content.map((block) => {
    if (!isRecord(block)) {
      return block;
    }

    const opaqueBlock = block as unknown as Record<string, unknown>;
    const { type } = opaqueBlock;

    if (type === 'image_url') {
      const rawUrl = opaqueBlock['image_url'];
      let url: string | undefined;
      if (typeof rawUrl === 'string') {
        url = rawUrl;
      } else if (isRecord(rawUrl)) {
        const candidate = (rawUrl as { url: unknown }).url;
        if (typeof candidate === 'string') {
          url = candidate;
        }
      }

      if (url === undefined) {
        return block;
      }

      return {
        type: 'input_image',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses API uses snake_case
        image_url: url,
        detail: 'auto',
      };
    }

    if (type === 'text') {
      const { text } = opaqueBlock;
      if (typeof text === 'string') {
        return {
          type: 'input_text',
          text,
        };
      }
    }

    return block;
  });

  const unchanged = nextContent.every((block, index) => block === content[index]);
  if (unchanged) {
    return message;
  }

  return new ToolMessage({
    content: nextContent as ToolMessage['content'],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_call_id: message.tool_call_id,
    name: message.name,
    id: message.id,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    additional_kwargs: message.additional_kwargs,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    response_metadata: message.response_metadata,
  });
}

function normalizeAiMessage(message: AIMessage, targetProvider: ProviderId): BaseMessage {
  if (targetProvider === 'openai') {
    const nativeReplay = preferNativeOpenAiResponsesOutput(message);
    if (nativeReplay !== message) {
      return nativeReplay;
    }
  }

  const { content } = message;

  if (!Array.isArray(content)) {
    return targetProvider === 'vertexai' ? canonicalizeLegacyToolMetadataForGoogle(message) : message;
  }

  const targetIsAnthropic = targetProvider === 'anthropic';
  const nextContent = content.map((block) => normalizeContentBlock(block, targetIsAnthropic));
  let result = nextContent.every((block, index) => block === content[index])
    ? message
    : rebuildAiMessage(message, { content: nextContent as typeof content });

  if (targetProvider === 'vertexai') {
    result = stripToolCallBlocksForGoogle(result);
    result = canonicalizeLegacyToolMetadataForGoogle(result);
  }

  // Anthropic, Responses API providers, and OpenAI-compatible chat-completions providers format
  // assistant tool calls from the content block — recover empty args from tool_calls.
  if (
    targetProvider === 'anthropic' ||
    targetProvider === 'openai' ||
    targetProvider === 'morph' ||
    targetProvider === 'moonshot' ||
    targetProvider === 'together' ||
    targetProvider === 'xai'
  ) {
    result = healEmptyToolCallArgs(result);
  }

  if (targetProvider === 'anthropic') {
    result = dedupeAnthropicToolCallBlocks(result);
  }

  if (targetProvider === 'openai' || targetProvider === 'xai') {
    result = dropUnreplayableReasoningForResponses(result);
    result = rewriteAssistantTextForResponses(result);
  }

  return result;
}

/**
 * Rewrites legacy Anthropic-native assistant blocks (`thinking`, `redacted_thinking`, `compaction`)
 * into LangChain V1-standard shapes before the active provider formats messages.
 *
 * Target-aware healers for tool-call portability:
 * - **vertexai**: strips tool-call content blocks and canonicalizes/drops
 *   provider-visible legacy tool metadata before LangChain's Google formatter can replay it.
 * - **anthropic**: heals empty V1 `tool_call` / `tool_use` args from `message.tool_calls`
 *   and collapses duplicate `tool_call` / `tool_use` ids that Anthropic rejects.
 * - **openai/xai**: heals empty `tool_call` args, drops `reasoning` blocks lacking
 *   a valid id (the converter would otherwise emit an API-rejected `id: ''`),
 *   then rewrites V1 assistant `text` blocks into native Responses `output_text`
 *   message items so the API accepts them for the assistant role — while preserving
 *   `output_version: 'v1'`.
 * - **morph/moonshot/together**: heals empty `tool_call` args for Chat Completions replay
 *   without applying Responses-only content rewrites.
 *
 * For Responses API targets, also rewrites `ToolMessage` content blocks from the generic
 * LangChain V1 shape (`text` / `image_url`) into the OpenAI Responses API native
 * shape (`input_text` / `input_image`) so screenshots reach the model as real
 * pixels instead of a `JSON.stringify`'d base64 blob.
 *
 * Runs before {@link messageContentSanitizerMiddleware}, which assumes `reasoning` blocks where needed.
 */
export const createCrossProviderContentNormalizerMiddleware = (targetProvider: ProviderId): AgentMiddleware => {
  const targetIsResponsesProvider = targetProvider === 'openai' || targetProvider === 'xai';

  return createMiddleware({
    name: 'CrossProviderContentNormalizer',

    async wrapModelCall(request, handler) {
      const normalized = request.messages.map((message) => {
        if (isAiMessageLike(message)) {
          return normalizeAiMessage(toAiMessage(message), targetProvider);
        }
        if (targetIsResponsesProvider && ToolMessage.isInstance(message)) {
          return normalizeToolMessageForResponses(message);
        }
        return message;
      });

      return handler({
        ...request,
        messages: normalized,
      });
    },
  });
};
