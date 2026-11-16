import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { attachmentImageRuntime } from '#runtime/attachment-image-runtime.definition.js';

/**
 * The image formats the composer admits for conversion: every source with an edge to `jpeg` in
 * {@link attachmentImageRuntime}. Loaded by dynamic import only, so the definition and its codecs stay outside the
 * entry's static import graph. Replaced at module resolution in desktop builds, whose renderer carries no transcoder.
 */
export const attachmentTranscodeSources: readonly string[] = deriveTranscodeSources(attachmentImageRuntime, 'jpeg');
