import type { MyUIMessage } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';

/**
 * Maximum base64 string length for image data URLs (~5 MB raw).
 * Matches Anthropic's API limit.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MAX_BASE64_LENGTH = 5 * 1024 * 1024;

const screenshotToolPartType = `tool-${toolName.screenshot}`;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isImageFilePart = (part: unknown): part is { mediaType: string; url?: string } =>
  isObject(part) &&
  part['type'] === 'file' &&
  typeof part['mediaType'] === 'string' &&
  part['mediaType'].startsWith('image/');

const hasScreenshotDataUrl = (output: unknown): boolean => {
  if (!isObject(output) || !Array.isArray(output['images'])) {
    return false;
  }

  return output['images'].some((image) => isObject(image) && typeof image['dataUrl'] === 'string');
};

const isScreenshotImagePart = (part: unknown): boolean =>
  isObject(part) && part['type'] === screenshotToolPartType && hasScreenshotDataUrl(part['output']);

export const hasModelVisibleImagePart = (messages: MyUIMessage[]): boolean =>
  messages.some(
    (message) =>
      Array.isArray(message.parts) &&
      message.parts.some((part) => isImageFilePart(part) || isScreenshotImagePart(part)),
  );

export function validateModelImageInputSupport({
  messages,
  modelName,
  supportsImageInput,
}: {
  messages: MyUIMessage[];
  modelName: string;
  supportsImageInput: boolean;
}): void {
  if (!supportsImageInput && hasModelVisibleImagePart(messages)) {
    throw new Error(
      `${modelName} cannot read image attachments. Switch to a vision-capable model or remove the image.`,
    );
  }
}

/**
 * Validates that all image file parts across messages do not exceed
 * the 5 MB base64 size limit. Throws a descriptive error if any do.
 *
 * Should be called in prepareMessages before conversion to LangChain format.
 *
 * @public
 */
export function validateImageParts(messages: MyUIMessage[]): void {
  for (const message of messages) {
    if (!Array.isArray(message.parts)) {
      continue;
    }

    for (const part of message.parts) {
      if (isImageFilePart(part) && typeof part.url === 'string') {
        const dataPrefix = 'base64,';
        const base64Start = part.url.indexOf(dataPrefix);
        if (base64Start === -1) {
          continue;
        }

        const base64Data = part.url.slice(base64Start + dataPrefix.length);
        if (base64Data.length > MAX_BASE64_LENGTH) {
          const sizeMb = (base64Data.length / (1024 * 1024)).toFixed(1);
          throw new Error(`Image exceeds 5 MB base64 limit (${sizeMb} MB). Please resize the image before uploading.`);
        }
      }
    }
  }
}
