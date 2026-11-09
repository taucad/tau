import { screenshotOutputSchema } from '@taucad/chat';
import type { MyUIMessage } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { z } from 'zod';

/**
 * Maximum base64 string length for image data URLs (~5 MB raw).
 * Matches Anthropic's API limit.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MAX_BASE64_LENGTH = 5 * 1024 * 1024;

const screenshotToolPartType = `tool-${toolName.screenshot}`;

const imageFilePartSchema = z.looseObject({
  type: z.literal('file'),
  mediaType: z.string().startsWith('image/'),
  url: z.string().optional(),
});

const screenshotImagePartSchema = z.looseObject({
  type: z.literal(screenshotToolPartType),
  output: screenshotOutputSchema,
});

export const hasModelVisibleImagePart = (messages: MyUIMessage[]): boolean =>
  messages.some((message) =>
    message.parts.some(
      (part) => imageFilePartSchema.safeParse(part).success || screenshotImagePartSchema.safeParse(part).success,
    ),
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
    for (const part of message.parts) {
      const imagePart = imageFilePartSchema.safeParse(part);
      if (imagePart.success && imagePart.data.url) {
        const dataPrefix = 'base64,';
        const base64Start = imagePart.data.url.indexOf(dataPrefix);
        if (base64Start === -1) {
          continue;
        }

        const base64Data = imagePart.data.url.slice(base64Start + dataPrefix.length);
        if (base64Data.length > MAX_BASE64_LENGTH) {
          const sizeMb = (base64Data.length / (1024 * 1024)).toFixed(1);
          throw new Error(`Image exceeds 5 MB base64 limit (${sizeMb} MB). Please resize the image before uploading.`);
        }
      }
    }
  }
}
