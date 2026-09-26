/**
 * Shared streaming utilities for filesystem providers.
 *
 * Follows VS Code's `BUFFER_SIZE = 256 * 1024` (256 KiB) chunking strategy.
 * @see repos/vscode/src/vs/platform/files/common/fileService.ts
 */

import type { FileReadStreamOptions } from '#types.js';

/**
 * Default chunk size for streaming reads (256 KiB).
 * Balanced between memory overhead and IPC/context-switch cost.
 * @public
 */
export const streamChunkSize: number = 256 * 1024;

/**
 * Reject invalid byte ranges before they reach buffered or native slicing.
 *
 * @param options - Optional byte range to validate.
 * @public
 */
export function validateFileReadStreamOptions(options?: FileReadStreamOptions): void {
  for (const [name, value] of [
    ['position', options?.position],
    ['length', options?.length],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }
}

/**
 * Wrap a complete `Uint8Array` into a `ReadableStream<Uint8Array>` with chunking.
 * Used as a fallback when the provider doesn't support native streaming.
 *
 * @param buffer - Complete file content to stream in chunks.
 * @param options - Optional position, length, and abort signal.
 * @returns A readable stream delivering 256 KiB chunks.
 * @public
 */
export function bufferToStream(
  buffer: Uint8Array<ArrayBuffer>,
  options?: FileReadStreamOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  validateFileReadStreamOptions(options);
  let offset = options?.position ?? 0;
  const end = options?.length === undefined ? buffer.byteLength : Math.min(offset + options.length, buffer.byteLength);

  return new ReadableStream({
    pull(controller) {
      if (options?.signal?.aborted) {
        controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }

      if (offset >= end) {
        controller.close();
        return;
      }

      const chunkEnd = Math.min(offset + streamChunkSize, end);
      controller.enqueue(buffer.slice(offset, chunkEnd));
      offset = chunkEnd;
    },
  });
}
