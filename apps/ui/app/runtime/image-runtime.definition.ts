import { defineRuntime } from '@taucad/runtime/worker';
import { imageTranscoder } from '@taucad/image';

/** Image-only runtime for direct GLB transcoding. */
export const imageRuntime = defineRuntime({ transcoders: [imageTranscoder()] });
