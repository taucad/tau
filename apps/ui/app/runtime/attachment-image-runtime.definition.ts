import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { rasterTranscoder } from '@taucad/image';

/**
 * Raster-only runtime for composer attachments: converts any image it has an edge for to a stored JPEG, in a
 * dedicated worker that exists only while an image is being converted.
 */
export const attachmentImageRuntime = defineRuntime({ transcoders: [rasterTranscoder()] });

/**
 * The image formats the composer admits for conversion: every source with an edge to `jpeg` in
 * {@link attachmentImageRuntime}. A desktop build converts in its `default` utility runtime, which registers the
 * same transcoder through `image()`.
 */
export const attachmentTranscodeSources: readonly string[] = deriveTranscodeSources(attachmentImageRuntime, 'jpeg');
