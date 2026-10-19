import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { GeoSpecModelExporter, GeoSpecModelExportRequest } from '#model/types.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

/** One engine whose subject identity is the first primary byte. */
const fixtureEngine = () => {
  const ingestSubject = vi.fn((_request: Uint8Array<ArrayBuffer>, primary: Uint8Array<ArrayBuffer>) =>
    encode({ result: { subject: { subjectHash: String(primary[0]).repeat(64) } } }),
  );
  const engine: GeoSpecNativeModelEngine = {
    evaluateClaim: (input) => ({ canonicalClaim: input, canonicalPlan: input, canonicalResult: input }),
    processRequest: () =>
      encode({
        requestId: 'configuration',
        result: {
          canonicalProfile: 'geospec-jcs-v1',
          protocolVersion: 3,
          registryVersion: 5,
          configuration: { binaryAdmissionLimits: { maxSubjectBytes: 1024, maxTotalBinaryBytes: 1024 } },
        },
      }),
    ingestSubject,
    subjectHandle: (request) =>
      encode({ result: { subjectHandle: { subjectHash: decode(request)['subjectHash'], generation: 1 } } }),
    releaseSubject: () => encode({ result: {} }),
  };
  return { engine, ingestSubject };
};

const digest = 'a'.repeat(64);

const fixtureExporter = (overrides: Partial<GeoSpecModelExporter> = {}) => {
  const exportModel = vi.fn(async (request: GeoSpecModelExportRequest) => ({
    bytes: Uint8Array.of(7),
    format: request.format,
    consumedSources: [{ path: request.file, sha256: digest }],
  }));
  const exporter: GeoSpecModelExporter = {
    id: 'fixture',
    extensions: ['py'],
    capabilities: { formats: ['glb'] },
    export: exportModel,
    ...overrides,
  };
  return { exporter, exportModel };
};

const diagnosticsOf = async (pending: Promise<unknown>) => {
  const error: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(GeoSpecModelLoadError);
  return (error as GeoSpecModelLoadError).diagnostics;
};

