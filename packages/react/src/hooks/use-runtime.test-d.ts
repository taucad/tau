import { describe, expectTypeOf, it } from 'vitest';
import type { JSONSchema7 } from '@taucad/json-schema';
import { defineRuntime } from '@taucad/runtime/worker';
import type { ExportResult } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { useRuntime } from '#hooks/use-runtime.js';
import type {
  RenderStatus,
  RuntimeParameterRecord,
  SetRuntimeParameters,
  UseRuntimeClientOptionsProvider,
  UseRuntimeOptions,
  UseRuntimeResult,
} from '#hooks/use-runtime.js';

const runtime = defineRuntime({
  kernels: [replicad()],
  bundlers: [esbuild()],
});
const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
const clientOptions = { transport };
const mainPath = '/main.ts';
const utilityPath = '/util.ts';
const scadPath = '/project/main.scad';

describe('useRuntime source input types', () => {
  it('accepts a single-key inline source map without an entry when generics are inferred', () => {
    const result = useRuntime({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' } },
    });

    expectTypeOf(result.status).toEqualTypeOf<UseRuntimeResult['status']>();
  });

  it('accepts explicit runtime typing with a named inline entry path', () => {
    const result = useRuntime<typeof runtime>({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' }, entry: mainPath },
    });

    expectTypeOf(result.geometry).toEqualTypeOf<UseRuntimeResult['geometry']>();
  });

  it('requires entry for multi-key inline source maps and infers the entry key union', () => {
    type MultiFileOptions = UseRuntimeOptions<
      typeof runtime,
      typeof transport,
      { '/main.ts': string; '/util.ts': string }
    >;

    const valid: MultiFileOptions = {
      clientOptions,
      source: {
        files: {
          [mainPath]: 'export default () => helper();',
          [utilityPath]: 'export const helper = () => null;',
        },
        entry: mainPath,
      },
    };
    expectTypeOf(valid).toExtend<UseRuntimeOptions<typeof runtime, typeof transport>>();

    const invalid = {
      clientOptions,
      source: {
        files: {
          [mainPath]: 'export default () => helper();',
          [utilityPath]: 'export const helper = () => null;',
        },
      },
    };
    expectTypeOf(invalid).not.toExtend<MultiFileOptions>();
  });

  it('rejects literal empty inline source maps', () => {
    type EmptyFileOptions = UseRuntimeOptions<typeof runtime, typeof transport, Record<never, never>>;
    const invalid = {
      clientOptions,
      source: { files: {} },
    };

    expectTypeOf(invalid).not.toExtend<EmptyFileOptions>();
  });

  it('accepts binary inline source content', () => {
    const result = useRuntime({
      clientOptions,
      source: { files: { [mainPath]: new Uint8Array([1, 2, 3]) } },
    });

    expectTypeOf(result.status).toEqualTypeOf<UseRuntimeResult['status']>();
  });

  it('accepts filesystem path source mode without inline files', () => {
    const result = useRuntime<typeof runtime>({
      clientOptions,
      source: { path: scadPath },
      initialParameters: { len: 200 },
    });

    expectTypeOf(result.status).toEqualTypeOf<UseRuntimeResult['status']>();
  });

  it('projects framework content onto render input from the composed runtime', () => {
    useRuntime({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' } },
      content: { includeEdges: true, includeTopology: true },
    });

    useRuntime({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' } },
      content: {
        // @ts-expect-error -- unknown framework content is rejected statically.
        includeSketches: true,
      },
    });
  });

  it('exposes hook-owned parameter state and setters', () => {
    const { defaultParameters, parameters, setParameters, resetParameters, jsonSchema } = useRuntime<typeof runtime>({
      clientOptions,
      source: { path: scadPath },
      initialParameters: { len: 200 },
      onParametersChange: (next) => {
        expectTypeOf(next).toEqualTypeOf<RuntimeParameterRecord>();
      },
    });

    expectTypeOf(defaultParameters).toEqualTypeOf<RuntimeParameterRecord>();
    expectTypeOf(parameters).toEqualTypeOf<RuntimeParameterRecord>();
    expectTypeOf(setParameters).toEqualTypeOf<SetRuntimeParameters>();
    expectTypeOf(resetParameters).toEqualTypeOf<() => void>();
    expectTypeOf(jsonSchema).toEqualTypeOf<JSONSchema7 | undefined>();
    expectTypeOf<UseRuntimeResult['jsonSchema']>().toEqualTypeOf<JSONSchema7 | undefined>();

    setParameters({ len: 240 });
    setParameters((current) => ({ ...current, len: 260 }));
    resetParameters();
  });

  it('rejects controlled parameters on hook input', () => {
    const invalid: UseRuntimeOptions<typeof runtime, typeof transport> = {
      clientOptions,
      source: { path: scadPath },
      // @ts-expect-error -- useRuntime owns parameters; callers seed with initialParameters.
      parameters: { len: 200 },
    };

    expectTypeOf(invalid).toEqualTypeOf<UseRuntimeOptions<typeof runtime, typeof transport>>();
  });

  it('accepts stable synchronous client option providers', () => {
    const provider = (): typeof clientOptions => clientOptions;
    const options: UseRuntimeOptions<typeof runtime, typeof transport, { '/main.ts': string }> = {
      clientOptions: provider,
      source: { files: { [mainPath]: 'export default () => null;' } },
    };

    expectTypeOf(options.clientOptions).toExtend<UseRuntimeClientOptionsProvider<typeof runtime, typeof transport>>();
  });

  it('accepts stable asynchronous client option providers', () => {
    const provider = async (): Promise<typeof clientOptions> => clientOptions;
    const result = useRuntime({
      clientOptions: provider,
      source: { files: { [mainPath]: 'export default () => null;' } },
    });

    expectTypeOf(result.status).toEqualTypeOf<UseRuntimeResult['status']>();
  });

  it('rejects a raw promise for client options', () => {
    const invalid = {
      clientOptions: Promise.resolve(clientOptions),
      source: { files: { [mainPath]: 'export default () => null;' } },
    };

    expectTypeOf(invalid).not.toExtend<UseRuntimeOptions<typeof runtime, typeof transport>>();
  });

  it('destructures cleanly with no reserved-word hook result member', () => {
    const { geometry, status, exportGeometry } = useRuntime({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' } },
    });

    expectTypeOf(geometry).toEqualTypeOf<UseRuntimeResult['geometry']>();
    expectTypeOf(status).toEqualTypeOf<RenderStatus>();
    expectTypeOf(exportGeometry).toBeFunction();
    expectTypeOf<Extract<keyof UseRuntimeResult, 'export'>>().toEqualTypeOf<never>();
  });

  it('types exportGeometry options through the runtime export option projection', () => {
    const { exportGeometry } = useRuntime({
      clientOptions,
      source: { files: { [mainPath]: 'export default () => null;' } },
    });

    void exportGeometry('stl', { exportOptions: { binary: true } });
    expectTypeOf(exportGeometry('glb')).toEqualTypeOf<Promise<ExportResult>>();
    void exportGeometry('glb', { exportOptions: { coordinateSystem: 'y-up' } });
    void exportGeometry('glb', { content: { includeEdges: true, includeTopology: true } });

    // @ts-expect-error -- exportGeometry owns source/parameters and accepts only exportOptions.
    void exportGeometry('glb', { source: { path: mainPath } });

    // @ts-expect-error -- renderOptions belongs to render(), not exportGeometry().
    void exportGeometry('glb', { renderOptions: { tessellation: { linearTolerance: 0.1 } } });

    // @ts-expect-error -- options must be nested under exportOptions.
    void exportGeometry('glb', { binary: true });

    void exportGeometry('stl', {
      // @ts-expect-error -- STL does not advertise framework content.
      content: { includeEdges: true },
    });
  });
});
