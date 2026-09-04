import { useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import { extractMimeTypeFromDataUrl } from '#utils/chat.utils.js';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';

export type ProjectNameInput = {
  readonly projectId: string;
  readonly text: string;
  readonly imageUrls?: readonly string[];
};

export type ProjectNameClient = {
  readonly generate: (input: ProjectNameInput) => Promise<string>;
};

/** Multimodal project-name client. Commit naming intentionally remains text-only. */
export const useProjectNameClient = (): ProjectNameClient => {
  const { generateFromParts } = useNameGeneratorPartsClient('project_name');
  const generate = useCallback(
    async (input: ProjectNameInput): Promise<string> => {
      const files: MyUIMessage['parts'] = (input.imageUrls ?? []).map((url) => ({
        type: 'file',
        url,
        mediaType: extractMimeTypeFromDataUrl(url),
      }));
      const text = input.text.trim();
      const textParts: MyUIMessage['parts'] = text ? [{ type: 'text', text }] : [];
      return generateFromParts([...files, ...textParts], input.projectId);
    },
    [generateFromParts],
  );
  return { generate };
};
