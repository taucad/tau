import { useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import { extractMimeTypeFromDataUrl } from '#utils/chat.utils.js';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';

export type ProjectNameInput = {
  readonly text: string;
  readonly imageUrls?: readonly string[];
};

export type ProjectNameClient = {
  readonly generate: (input: ProjectNameInput) => Promise<string>;
};

const rejectedProjectNames = new Set(['image project', 'new project', 'untitled', 'untitled project']);

/** Whether a generated name is specific enough to become a durable directory label. */
export const isUsableProjectName = (name: string): boolean => {
  const normalized = name.trim().toLocaleLowerCase();
  return normalized.length > 0 && !rejectedProjectNames.has(normalized);
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
      return generateFromParts([...files, ...textParts]);
    },
    [generateFromParts],
  );
  return { generate };
};
