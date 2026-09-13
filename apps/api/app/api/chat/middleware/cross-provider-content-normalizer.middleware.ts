import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ProviderId } from '#api/providers/provider.schema.js';

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

// The Responses API rejects an empty `id`/`call_id`; a present id must match this.
const validResponsesIdPattern = /^[\w-]+$/;

function hasValidResponsesId(value: unknown): boolean {
  return typeof value === 'string' && validResponsesIdPattern.test(value);
}

function rebuildAiMessage(
  message: AIMessage,
  content: AIMessage['content'],
  responseMetadata: AIMessage['response_metadata'] = message.response_metadata,
): AIMessage {
  return new AIMessage({
    content,
    id: message.id,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_calls: message.tool_calls,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    additional_kwargs: message.additional_kwargs,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    response_metadata: responseMetadata,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    usage_metadata: message.usage_metadata,
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

  return rebuildAiMessage(message, nextContent);
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

  return rebuildAiMessage(message, nextContent);
}

/**
 * Drops `reasoning` content blocks that cannot be validly replayed to the OpenAI
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
function dropUnreplayableReasoningForOpenai(message: AIMessage): AIMessage {
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

  return rebuildAiMessage(message, nextContent);
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
function buildOpenaiAssistantTextItem(text: string): Record<string, unknown> {
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
function rewriteAssistantTextForOpenai(message: AIMessage): AIMessage {
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
      nextContent.push(buildOpenaiAssistantTextItem(textBuffer));
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

  return rebuildAiMessage(message, nextContent as AIMessage['content'], {
    ...responseMetadata,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    model_provider: 'openai',
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
function normalizeToolMessageForOpenai(message: ToolMessage): ToolMessage {
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
  const { content } = message;

  if (!Array.isArray(content)) {
    return message;
  }

  const targetIsAnthropic = targetProvider === 'anthropic';
  const nextContent = content.map((block) => normalizeContentBlock(block, targetIsAnthropic));
  let result = nextContent.every((block, index) => block === content[index])
    ? message
    : rebuildAiMessage(message, nextContent as typeof content);

  if (targetProvider === 'vertexai') {
    result = stripToolCallBlocksForGoogle(result);
  }

  // Anthropic and OpenAI both format assistant tool calls from the content block,
  // so both need empty `args`/`input` recovered from `message.tool_calls`.
  if (targetProvider === 'anthropic' || targetProvider === 'openai') {
    result = healEmptyToolCallArgs(result);
  }

  if (targetProvider === 'openai') {
    result = dropUnreplayableReasoningForOpenai(result);
    result = rewriteAssistantTextForOpenai(result);
  }

  return result;
}

/**
 * Rewrites legacy Anthropic-native assistant blocks (`thinking`, `redacted_thinking`, `compaction`)
 * into LangChain V1-standard shapes before the active provider formats messages.
 *
 * Target-aware healers for tool-call portability:
 * - **vertexai**: strips tool-call content blocks (Google reads `message.tool_calls` only).
 * - **anthropic**: heals empty V1 `tool_call` / `tool_use` args from `message.tool_calls`.
 * - **openai**: heals empty `tool_call` args, drops `reasoning` blocks lacking a
 *   valid id (the converter would otherwise emit an API-rejected `id: ''`), then
 *   rewrites V1 assistant `text` blocks into native Responses `output_text`
 *   message items so the API accepts them for the assistant role — while
 *   preserving `output_version: 'v1'`.
 *
 * For OpenAI targets, also rewrites `ToolMessage` content blocks from the generic
 * LangChain V1 shape (`text` / `image_url`) into the OpenAI Responses API native
 * shape (`input_text` / `input_image`) so screenshots reach the model as real
 * pixels instead of a `JSON.stringify`'d base64 blob.
 *
 * Runs before {@link messageContentSanitizerMiddleware}, which assumes `reasoning` blocks where needed.
 */
export const createCrossProviderContentNormalizerMiddleware = (targetProvider: ProviderId): AgentMiddleware => {
  const targetIsOpenai = targetProvider === 'openai';

  return createMiddleware({
    name: 'CrossProviderContentNormalizer',

    async wrapModelCall(request, handler) {
      const normalized = request.messages.map((message) => {
        if (AIMessage.isInstance(message)) {
          return normalizeAiMessage(message, targetProvider);
        }
        if (targetIsOpenai && ToolMessage.isInstance(message)) {
          return normalizeToolMessageForOpenai(message);
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
