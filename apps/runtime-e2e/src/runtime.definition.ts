import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { tscircuit } from '@taucad/tscircuit';

export const runtime = defineRuntime({ plugins: [esbuild(), replicad(), middleware(), tscircuit()] });
