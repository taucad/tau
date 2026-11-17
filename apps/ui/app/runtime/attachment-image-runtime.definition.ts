import { defineRuntime } from '@taucad/runtime/worker';
import { heifTranscoder } from '@taucad/heif';
import { rasterTranscoder } from '@taucad/image';

/**
 * Image-only runtime for composer attachments: converts any image it has an edge for to a stored JPEG, in a
 * dedicated worker that exists only while an image is being converted. HEIC and HEIF go through `@taucad/heif`
 * (operator ruling O1); libheif loads only for a HEIC source.
 */
export const attachmentImageRuntime = defineRuntime({ transcoders: [rasterTranscoder(), heifTranscoder()] });