describe('model exporters', () => {
  it('should export a claimed file and admit its bytes with the consumed sources as its revision', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, projectPath: '/work', exporters: [exporter] });

    const subject = await loader({ file: 'parts/main.py', meshLinearTolerance: 0.01 });

    expect(exportModel).toHaveBeenCalledWith({
      file: 'parts/main.py',
      format: 'glb',
      projectPath: '/work',
      mesh: { linearTolerance: 0.01 },
    });
    expect(ingestSubject).toHaveBeenCalledOnce();
    const request = decode(ingestSubject.mock.calls[0]![0]);
    expect(request['frame']).toStrictEqual({ coordinateSystem: 'z-up', sourceUnit: 'mm', outputUnit: 'mm' });
    expect(subject.load).toMatchObject({
      status: 'complete',
      format: 'glb',
      exportOptions: { exporter: 'fixture', mesh: { linearTolerance: 0.01 } },
      sourceRevision: { entry: 'parts/main.py', files: { 'parts/main.py': `sha256:${digest}` } },
    });
  });

  it('should take the first exporter that claims the file, matching extensions case-insensitively or by catch-all', async () => {
    const { engine } = fixtureEngine();
    const scad = fixtureExporter({ id: 'scad', extensions: ['.SCAD'] });
    const any = fixtureExporter({ id: 'any', extensions: ['*'] });
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [scad.exporter, any.exporter] });

    await loader({ file: 'main.scad' });
    await loader({ file: 'main.kcl' });

    expect(scad.exportModel).toHaveBeenCalledOnce();
    expect(any.exportModel).toHaveBeenCalledOnce();
  });

  it('should refuse a file no exporter claims with GEOSPEC_EXPORTER_MISSING', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });

    const diagnostics = await diagnosticsOf(loader({ file: 'main.ts' }));

    expect(diagnostics).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_MISSING', details: { file: 'main.ts', exporters: ['fixture'] } },
    ]);
    expect(exportModel).not.toHaveBeenCalled();
  });

  it.each([
    ['formats', { file: 'main.py', format: 'step' } as const],
    ['parameters', { file: 'main.py', parameters: { width: 4 } }],
    ['region', { file: 'main.py', region: { min: [0, 0, 0], max: [1, 1, 1] } as const }],
    ['inlineSources', { file: 'main.py', code: { 'main.py': 'box()' } }],
  ])('should refuse an undeclared %s claim before calling export', async (capability, options) => {
    const { engine, ingestSubject } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });

    const diagnostics = await diagnosticsOf(loader(options));

    expect(diagnostics).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_UNSUPPORTED', details: { exporter: 'fixture', capability } },
    ]);
    expect(exportModel).not.toHaveBeenCalled();
    expect(ingestSubject).not.toHaveBeenCalled();
  });

  it('should pass declared parameters, region and inline sources through the request', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter({
      capabilities: { formats: ['glb', 'step'], parameters: true, region: true, inlineSources: true },
    });
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });

    await loader({
      file: 'main.py',
      code: { 'main.py': 'box()' },
      parameters: { width: 4 },
      region: { min: [0, 0, 0], max: [1, 2, 3] },
    });

    expect(exportModel).toHaveBeenCalledWith({
      file: 'main.py',
      format: 'glb',
      parameters: { width: 4 },
      region: { min: [0, 0, 0], max: [1, 2, 3] },
      inline: { 'main.py': 'box()' },
    });
  });

  it('should keep a typed refusal the exporter throws and wrap any other error as GEOSPEC_EXPORTER_FAILED', async () => {
    const { engine } = fixtureEngine();
    const typed = fixtureExporter({
      export: async () => {
        throw new GeoSpecModelLoadError([{ code: 'TAU_KERNEL_MISSING', severity: 'error', message: 'No kernel.' }]);
      },
    });
    const broken = fixtureExporter({
      id: 'broken',
      extensions: ['scad'],
      export: async () => {
        throw new Error('exit 1');
      },
    });
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [typed.exporter, broken.exporter] });

    expect(await diagnosticsOf(loader({ file: 'main.py' }))).toMatchObject([{ code: 'TAU_KERNEL_MISSING' }]);
    expect(await diagnosticsOf(loader({ file: 'main.scad' }))).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_FAILED', details: { exporter: 'broken', file: 'main.scad' } },
    ]);
  });

  it('should refuse an empty artifact or one in another format', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const empty = fixtureExporter({ export: async () => ({ bytes: new Uint8Array(0), format: 'glb' }) });
    const wrong = fixtureExporter({
      extensions: ['scad'],
      export: async () => ({ bytes: Uint8Array.of(1), format: 'step' }),
    });
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [empty.exporter, wrong.exporter] });

    expect(await diagnosticsOf(loader({ file: 'main.py' }))).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_INVALID_ARTIFACT' },
    ]);
    expect(await diagnosticsOf(loader({ file: 'main.scad' }))).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_INVALID_ARTIFACT' },
    ]);
    expect(ingestSubject).not.toHaveBeenCalled();
  });

  it('should export a file afresh on every load, since an exporter offers no source snapshot', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });

    await loader({ file: 'main.py' });
    await loader({ file: 'main.py' });

    expect(exportModel).toHaveBeenCalledTimes(2);
  });

  it('should leave a configured runtime in charge, consulting exporters only without one', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter({ extensions: ['*'] });
    const runtime = vi.fn(async () => {
      throw new Error('runtime route taken');
    });
    const loader = createGeoSpecNativeModelLoader({ engine, runtime, exporters: [exporter] });

    await expect(loader({ file: 'main.py' })).rejects.toThrow('runtime route taken');
    expect(exportModel).not.toHaveBeenCalled();
  });
});
