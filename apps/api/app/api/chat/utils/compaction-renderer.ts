import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { isImageBlock } from '#api/chat/utils/image-block.utils.js';

const toolBlockTypes = new Set(['tool_use', 'tool_call', 'tool_call_chunk', 'input_json_delta', 'server_tool_use']);
const reasoningBlockTypes = new Set(['reasoning', 'thinking', 'redacted_thinking']);

type RenderCompactionTranscriptOptions = {
  readonly keepContextTags?: readonly string[];
};

export function renderCompactionTranscript(
  messages: readonly BaseMessage[],
  options: RenderCompactionTranscriptOptions = {},
): string {
  return messages
    .map((message, index) => renderMessage(message, index, options.keepContextTags ?? []))
    .filter((entry) => entry.length > 0)
    .join('\n\n');
}

function renderMessage(message: BaseMessage, index: number, keepContextTags: readonly string[]): string {
  const role = roleForMessage(message);
  const header = `--- message ${index + 1} role=${role}${message.id ? ` id=${message.id}` : ''} ---`;
  const body = [
    renderContent(message.content),
    ...(AIMessage.isInstance(message) ? renderAiToolCalls(message) : []),
    ...(ToolMessage.isInstance(message) ? renderToolResultMetadata(message) : []),
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  if (!body.trim()) {
    return '';
  }

  const protectedBody = keepContextTags.some((tag) => body.includes(tag))
    ? `<keepContext>\n${body}\n</keepContext>`
    : body;
  return `${header}\n${protectedBody}\n--- end message ${index + 1} ---`;
}

function roleForMessage(message: BaseMessage): string {
  if (message instanceof HumanMessage) {
    return 'user';
  }
  if (AIMessage.isInstance(message)) {
    return 'assistant';
  }
  if (message instanceof SystemMessage) {
    return 'system';
  }
  if (ToolMessage.isInstance(message)) {
    return 'tool';
  }
  return 'unknown';
}

function renderContent(content: BaseMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return stringifyForTranscript(content);
  }

  return content
    .flatMap((block) => renderContentBlock(block))
    .filter((entry) => entry.length > 0)
    .join('\n');
}

function renderContentBlock(block: unknown): string[] {
  if (!isRecord(block)) {
    return [stringifyForTranscript(block)];
  }

  if (isImageBlock(block)) {
    return ['[image omitted from compaction input]'];
  }

  const blockType = block['type'];
  if (typeof blockType === 'string') {
    if (reasoningBlockTypes.has(blockType) || toolBlockTypes.has(blockType)) {
      return [];
    }

    if (
      (blockType === 'text' || blockType === 'input_text' || blockType === 'output_text') &&
      typeof block['text'] === 'string'
    ) {
      return [block['text']];
    }
  }

  if (typeof block['text'] === 'string') {
    return [block['text']];
  }

  return [];
}

function renderAiToolCalls(message: AIMessage): string[] {
  return (message.tool_calls ?? []).map((toolCall, index) => {
    const id = toolCall.id ? ` id=${toolCall.id}` : '';
    return [
      `<tool_call index=${index}${id} name=${toolCall.name}>`,
      stringifyForTranscript(toolCall.args),
      '</tool_call>',
    ].join('\n');
  });
}

function renderToolResultMetadata(message: ToolMessage): string[] {
  const details = [
    message.tool_call_id ? `tool_call_id=${message.tool_call_id}` : undefined,
    message.name ? `name=${message.name}` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  return details.length > 0 ? [`[tool_result ${details.join(' ')}]`] : [];
}

function stringifyForTranscript(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
