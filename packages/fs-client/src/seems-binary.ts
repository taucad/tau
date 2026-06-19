import {
  headSniffByteLength as filesystemHeadSniffByteLength,
  seemsBinary as filesystemSeemsBinary,
} from '@taucad/filesystem';

/**
 * Compatibility export for callers that still import the sniffer size from `fs-client`.
 * @public
 */
export const headSniffByteLength = Number(filesystemHeadSniffByteLength);

/**
 * Compatibility wrapper around the filesystem-owned content sniffer.
 *
 * @param head - Leading bytes from the file content.
 * @returns `true` when the byte prefix indicates binary content.
 * @public
 */
export const seemsBinary = (head: Uint8Array<ArrayBuffer>): boolean => filesystemSeemsBinary(head);
