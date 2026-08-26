/** Pure transport export decoding helpers. @internal */

import type { SharedPool } from '@taucad/memory';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { BinaryContentDelivery, RuntimeExportResultTransport } from '#types/runtime-protocol.types.js';
import { SharedPoolEntryNotFoundError } from '#transport/shared-pool-errors.js';

const materialiseBytes = (
  content: BinaryContentDelivery,
  pool: SharedPool | undefined,
  acknowledge?: (key: string) => void,
): Uint8Array<ArrayBuffer> => {
  if (content.delivery === 'inline') {
    return content.bytes;
  }
  const bytes = pool?.resolveCopy(content.key);
  if (!bytes) {
    throw new SharedPoolEntryNotFoundError(content.key);
  }
  acknowledge?.(content.key);
  return bytes;
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
    data: result.data.map((file) => ({ ...file, bytes: materialiseBytes(file.bytes, pool, acknowledge) })),
  };
};
