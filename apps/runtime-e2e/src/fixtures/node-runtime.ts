import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';

export const nodeRuntime = defineRuntime({ plugins: [replicad(), esbuild()] });

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: nodeRuntime }) }).open();
