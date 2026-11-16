/**
 * Node worker entry for the host-parity test: a runtime with only the raster transcoder, hosted over the
 * node-worker transport exactly as a Node host composes one.
 */

import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { rasterTranscoder } from '#raster/raster.transcoder.js';

const rasterRuntime = defineRuntime({ transcoders: [rasterTranscoder()] });

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: rasterRuntime }) }).open();
