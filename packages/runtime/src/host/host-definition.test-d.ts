import { expectTypeOf, test } from 'vitest';
import { connectComputeStoreChannel, defineRuntime } from '@taucad/runtime/host';
import { definePlugin } from '@taucad/runtime/plugin';
import type { ComputeStore, KernelPlugin } from '@taucad/runtime';

test('host composition retains exact CAD tuples without a false dynamic witness', () => {
  const toolkit = definePlugin({
    meta: { name: '@test/typed' },
    kernels: {
      cad: (): KernelPlugin<{ stl: { precision: number } }, unknown, 'test'> => ({
        id: 'test',
        extensions: ['test'],
      }),
    },
    presets: { default: ['kernels.cad'] },
  });
  const host = defineRuntime({ plugins: [toolkit()] });
  expectTypeOf(host.cad.kernels[0].id).toEqualTypeOf<'test'>();
  expectTypeOf(host.jobs.length).toEqualTypeOf<0>();
  expectTypeOf(host.machines.length).toEqualTypeOf<0>();
  // @ts-expect-error Only invoked toolkit values belong in host composition.
  defineRuntime({ plugins: [toolkit] });
});

test('host composition can consume a private cross-realm compute capability', () => {
  const channel = new MessageChannel();
  const client = connectComputeStoreChannel(channel.port1);
  expectTypeOf(client.store).toEqualTypeOf<ComputeStore>();
  client.dispose();
});
