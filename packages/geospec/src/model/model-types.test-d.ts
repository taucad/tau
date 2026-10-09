import { describe, expectTypeOf, it } from 'vitest';
import type { GeoSpecSubject } from '#model/subject.js';
import type {
  GeoSpecRuntimeClient,
  GeoSpecRuntimeClientFactory,
  GeoSpecRuntimeSourceAdapter,
  LoadModelCodeOptions,
  LoadModelFileOptions,
  ManagedGeoSpecModelLoader,
} from '#model/types.js';
import { createModelLoader, loadModel } from '#model/index.js';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { KernelPlugin } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime';
import type { z } from 'zod';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

type RequiredEvaluationKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'required-evaluation',
  never,
  Record<never, never>,
  readonly ['cad'],
  z.ZodObject<{ precision: z.ZodNumber }>
>;
declare const requiredEvaluationKernel: RequiredEvaluationKernel;
const requiredEvaluationRuntime = defineRuntime({ kernels: [requiredEvaluationKernel] });
type OptionalEvaluationKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'optional-evaluation',
  never,
  Record<never, never>,
  readonly ['cad'],
  z.ZodObject<{ quality: z.ZodOptional<z.ZodNumber> }>
>;
declare const engine: GeoSpecNativeModelEngine;
declare const optionalEvaluationKernel: OptionalEvaluationKernel;
const optionalEvaluationRuntime = defineRuntime({ kernels: [optionalEvaluationKernel] });

describe('geospec/model public types', () => {
  it('should accept direct parameters for source, code, and file loads', () => {
    const code = Object.fromEntries([['main.ts', '']]);
    expectTypeOf(loadModel({ source: new Uint8Array(), parameters: { width: 10 } })).toEqualTypeOf<
      Promise<GeoSpecSubject>
    >();
    expectTypeOf(loadModel({ code, file: 'main.ts', parameters: { width: 20 } })).toEqualTypeOf<
      Promise<GeoSpecSubject>
    >();
    expectTypeOf(loadModel({ file: 'main.ts', parameters: { width: 30 } })).toEqualTypeOf<Promise<GeoSpecSubject>>();
  });

  it('should keep source-unit declarations on direct raw geometry only', () => {
    expectTypeOf(loadModel({ source: new Uint8Array(), format: 'glb', sourceUnit: 'mm' })).toEqualTypeOf<
      Promise<GeoSpecSubject>
    >();

    // @ts-expect-error -- loadModel has no output-unit knob; every subject is canonical millimetres.
    void loadModel({ source: new Uint8Array(), format: 'glb', unit: 'mm' });

    // @ts-expect-error -- runtime-backed file loads do not expose source-unit options.
    const invalidFileOptions: LoadModelFileOptions = { file: 'main.ts', sourceUnit: 'mm' };
    void invalidFileOptions;

    const code = Object.fromEntries([['main.ts', 'export default function main() {}']]) as Record<'main.ts', string>;
    const invalidCodeOptions: LoadModelCodeOptions<Record<'main.ts', string>> = {
      code,
      file: 'main.ts',
      // @ts-expect-error -- runtime-backed code loads do not expose source-unit options.
      sourceUnit: 'mm',
    };
    void invalidCodeOptions;

    // @ts-expect-error -- shared defaults cannot override the runtime-backed source-unit contract.
    createModelLoader({ engine, sourceUnit: 'mm' });
  });

  it('should keep kernel selection out of loadModel authoring options', () => {
    void loadModel({
      file: 'main.ts',
      // @ts-expect-error -- GeoSpec relies on Tau runtime kernel inference.
      kernel: 'jscad',
    });

    const code = Object.fromEntries([['main.ts', 'export default function main() {}']]) as Record<'main.ts', string>;
    const invalidCodeOptions: LoadModelCodeOptions<Record<'main.ts', string>> = {
      code,
      file: 'main.ts',
      // @ts-expect-error -- code-backed model loads do not accept public kernel hints.
      kernel: 'jscad',
    };
    void invalidCodeOptions;
  });

  it('should accept Tau runtime clients through the GeoSpec runtime surface', () => {
    expectTypeOf<RuntimeClient>().toExtend<GeoSpecRuntimeClient>();
    expectTypeOf<RuntimeClient<typeof optionalEvaluationRuntime>>().toExtend<GeoSpecRuntimeClient>();
    // GeoSpec loadModel has no evaluateOptions input; a kernel requiring one cannot be admitted through it.
    expectTypeOf<RuntimeClient<typeof requiredEvaluationRuntime>>().not.toExtend<GeoSpecRuntimeClient>();
    expectTypeOf<LoadModelFileOptions['runtime']>().toEqualTypeOf<
      GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory | undefined
    >();

    const adapter: GeoSpecRuntimeSourceAdapter = {
      id: 'custom-source',
      extensions: ['cad'],
      async createRuntime() {
        throw new Error('type-only fixture');
      },
    };
    createModelLoader({ engine, sourceAdapters: [adapter] });
    expectTypeOf(createModelLoader({ engine })).toEqualTypeOf<ManagedGeoSpecModelLoader>();
    // @ts-expect-error -- a host loader always needs the compiled engine that admits its subjects.
    createModelLoader({ sourceAdapters: [adapter] });
  });
});
