import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';

export const runtime = defineRuntime({ plugins: [esbuild(), replicad(), middleware()] });
