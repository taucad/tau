import { replicadKernel } from '@taucad/replicad';
import { rolldown } from '@taucad/rolldown';
import { defineRuntime } from '@taucad/runtime/worker';

export const runtime = defineRuntime({ plugins: [rolldown()], kernels: [replicadKernel({ wasm: 'multi' })] });
