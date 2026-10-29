import { defineRuntime } from '@taucad/runtime/worker';
import { assimpTranscoder } from '@taucad/assimp';

/** Assimp-only runtime that converts the viewer's GLB to USDZ for AR Quick Look. */
export const usdzRuntime = defineRuntime({ transcoders: [assimpTranscoder()] });
