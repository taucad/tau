import { describe, expectTypeOf, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import type {
  GeoSpecRuntimeClient,
  GeoSpecRuntimeClientFactory,
  GeoSpecRuntimeSourceAdapter,
  LoadModelCodeOptions,
  LoadModelFileOptions,
} from '#model/types.js';
import { createModelLoader, loadModel } from '#model/index.js';
import type { RuntimeClient } from '@taucad/runtime/client';

describe('geospec/model public types', () => {
  it('should accept direct parameters for source, code, and file loads', () => {
    const code = Object.fromEntries([['main.ts', '']]);
    expectTypeOf(loadModel({ source: new Uint8Array(), parameters: { width: 10 } })).toEqualTypeOf<
      Promise<GeometrySubject>
    >();
    expectTypeOf(loadModel({ code, file: 'main.ts', parameters: { width: 20 } })).toEqualTypeOf<
      Promise<GeometrySubject>
    >();
    expectTypeOf(loadModel({ file: 'main.ts', parameters: { width: 30 } })).toEqualTypeOf<Promise<GeometrySubject>>();
  });

  it('should keep source-unit declarations on direct raw geometry only', () => {
    expectTypeOf(loadModel({ source: new Uint8Array(), format: 'glb', sourceUnit: 'mm' })).toEqualTypeOf<
      Promise<GeometrySubject>
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
    createModelLoader({ sourceUnit: 'mm' });
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
    createModelLoader({ sourceAdapters: [adapter] });
  });
});
