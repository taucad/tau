/**
 * Type-level contract for the one-call runtime plugin authoring API.
 *
 * These tests are statically analysed by TypeScript through Vitest typecheck.
 */

import { assertType, describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { RuntimeClientOptions } from '#client/runtime-client-core.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { RuntimeConfigInput, RuntimeConfigOutput } from '#worker/runtime-definition.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';

const makeKernel = () =>
  defineKernel({
    id: 'typedKernel',
    extensions: ['ts'],
    name: 'TypedKernel',
    version: '1.0.0',
    optionsSchema: z.object({
      endpoint: z.string(),
      retries: z.number().default(2),
    }),
    renderSchema: z.object({
      tessellation: z.object({
        linearTolerance: z.number(),
      }),
    }),
    exportSchemas: {
      step: z.object({ tolerance: z.number().default(0.1) }),
      stl: z.object({ binary: z.boolean() }),
    },
    async initialize(options) {
      return { endpoint: options.endpoint };
    },
    async getDependencies() {
      return { resolved: [], unresolved: [] };
    },
    async getParameters() {
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    },
    async createGeometry(input) {
      return { geometry: [], nativeHandle: { id: input.filePath } };
    },
    async exportGeometry(_input) {
      return { success: true, data: [], issues: [] };
    },
  });

describe('defineKernel', () => {
  it('returns a callable factory with typed options, exports, and render options', () => {
    const kernel = makeKernel();

    assertType<(options: { endpoint: string; retries?: number | undefined }) => KernelPlugin>(kernel);
    expectTypeOf(kernel({ endpoint: 'wss://example.test' }).id).toEqualTypeOf<'typedKernel'>();

    // @ts-expect-error -- required kernel options are enforced on the factory.
    kernel();

    defineKernel({
      id: 'bad',
      extensions: ['ts'],
      name: 'Bad',
      version: '1.0.0',
      // @ts-expect-error -- unknown authoring keys are rejected at definition time.
      worker: () => undefined,
      async initialize() {
        return {};
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: [], nativeHandle: {} };
      },
      async exportGeometry() {
        return { success: true, data: [], issues: [] };
      },
    });
  });

  it('threads durable native-handle snapshot types through paired hooks', () => {
    const kernel = defineKernel({
      id: 'snapshotKernel',
      extensions: ['snap'],
      name: 'SnapshotKernel',
      version: '1.0.0',
      async initialize() {
        return { contextValue: 'ready' };
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: [], nativeHandle: { handleId: 'native' } };
      },
      serializeNativeHandle(input, runtime, context) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return { snapshotId: input.nativeHandle.handleId };
      },
      deserializeNativeHandle(input, runtime, context) {
        expectTypeOf(input.serializedNativeHandle).toEqualTypeOf<{ snapshotId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return { handleId: input.serializedNativeHandle.snapshotId };
      },
      isNativeHandleValid(input, runtime, context) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return input.nativeHandle.handleId.length > 0;
      },
      async exportGeometry(input) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        return { success: true, data: [], issues: [] };
      },
    });

    assertType<() => KernelPlugin>(kernel);
  });

  it('rejects one-sided durable native-handle snapshot hooks', () => {
    // @ts-expect-error -- snapshot persistence is only valid when both hooks are present.
    defineKernel({
      id: 'halfSnapshotKernel',
      extensions: ['snap'],
      name: 'HalfSnapshotKernel',
      version: '1.0.0',
      async initialize() {
        return {};
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: [], nativeHandle: { handleId: 'native' } };
      },
      serializeNativeHandle(input: { nativeHandle: { handleId: string } }) {
        const { nativeHandle } = input;
        return { snapshotId: nativeHandle.handleId };
      },
      async exportGeometry() {
        return { success: true, data: [], issues: [] };
      },
    });
  });
});

describe('defineMiddleware', () => {
  it('returns a callable factory with typed middleware options', () => {
    const middleware = defineMiddleware({
      id: 'typedMiddleware',
      name: 'TypedMiddleware',
      optionsSchema: z.object({
        cacheTtl: z.number().default(60),
      }),
      async wrapCreateGeometry(input, handler, runtime) {
        expectTypeOf(runtime.options).toEqualTypeOf<{ cacheTtl: number }>();
        return handler(input);
      },
    });

    assertType<(options?: { cacheTtl?: number | undefined }) => MiddlewarePlugin>(middleware);
    expectTypeOf(middleware().id).toEqualTypeOf<'typedMiddleware'>();
  });
});

