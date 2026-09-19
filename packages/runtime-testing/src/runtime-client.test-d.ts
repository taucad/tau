import { expectTypeOf, test } from 'vitest';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { RuntimeDefinition } from '@taucad/runtime/worker';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '@taucad/runtime';

type ExactRuntime = RuntimeDefinition<
  readonly KernelPlugin[],
  readonly MiddlewarePlugin[],
  readonly BundlerPlugin[],
  readonly [TranscoderPlugin<{ readonly png: { readonly quality: number } }, 'svg', 'image'>]
>;

declare const runtime: ExactRuntime;

test('test client retains exact public routes and supports dynamic client assignment', () => {
  const client = createTestRuntimeClient({ runtime });
  const dynamic: RuntimeClient = client;
  expectTypeOf(dynamic).toEqualTypeOf<RuntimeClient>();
  void client.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 80 } });
  // @ts-expect-error The helper must preserve the selected runtime's route set.
  void client.transcode({ from: 'glb', to: 'png', files: [], options: { quality: 80 } });
  // @ts-expect-error The helper must preserve the selected route's option types.
  void client.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 'high' } });
});
