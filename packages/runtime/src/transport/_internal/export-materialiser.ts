/** Pure transport export decoding helpers. @internal */

import type { SharedPool } from '@taucad/memory';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { BinaryContentDelivery, RuntimeExportResultTransport } from '#types/runtime-protocol.types.js';
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

/** Materialise every successful export file while preserving order and metadata. */
export const materialiseExportResult = (
  result: RuntimeExportResultTransport,
  pool: SharedPool | undefined,
  acknowledge?: (key: string) => void,
): ExportGeometryResult => {
  if (!result.success) {
    return result;
  }
  return {
    ...result,
    data: result.data.map((file) => ({ ...file, bytes: materialiseBinaryContent(file.bytes, pool, acknowledge) })),
  };
};
