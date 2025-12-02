import type { useChat } from '@ai-sdk/react';
import type { MessageRole, MyMetadata, MyUIMessage } from '@taucad/chat';
import { idPrefix } from '@taucad/types/constants';
import { DefaultChatTransport } from 'ai';
import { generatePrefixedId } from '@taucad/utils/id';
import { ENV } from '#config.js';

export const useChatConstants = {
  transport: new DefaultChatTransport({
    api: `${ENV.TAU_API_URL}/v1/chat`,
    credentials: 'include',
  }),
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
const extractMimeTypeFromDataUrl = (dataUrl: string): string => {
  const mimeType = dataUrl.split(',')[0]?.split(':')[1]?.split(';')[0];
  if (!mimeType) {
    throw new Error('Invalid data URL');
  }

  return mimeType;
};

// Helper function to create a new message
export function createMessage({
  id,
  content,
  role,
  metadata,
  imageUrls = [],
}: {
  id?: string;
  content: string;
  role: MessageRole;
  metadata: MyMetadata;
  imageUrls?: string[];
}): MyUIMessage {
  return {
    id: id ?? generatePrefixedId(idPrefix.message),
    role,
    parts: [
      // Always add image parts first so they are rendered first in the UI
      ...imageUrls.map((url) => ({
        type: 'file' as const,
        url,
        mediaType: extractMimeTypeFromDataUrl(url),
      })),
      {
        type: 'text' as const,
        text: content.trim(),
      },
    ],
    metadata: { ...metadata, createdAt: Date.now() },
  };
}
