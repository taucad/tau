import { defineRuntime } from '@taucad/runtime/worker';
import { renderTranscoder } from '@taucad/image';

/** Image-only runtime for direct GLB transcoding. */
export const imageRuntime = defineRuntime({ transcoders: [renderTranscoder()] });
