import { middleware } from '@taucad/middleware';
import { openrscad } from '@taucad/openrscad';
import { defineRuntime } from '@taucad/runtime/worker';

export const runtime = defineRuntime({
  plugins: [openrscad(), middleware({ preset: 'cache' })],
});
