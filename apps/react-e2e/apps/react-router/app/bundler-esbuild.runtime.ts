import { esbuild } from '@taucad/esbuild';
import { replicadKernel } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

export const runtime = defineRuntime({ plugins: [esbuild()], kernels: [replicadKernel({ wasm: 'multi' })] });
