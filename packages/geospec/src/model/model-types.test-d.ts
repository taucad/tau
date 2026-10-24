import { describe, expectTypeOf, it } from 'vitest';
import type { GeoSpecSubject } from '#model/subject.js';
import type {
  CreateModelLoaderOptions,
  GeoSpecModelArtifact,
  GeoSpecModelExporter,
  GeoSpecModelExportRequest,
  LoadModelCodeOptions,
  LoadModelFileOptions,
  LoadModelSourceOptions,
  ManagedGeoSpecModelLoader,
} from '#model/types.js';
import { createModelLoader, loadModel } from '#model/index.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

declare const engine: GeoSpecNativeModelEngine;

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

  it('should name a rootDir on file and path-source loads only', () => {
    expectTypeOf<LoadModelFileOptions['rootDir']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<LoadModelSourceOptions['rootDir']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<LoadModelCodeOptions['rootDir']>().toEqualTypeOf<undefined>();
    expectTypeOf(loadModel({ file: 'main.ts', rootDir: 'parts/gear' })).toEqualTypeOf<Promise<GeoSpecSubject>>();

    const code = { 'main.ts': '' };
    // @ts-expect-error -- inline code has no project folder to resolve in, so it takes no rootDir.
    void loadModel({ code, file: 'main.ts', rootDir: 'parts' });
  });

  it('should keep source-unit declarations on direct raw geometry only', () => {
    expectTypeOf(loadModel({ source: new Uint8Array(), format: 'glb', sourceUnit: 'mm' })).toEqualTypeOf<
      Promise<GeoSpecSubject>
    >();

    // @ts-expect-error -- loadModel has no output-unit knob; every subject is canonical millimetres.
    void loadModel({ source: new Uint8Array(), format: 'glb', unit: 'mm' });

    // @ts-expect-error -- exported file loads do not expose source-unit options.
    const invalidFileOptions: LoadModelFileOptions = { file: 'main.ts', sourceUnit: 'mm' };
    void invalidFileOptions;

    const code = Object.fromEntries([['main.ts', 'export default function main() {}']]) as Record<'main.ts', string>;
    const invalidCodeOptions: LoadModelCodeOptions<Record<'main.ts', string>> = {
      code,
      file: 'main.ts',
      // @ts-expect-error -- exported code loads do not expose source-unit options.
      sourceUnit: 'mm',
    };
    void invalidCodeOptions;

    // @ts-expect-error -- shared defaults cannot override the exported source-unit contract.
    createModelLoader({ engine, sourceUnit: 'mm' });
  });

  it('should keep kernel selection out of loadModel authoring options', () => {
    void loadModel({
      file: 'main.ts',
      // @ts-expect-error -- the configured exporter, not the spec, selects the kernel.
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

  it('should export source-kind files only through host-configured model exporters', () => {
    // A file load names no exporter or Runtime of its own: the host configures exporters on the loader.
    expectTypeOf<LoadModelFileOptions>().not.toHaveProperty('runtime');
    expectTypeOf<LoadModelCodeOptions>().not.toHaveProperty('runtime');
    expectTypeOf<CreateModelLoaderOptions>().not.toHaveProperty('runtime');
    expectTypeOf<CreateModelLoaderOptions>().not.toHaveProperty('sourceAdapters');
    expectTypeOf<CreateModelLoaderOptions['exporters']>().toEqualTypeOf<readonly GeoSpecModelExporter[] | undefined>();
    expectTypeOf<GeoSpecModelExporter['export']>().toEqualTypeOf<
      (request: GeoSpecModelExportRequest) => Promise<GeoSpecModelArtifact>
    >();

    const exporter: GeoSpecModelExporter = {
      id: 'custom-source',
      extensions: ['cad'],
      capabilities: { formats: ['glb'] },
      async export() {
        throw new Error('type-only fixture');
      },
    };
    createModelLoader({ engine, exporters: [exporter] });
    expectTypeOf(createModelLoader({ engine })).toEqualTypeOf<ManagedGeoSpecModelLoader>();
    // @ts-expect-error -- a host loader always needs the compiled engine that admits its subjects.
    createModelLoader({ exporters: [exporter] });
    const invalidExporter: GeoSpecModelExporter = {
      ...exporter,
      // @ts-expect-error -- an exporter produces GLB or STEP only; GeoSpec admits nothing else from it.
      capabilities: { formats: ['stl'] },
    };
    void invalidExporter;
  });

  it('should accept a bounded work-unit budget everywhere and a crop only on exported loads', () => {
    expectTypeOf(loadModel({ file: 'main.ts', workUnitLimit: 16_000_000 })).toEqualTypeOf<Promise<GeoSpecSubject>>();
    expectTypeOf(loadModel({ source: new Uint8Array(), workUnitLimit: 16_000_000 })).toEqualTypeOf<
      Promise<GeoSpecSubject>
    >();
    expectTypeOf(
      loadModel({
        file: 'main.ts',
        region: { min: [0, 0, 0], max: [40, 40, 60] },
      }),
    ).toEqualTypeOf<Promise<GeoSpecSubject>>();
    const invalidSourceCrop: LoadModelSourceOptions = {
      source: new Uint8Array(),
      // @ts-expect-error -- direct bytes are admitted as they are; only a kernel export can crop.
      region: { min: [0, 0, 0], max: [1, 1, 1] },
    };
    void invalidSourceCrop;
    void loadModel({
      file: 'main.ts',
      // @ts-expect-error -- a crop corner has exactly three millimetre coordinates.
      region: { min: [0, 0], max: [1, 1, 1] },
    });
  });
});