describe('defineBundler', () => {
  it('returns a callable factory with static or option-derived extensions', () => {
    const bundler = defineBundler({
      id: 'typedBundler',
      name: 'TypedBundler',
      version: '1.0.0',
      optionsSchema: z.object({
        jsx: z.boolean().default(false),
      }),
      extensions: (options) => (options?.jsx ? ['ts', 'tsx'] : ['ts']),
      async initialize(_init, _options) {
        return {};
      },
      async detectImports() {
        return { detectedModules: [], dependencies: [] };
      },
      async bundle() {
        return { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };
      },
      async execute() {
        return { success: true, value: undefined };
      },
      registerModule() {},
    });

    assertType<(options?: { jsx?: boolean | undefined }) => BundlerPlugin>(bundler);
    expectTypeOf(bundler({ jsx: true }).id).toEqualTypeOf<'typedBundler'>();
  });
});

describe('defineTranscoder', () => {
  it('preserves transcoder edge literals and per-edge options', () => {
    const transcoder = defineTranscoder({
      id: 'typedTranscoder',
      name: 'TypedTranscoder',
      version: '1.0.0',
      edges: [
        { from: 'glb', to: 'stl', fidelity: 'mesh', optionsSchema: z.object({ binary: z.boolean() }) },
        { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        if (input.to === 'stl') {
          expectTypeOf(input.options).toEqualTypeOf<{ binary: boolean }>();
        }
        if (input.to === 'usdz') {
          expectTypeOf(input.options).toEqualTypeOf<Record<string, unknown>>();
        }
        return { success: true, data: input.files, issues: [] };
      },
      async cleanup() {},
    });

    assertType<() => TranscoderPlugin>(transcoder);
    expectTypeOf(transcoder().id).toEqualTypeOf<'typedTranscoder'>();
  });
});

describe('defineRuntime and client projections', () => {
  it('threads plugin factories through a typed runtime definition', () => {
    const runtime = defineRuntime({
      kernels: [makeKernel()({ endpoint: 'wss://example.test' })],
      middleware: [
        defineMiddleware({
          id: 'runtimeMiddleware',
          name: 'RuntimeMiddleware',
        })(),
      ],
      bundlers: [
        defineBundler({
          id: 'runtimeBundler',
          name: 'RuntimeBundler',
          version: '1.0.0',
          extensions: ['ts'],
          async initialize() {
            return {};
          },
          async detectImports() {
            return { detectedModules: [], dependencies: [] };
          },
          async bundle() {
            return { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };
          },
          async execute() {
            return { success: true, value: undefined };
          },
          registerModule() {},
        })(),
      ],
    });

    const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    const client = createRuntimeClient({ transport });
    const mainSourcePath = 'main.ts';
    void client.bestRouteFor('step');
    void client.export('step', {
      code: { [mainSourcePath]: 'export default 1;' },
      options: { tessellation: { linearTolerance: 0.1 } },
    });
    void client.export('step', {
      code: { [mainSourcePath]: 'export default 1;' },
      tolerance: 0.1,
    });
    // @ts-expect-error -- `binary` is an STL export option, not a STEP export option.
    void client.export('step', { code: { [mainSourcePath]: 'export default 1;' }, binary: true });
    // @ts-expect-error -- unknown export formats are rejected from the typed runtime projection.
    void client.bestRouteFor('unknown');

    // @ts-expect-error -- static runtimes do not accept boot config.
    createRuntimeClient({ transport, config: {} });

    // @ts-expect-error -- runtime values belong to the transport/host boundary, not client options.
    createRuntimeClient({ runtime, transport });
  });

  it('types boot config using z.input on the client and z.output in createRuntime', () => {
    const configSchema = z.object({
      endpoint: z.string().url(),
      retries: z.coerce.number().default(2),
    });
    const runtime = defineRuntime({
      configSchema,
      createRuntime(config) {
        expectTypeOf(config).toEqualTypeOf<{ endpoint: string; retries: number }>();
        return {
          kernels: [makeKernel()({ endpoint: config.endpoint, retries: config.retries })],
        };
      },
    });

    expectTypeOf<RuntimeConfigInput<typeof runtime>>().toEqualTypeOf<{
      endpoint: string;
      retries?: unknown;
    }>();
    expectTypeOf<RuntimeConfigOutput<typeof runtime>>().toEqualTypeOf<{
      endpoint: string;
      retries: number;
    }>();

    const options = {
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: async () => ({ endpoint: 'https://example.test', retries: '3' }),
    } satisfies RuntimeClientOptions<typeof runtime>;
    void createRuntimeClient<typeof runtime>(options);

    // @ts-expect-error -- configured runtimes require client boot config.
    createRuntimeClient<typeof runtime>({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) });

    void createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: { endpoint: 'https://example.test', retries: '3' },
    });
  });
});
