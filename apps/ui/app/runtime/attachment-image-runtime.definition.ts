import { defineRuntime } from '@taucad/runtime/worker';
import { rasterTranscoder } from '@taucad/image';

/**
 * Raster-only runtime for composer attachments: converts any image it has an edge for to a stored JPEG, in a
 * dedicated worker that exists only while an image is being converted.
 */
export const attachmentImageRuntime = defineRuntime({ transcoders: [rasterTranscoder()] });
