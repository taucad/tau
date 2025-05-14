import type { Message, useChat } from '@ai-sdk/react';
import type { MessageRole, MessageStatus } from '@/types/chat.js';
import { generatePrefixedId } from '@/utils/id.js';
import { idPrefix } from '@/constants/id.js';
import { ENV } from '@/config.js';

export const useChatConstants = {
  api: `${ENV.TAU_API_URL}/v1/chat`,
  sendExtraMessageFields: true,
  maxSteps: 10, // Allow the LLM to respond to client side tool calls.
} as const satisfies Parameters<typeof useChat>[0];

/**
 * Extract the mime type from a data URL
 *
 * @example
 * extractMimeTypeFromDataUrl('data:image/webp;base64,UklGRu6VAQBXR')
 * // -> 'image/webp'
 *
 * @param dataUrl
 * @returns
 */
const extractMimeTypeFromDataUrl = (dataUrl: string) => {
  const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
  return mimeType;
};

// Helper function to create a new message
export function createMessage({
  id,
  content,
  role,
  model,
  status,
  metadata = {},
  imageUrls = [],
}: {
  id?: string;
  content: string;
  role: MessageRole;
  model: string;
  status: MessageStatus;
  metadata?: {
    toolChoice?: 'web_search' | 'none' | 'auto' | 'any';
  };
  imageUrls?: string[];
}): Message {
  const parts: Message['parts'] = [
    {
      type: 'text' as const,
      text: content.trim(),
    },
  ];

  const attachments: Message['experimental_attachments'] = imageUrls.map((url) => ({
    url,
    contentType: extractMimeTypeFromDataUrl(url),
  }));

  return {
    id: id ?? generatePrefixedId(idPrefix.message),
    content: '',
    role,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- experimental properties use experimental_ prefix
    experimental_attachments: attachments,
    parts,
    status,
    model,
    metadata,
    createdAt: new Date(),
  };
}
