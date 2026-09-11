import { describe, expectTypeOf, it } from 'vitest';
import type { RuntimeClient } from '#client/runtime-client.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/index.js';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { inProcessTransport } from '#transport/in-process.js';
import type { RuntimeDefinition } from '#worker/runtime-definition.js';

type ExactRuntime = RuntimeDefinition<
  readonly KernelPlugin[],
  readonly MiddlewarePlugin[],
  readonly BundlerPlugin[],
  readonly [TranscoderPlugin<{ readonly png: { readonly quality: number } }, 'svg', 'image'>]
>;
type VariadicRuntime = RuntimeDefinition<
  readonly KernelPlugin[],
  readonly MiddlewarePlugin[],
  readonly BundlerPlugin[],
  ReadonlyArray<TranscoderPlugin<{ readonly png: { readonly quality: number } }, 'svg', 'image'>>
>;

declare const dynamicClient: RuntimeClient;
declare const exactClient: RuntimeClient<ExactRuntime>;
declare const variadicClient: RuntimeClient<VariadicRuntime>;
declare const declaredRuntime: RuntimeDefinition;

describe('RuntimeClient dynamic projection', () => {
  it('should accept an exact client in a host-variable binding', () => {
    const assigned: RuntimeClient = exactClient;
    expectTypeOf(assigned).toEqualTypeOf<RuntimeClient>();
    expectTypeOf(exactClient).toExtend<RuntimeClient>();
  });

  it('should retain usable transcode inputs for a dynamically selected host', () => {
    expectTypeOf<Parameters<RuntimeClient['transcode']>[0]>().not.toEqualTypeOf<never>();
    void dynamicClient.transcode({ from: 'glb', to: 'png', files: [], options: {} });
  });

  it('should project a statically wide in-process runtime as the default client surface', () => {
    const client: RuntimeClient = createRuntimeClient({
      transport: inProcessTransport({ runtime: declaredRuntime, fileSystem: fromMemoryFs() }),
    });
    expectTypeOf<Parameters<typeof client.transcode>[0]>().not.toEqualTypeOf<never>();
    void client.transcode({ from: 'glb', to: 'png', files: [], options: {} });
  });

  it('should preserve exact finite transcode inference', () => {
    void exactClient.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 90 } });

    // @ts-expect-error -- exact clients reject source formats absent from their runtime.
    void exactClient.transcode({ from: 'glb', to: 'png', files: [], options: { quality: 90 } });

    // @ts-expect-error -- exact clients retain the edge's option schema.
    void exactClient.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 'high' } });
  });

  it('should preserve a typed variadic transcoder family', () => {
    void variadicClient.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 90 } });

    // @ts-expect-error -- a typed variadic family is not the statically wide runtime family.
    void variadicClient.transcode({ from: 'glb', to: 'png', files: [], options: { quality: 90 } });
  });
});
