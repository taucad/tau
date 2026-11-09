/**
 * Test fixtures for {@link StoredAttachmentRef}: a reference a test names without storing its bytes first.
 * Production code mints the brand only through an attachment store's `put` (I37).
 */

import type { AttachmentReference, StoredAttachmentRef } from '#utils/attachment.utils.js';

/**
 * Brand a fixture reference as stored.
 *
 * @param reference - The fixture's hash, media type and optional name and size.
 * @returns The same object, typed as stored.
 */
export const storedRef = (reference: AttachmentReference): StoredAttachmentRef =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test fixture stands for stored bytes.
  reference as StoredAttachmentRef;
