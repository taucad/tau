/**
 * Node worker entry for the host-parity test: a runtime with only the HEIF transcoder, hosted over the node-worker
 * transport exactly as a Node host composes one.
 */

import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { heifTranscoder } from '#heif.transcoder.js';

const heifRuntime = defineRuntime({ transcoders: [heifTranscoder()] });

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: heifRuntime }) }).open();
