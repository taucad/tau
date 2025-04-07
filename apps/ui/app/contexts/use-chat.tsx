import { MessageRole, MessageStatus } from '@/types/chat';
import { generatePrefixedId } from '@/utils/id';
import { PREFIX_TYPES } from '@/utils/constants';
import { Message, useChat } from '@ai-sdk/react';
import { ENV } from '@/config';

export const USE_CHAT_CONSTANTS = {
  api: `${ENV.TAU_API_URL}/v1/chat`,
  sendExtraMessageFields: true,
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
    toolChoice?: 'web' | 'none' | 'auto' | 'any';
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
    id: id ?? generatePrefixedId(PREFIX_TYPES.MESSAGE),
    content: '',
    role,
    experimental_attachments: attachments,
    parts,
    status,
    model,
    metadata,
    createdAt: new Date(),
  };
}
