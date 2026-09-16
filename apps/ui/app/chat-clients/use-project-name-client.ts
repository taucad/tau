import { useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';

export type ProjectNameInput = {
  readonly projectId: string;
  readonly text: string;
  /**
   * Image `data:` URLs. The naming profile is reached over HTTP, so the caller
   * resolves stored attachments to bytes first (D14); anything that is not an
   * image data URL — a document, an `attachments/` reference — is not sent.
   */
  readonly imageUrls?: readonly string[];
};

const imageDataUrlPattern = /^data:(image\/[^,;]+)[,;]/;

export type ProjectNameClient = {
  readonly generate: (input: ProjectNameInput) => Promise<string>;
};

/** Multimodal project-name client. Commit naming intentionally remains text-only. */
export const useProjectNameClient = (): ProjectNameClient => {
  const { generateFromParts } = useNameGeneratorPartsClient('project_name');
  const generate = useCallback(
    async (input: ProjectNameInput): Promise<string> => {
      const files = (input.imageUrls ?? []).flatMap((url): MyUIMessage['parts'] => {
        const mediaType = imageDataUrlPattern.exec(url)?.[1];
        return mediaType === undefined ? [] : [{ type: 'file', url, mediaType }];
      });
      const text = input.text.trim();
      const textParts: MyUIMessage['parts'] = text ? [{ type: 'text', text }] : [];
      return generateFromParts([...files, ...textParts], input.projectId);
    },
    [generateFromParts],
  );
  return { generate };
};
