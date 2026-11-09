import type { BaseMessage } from '@langchain/core/messages';

/**
 * Conservative per-image token budget used when planning context-window pressure.
 * Chosen to safely overestimate across all supported providers
 * (Anthropic ~1600-3277, OpenAI ~255-765, Gemini ~258) so that compaction
 * triggers before any provider rejects the request for being over-budget.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
export const IMAGE_TOKEN_ESTIMATE = 2000;

type ContentBlock = Record<string, unknown>;

/**
 * Detects whether a content block represents image data across all known
 * LangChain content block formats:
 * - `{ type: 'image_url', ... }` (OpenAI format)
 * - `{ type: 'image', ... }` (Anthropic format)
 * - `{ type: 'file', mediaType: 'image/...' }` (file part with image media)
 *
 * @public
 */
export function isImageBlock(block: ContentBlock): boolean {
  const { type } = block as { type: unknown };
  if (type === 'image_url' || type === 'image') {
    return true;
  }
  if (type === 'file' && typeof block['mediaType'] === 'string' && block['mediaType'].startsWith('image/')) {
    return true;
  }
  return false;
}

/**
 * Replaces all image blocks in messages with `[image]` text markers.
 * Returns new message instances — does not mutate originals.
 *
 * @public
 */
export function stripImageBlocks(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return message;
    }
    if (!Array.isArray(message.content)) {
      return message;
    }

    const newContent = (message.content as ContentBlock[]).map((block) =>
      isImageBlock(block) ? { type: 'text', text: '[image]' } : block,
    );

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Constructor name is PascalCase by convention
    const MessageType = message.constructor as new (fields: { content: unknown }) => BaseMessage;
    return new MessageType({ ...message, content: newContent });
  });
}

/**
 * Counts total image blocks across all messages.
 *
 * @public
 */
export function countImageBlocks(messages: BaseMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const block of message.content as ContentBlock[]) {
        if (isImageBlock(block)) {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Extracts text-only content from a message's content field.
 * Image blocks are omitted; text/reasoning blocks are concatenated.
 *
 * @public
 */
export function extractTextFromContent(content: BaseMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (isImageBlock(block)) {
      continue;
    }
    const text = (block['text'] ?? block['reasoning'] ?? '') as string;
    if (text) {
      parts.push(text);
    }
  }
  return parts.join('\n');
}
