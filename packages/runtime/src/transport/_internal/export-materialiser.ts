/** Pure transport export decoding helpers. @internal */

import type { SharedPool } from '@taucad/memory';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';
import { SharedPoolEntryNotFoundError } from '#transport/shared-pool-errors.js';

/** Copy a binary payload and acknowledge pooled ownership exactly once. */
export const materialiseBinaryContent = (
  content: BinaryContentDelivery,
  pool: SharedPool | undefined,
  acknowledge?: (key: string) => void,
): Uint8Array<ArrayBuffer> => {
  if (content.delivery === 'inline') {
    return content.bytes;
  }
  try {
    const bytes = pool?.resolveCopy(content.key);
    if (!bytes) {
      throw new SharedPoolEntryNotFoundError(content.key);
    }
    return bytes;
  } finally {
    acknowledge?.(content.key);
  }
};
