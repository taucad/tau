import { flattenImage } from '#components/comments/flatten-image.js';
import { prepareAnnotatedSend } from '#components/comments/prepare-annotated-send.js';
import type { AnnotatedSend } from '#components/comments/prepare-annotated-send.js';

/**
 * Prepares a message with comments for sending, drawing them with the canvas painter. One module holds the step and
 * its painter, so the composer loads both in one request when a message first carries comments.
 *
 * @param input - The draft's attachments, its annotations and the reader of its attachment bytes.
 * @returns The attachments and annotations to send.
 */
export const sendAnnotated = async (
  input: Omit<Parameters<typeof prepareAnnotatedSend>[0], 'flatten'>,
): Promise<AnnotatedSend> => prepareAnnotatedSend({ ...input, flatten: flattenImage });
