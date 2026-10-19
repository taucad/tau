import type { VmFileSystem } from '@taucad/esbuild/vm';
import { describe, expect, it, vi } from 'vitest';
import type { SourceRevision } from '@taucad/runtime/types';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeLoadModelOptions, GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type {
  GeoSpecConsumedSources,
  GeoSpecLoadRegion,
  GeoSpecModelArtifact,
  GeoSpecModelExporter,
  GeoSpecModelExportRequest,
} from '#model/types.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { rawSubjectResidency, resolveGeoSpecSubject, bindGeoSpecSubject } from '#model/subject.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { runGeoSpecModule } from '#runner/index.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decodeRequest = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

// SAFETY: the fixture constructs an exact 64-hex SHA-256 digest for source revision identity.
const digest = (fill: string): Exclude<SourceRevision['files'][string], 'missing'> =>
  `sha256:${fill.repeat(64)}` as Exclude<SourceRevision['files'][string], 'missing'>;

/** One engine whose subject identity is the first primary byte, with release accounting. */
const fixtureEngine = () => {
  const released: string[] = [];
  const ingestSubject = vi.fn(
    (
      _request: Uint8Array<ArrayBuffer>,
      primary: Uint8Array<ArrayBuffer>,
      _resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    ) =>
      encode({
        result: { subject: { subjectHash: String(primary[0]).repeat(64) } },
      }),
  );
  const engine: GeoSpecNativeModelEngine = {
    evaluateClaim: (input) => ({
      canonicalClaim: input,
      canonicalPlan: input,
      canonicalResult: input,
    }),
    processRequest: () =>
      encode({
        requestId: 'configuration',
        result: {
          canonicalProfile: 'geospec-jcs-v1',
          protocolVersion: 3,
          registryVersion: 5,
          configuration: {
            binaryAdmissionLimits: {
              maxSubjectBytes: 1024,
              maxTotalBinaryBytes: 1024,
            },
          },
        },
      }),
    ingestSubject,
    subjectHandle: (request) =>
      encode({
        result: {
          subjectHandle: {
            subjectHash: decodeRequest(request)['subjectHash'],
            generation: 1,
          },
        },
      }),
    releaseSubject: (request) => {
      const handle = decodeRequest(request)['subjectHandle'] as {
        subjectHash: string;
      };
      released.push(handle.subjectHash[0]!);
      return encode({ result: {} });
    },
  };
  return { engine, ingestSubject, released };
};

/** A file exporter whose consumed sources and `revision` follow the mutable source digests. */
const fixtureExporter = (
  options: {
    revision?: boolean;
    diagnostics?: (request: GeoSpecModelExportRequest) => GeometryDiagnostic[];
  } = {},
) => {
  const files: Record<string, SourceRevision['files'][string]> = {
    'main.ts': digest('a'),
    'part.ts': digest('b'),
  };
  const byte = { value: 7 };
  const consumed = (): GeoSpecConsumedSources => Object.entries(files).map(([path, sha256]) => ({ path, sha256 }));
  const exportModel = vi.fn(
    async (request: GeoSpecModelExportRequest): Promise<GeoSpecModelArtifact> => ({
      bytes: Uint8Array.of(byte.value),
      format: request.format,
      consumedSources: consumed(),
      diagnostics: options.diagnostics?.(request) ?? [],
    }),
  );
  const revision = vi.fn(
    async (
      _request: Pick<GeoSpecModelExportRequest, 'file' | 'projectPath'>,
    ): Promise<GeoSpecConsumedSources | undefined> => consumed(),
  );
  const exporter: GeoSpecModelExporter = {
    id: 'fixture',
    extensions: ['ts'],
    capabilities: { formats: ['glb', 'step'], parameters: true, region: true, inlineSources: true },
    export: exportModel,
    ...(options.revision === false ? {} : { revision }),
  };
  return { exporter, exportModel, revision, files, byte };
};

describe('native model loader run coalescing', () => {
  it('should export and ingest identical file loads once and record each load as its own reuse', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const { exporter, exportModel, revision } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    try {
      const first = await loader({
        file: 'main.ts',
        parameters: { width: 2, depth: { value: 1 } },
      });
      const second = await loader({
        file: 'main.ts',
        parameters: { depth: { value: 1 }, width: 2 },
      });
      expect(exportModel).toHaveBeenCalledOnce();
      expect(ingestSubject).toHaveBeenCalledOnce();
      expect(revision).toHaveBeenCalledWith({ file: 'main.ts' });
      expect(second.subjectHash).toBe(first.subjectHash);
      expect(first.load).not.toHaveProperty('reused');
      expect(second.load).toMatchObject({
        reused: true,
        artifacts: first.load?.artifacts,
      });
      expect(second.load?.loadId).not.toBe(first.load?.loadId);
      rawSubjectResidency(second)!();
    } finally {
      await loader.releaseAll();
    }
  });

  it('should export again when the source closure changed, a dependency joined it, or it cannot be confirmed', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const changed = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [changed.exporter],
    });
    try {
      await loader({ file: 'main.ts' });
      changed.files['part.ts'] = digest('c');
      const edited = await loader({ file: 'main.ts' });
      expect(changed.exportModel).toHaveBeenCalledTimes(2);
      expect(edited.load).not.toHaveProperty('reused');
      expect(edited.load?.sourceRevision?.files['part.ts']).toBe(digest('c'));
      changed.revision.mockResolvedValueOnce([
        ...Object.entries(changed.files).map(([path, sha256]) => ({ path, sha256 })),
        { path: 'extra.ts', sha256: digest('d') },
      ]);
      await loader({ file: 'main.ts' });
      changed.revision.mockRejectedValueOnce(new Error('revision unavailable'));
      await loader({ file: 'main.ts' });
      changed.revision.mockResolvedValueOnce(undefined);
      await loader({ file: 'main.ts' });
      expect(changed.exportModel).toHaveBeenCalledTimes(5);
    } finally {
      await loader.releaseAll();
    }
    const unverifiable = fixtureExporter({ revision: false });
    const second = createGeoSpecNativeModelLoader({
      engine,
      exporters: [unverifiable.exporter],
    });
    try {
      await second({ file: 'main.ts' });
      await second({ file: 'main.ts' });
      expect(unverifiable.exportModel).toHaveBeenCalledTimes(2);
    } finally {
      await second.releaseAll();
    }
    expect(ingestSubject).toHaveBeenCalledTimes(7);
  });

  it('should compare digests whether or not the exporter prefixes them with sha256:', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel, revision } = fixtureExporter();
    revision.mockResolvedValue([
      { path: 'main.ts', sha256: 'a'.repeat(64) },
      { path: 'part.ts', sha256: 'b'.repeat(64) },
    ]);
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    try {
      await loader({ file: 'main.ts' });
      const reused = await loader({ file: 'main.ts' });
      expect(exportModel).toHaveBeenCalledOnce();
      expect(reused.load).toMatchObject({ reused: true });
      revision.mockResolvedValue([
        { path: 'main.ts', sha256: 'a'.repeat(64) },
        { path: 'part.ts', sha256: 'not-a-digest' },
      ]);
      await loader({ file: 'main.ts' });
      expect(exportModel).toHaveBeenCalledTimes(2);
    } finally {
      await loader.releaseAll();
    }
  });

  it('should key on every export and admission input and never reuse a failure or a released scope', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    try {
      for (const options of [
        { file: 'main.ts', parameters: { width: 2 } },
        { file: 'main.ts', parameters: { width: 3 } },
        { file: 'main.ts', parameters: { width: 3 }, meshLinearTolerance: 0.1 },
        {
          file: 'main.ts',
          parameters: { width: 3 },
          ingestOptions: { tag: 'a' },
        },
        { file: 'other.ts', parameters: { width: 3 } },
        { file: 'main.ts', parameters: { at: new Date(0) } },
        { file: 'main.ts', parameters: { at: new Date(0) } },
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- Each distinct input must export before the next is compared.
        await loader(options);
      }
      expect(exportModel).toHaveBeenCalledTimes(7);
    } finally {
      await loader.releaseAll();
    }
    await loader({ file: 'main.ts', parameters: { width: 2 } });
    expect(exportModel).toHaveBeenCalledTimes(8);
    exportModel.mockRejectedValueOnce(new Error('export failed'));
    await expect(loader({ file: 'failing.ts' })).rejects.toThrow('export failed');
    await loader({ file: 'failing.ts' });
    expect(exportModel).toHaveBeenCalledTimes(10);
    await loader.releaseAll();
  });

  it('should coalesce only key inputs JSON carries exactly, whatever their key order', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    const nullPrototypeCode = (): Record<string, string> =>
      Object.assign(Object.create(null) as Record<string, string>, { 'main.ts': 'model' });
    const numericCode: unknown = { 'main.ts': 1 };
    try {
      for (const options of [
        { file: 'main.ts', parameters: { limit: Number.POSITIVE_INFINITY } },
        { file: 'main.ts', parameters: { limit: Number.POSITIVE_INFINITY } },
        { file: 'main.ts', parameters: { at: [new Date(0)] } },
        { file: 'main.ts', parameters: { at: [new Date(0)] } },
        { file: 'main.ts', code: numericCode as Record<string, string> },
        { file: 'main.ts', code: numericCode as Record<string, string> },
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- Each uncoalescible input must export before the next.
        await loader(options);
      }
      expect(exportModel).toHaveBeenCalledTimes(6);
      const ordered = await loader({ file: 'main.ts', parameters: { c: 3, a: [1, 'x'], b: { z: null, y: true } } });
      const reordered = await loader({
        file: 'main.ts',
        parameters: { b: { y: true, z: null }, a: [1, 'x'], c: 3, skipped: undefined },
      });
      expect(exportModel).toHaveBeenCalledTimes(7);
      expect(ordered.load).not.toHaveProperty('reused');
      expect(reordered.load).toMatchObject({ reused: true });
      await loader({ file: 'main.ts', code: nullPrototypeCode() });
      const sharedCode = await loader({ file: 'main.ts', code: nullPrototypeCode() });
      expect(exportModel).toHaveBeenCalledTimes(8);
      expect(sharedCode.load).toMatchObject({ reused: true });
      await expect(loader({ file: 'main.ts', unit: 'mm' } as GeoSpecNativeLoadModelOptions)).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'GEOSPEC_NATIVE_RUNTIME_FRAME_OVERRIDE' })],
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it('should treat a missing dependency as part of the closure and never reuse an unrevisioned export', async () => {
    const { engine } = fixtureEngine();
    const fixture = fixtureExporter();
    fixture.files['extra.ts'] = 'missing';
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [fixture.exporter] });
    try {
      await loader({ file: 'main.ts' });
      await loader({ file: 'main.ts' });
      expect(fixture.exportModel).toHaveBeenCalledOnce();
      fixture.files['extra.ts'] = digest('c');
      await loader({ file: 'main.ts' });
      expect(fixture.exportModel).toHaveBeenCalledTimes(2);
    } finally {
      await loader.releaseAll();
    }
    const unrevisioned = fixtureExporter();
    unrevisioned.exportModel.mockImplementation(async (request) => ({
      bytes: Uint8Array.of(9),
      format: request.format,
    }));
    const scoped = createGeoSpecNativeModelLoader({ engine, exporters: [unrevisioned.exporter] });
    try {
      const first = await scoped({ file: 'main.ts' });
      await scoped({ file: 'main.ts' });
      expect(first.load).toMatchObject({ status: 'unavailable' });
      expect(unrevisioned.exportModel).toHaveBeenCalledTimes(2);
      expect(unrevisioned.revision).not.toHaveBeenCalled();
    } finally {
      await scoped.releaseAll();
    }
  });

  it('should load afresh once every owner released the earlier admission', async () => {
    const { engine, released } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    const lease = (subject: Awaited<ReturnType<typeof loader>>) => {
      const facade = bindGeoSpecSubject({
        client: createGeoSpecAssertionClient({ engine }),
        engine,
        identity: subject,
        isLive: () => true,
        ensureResident: rawSubjectResidency(subject)!,
      });
      return resolveGeoSpecSubject(facade).lease!;
    };
    try {
      const options = {
        file: 'main.ts',
        code: { 'main.ts': 'model' },
      } as const;
      const first = await loader(options);
      const reused = await loader(options);
      expect(exportModel).toHaveBeenCalledOnce();
      lease(first).dispose();
      expect(released).toEqual([]);
      lease(reused).dispose();
      expect(released).toEqual(['7']);
      const fresh = await loader(options);
      expect(exportModel).toHaveBeenCalledTimes(2);
      expect(fresh.load).not.toHaveProperty('reused');
    } finally {
      await loader.releaseAll();
    }
  });
});

describe('native model loader work-unit budget', () => {
  it('should record a bounded loadModel budget per load and refuse an unbounded one before export', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [exporter],
      readSource: async () => Uint8Array.of(3),
    });
    try {
      const first = await loader({
        file: 'main.ts',
        workUnitLimit: 16_000_000,
      });
      const reused = await loader({
        file: 'main.ts',
        workUnitLimit: 32_000_000,
      });
      const defaulted = await loader({ file: 'main.ts' });
      const direct = await loader({ source: 'part.glb', workUnitLimit: 9 });
      expect(first.load?.workUnitLimit).toBe(16_000_000);
      expect(reused.load).toMatchObject({
        reused: true,
        workUnitLimit: 32_000_000,
      });
      expect(defaulted.load).not.toHaveProperty('workUnitLimit');
      expect(direct.load?.workUnitLimit).toBe(9);
      await Promise.all(
        [0, 1.5, 512_000_001, Number.NaN].map(async (workUnitLimit) => {
          const refusal = loader({ file: 'main.ts', workUnitLimit });
          await expect(refusal).rejects.toMatchObject({
            diagnostics: [{ code: 'GEOSPEC_MODEL_OPTION_INVALID', details: { option: 'workUnitLimit' } }],
          });
          await expect(refusal).rejects.toThrow(
            "loadModel workUnitLimit must be a positive integer no greater than this host's maximum of 512000000",
          );
        }),
      );
      expect(exportModel).toHaveBeenCalledOnce();
    } finally {
      await loader.releaseAll();
    }
  });

  it('should admit a budget above the default maximum when the host raised it', async () => {
    const { engine } = fixtureEngine();
    const { exporter } = fixtureExporter();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [exporter],
      maximumWorkUnitLimit: 2_048_000_000,
    });
    try {
      const raised = await loader({ file: 'main.ts', workUnitLimit: 1_024_000_000 });
      expect(raised.load?.workUnitLimit).toBe(1_024_000_000);
      await expect(loader({ file: 'main.ts', workUnitLimit: 2_048_000_001 })).rejects.toThrow(
        "no greater than this host's maximum of 2048000000",
      );
    } finally {
      await loader.releaseAll();
    }
    expect(() => createGeoSpecNativeModelLoader({ engine, maximumWorkUnitLimit: 0 })).toThrow(
      'GeoSpec maximumWorkUnitLimit must be a positive safe integer',
    );
  });
});

describe('native model loader region crop', () => {
  const region = { min: [0, 0, 0], max: [10, 20, 30] } as const;
  const confirm = (request: GeoSpecModelExportRequest): GeometryDiagnostic[] =>
    request.region === undefined
      ? []
      : [
          { code: 'RUNTIME', severity: 'warning', message: 'Unrelated notice.' },
          { code: 'RUNTIME', severity: 'info', message: 'Unrelated region detail.', details: { region: 'whole' } },
          {
            code: 'RESOURCE_LIMIT',
            severity: 'info',
            message: 'Cropped to the region.',
            details: { region: request.region },
          },
        ];

  it('should crop through a declaring exporter and keep the crop in admission and evidence', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const fixture = fixtureExporter({ diagnostics: confirm });
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [fixture.exporter] });
    try {
      const cropped = await loader({ file: 'main.ts', region });
      const whole = await loader({ file: 'main.ts' });
      const again = await loader({
        file: 'main.ts',
        region: { min: [0, 0, 0], max: [10, 20, 30] },
      });
      expect(fixture.exportModel).toHaveBeenCalledTimes(2);
      expect(fixture.exportModel.mock.calls[0]?.[0]).toStrictEqual({ file: 'main.ts', format: 'glb', region });
      expect(fixture.exportModel.mock.calls[1]?.[0]).not.toHaveProperty('region');
      expect(cropped.load).toMatchObject({ region, exportOptions: { exporter: 'fixture', region } });
      expect(whole.load).not.toHaveProperty('region');
      expect(whole.load?.exportOptions).toStrictEqual({ exporter: 'fixture' });
      expect(again.load).toMatchObject({ reused: true, region });
      const admission = decodeRequest(ingestSubject.mock.calls[0]![0]);
      expect(admission).toMatchObject({
        diagnostics: [
          { code: 'RUNTIME', message: 'Unrelated notice.' },
          { code: 'RUNTIME', message: 'Unrelated region detail.' },
          {
            code: 'RESOURCE_LIMIT',
            severity: 'info',
            message: 'Cropped to the region.',
          },
        ],
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it("should refuse a crop the exporter does not declare, and keep the exporter's own crop refusal", async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const undeclared = fixtureExporter({ diagnostics: confirm });
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [
        { ...undeclared.exporter, capabilities: { formats: ['glb'], parameters: true, inlineSources: true } },
      ],
    });
    await expect(loader({ file: 'main.ts', region })).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_EXPORTER_UNSUPPORTED',
          details: { exporter: 'fixture', file: 'main.ts', capability: 'region', region },
        }),
      ],
    });
    const refusing = fixtureExporter();
    const refusal: GeometryDiagnostic = {
      code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
      severity: 'error',
      message: "No direct GLB export declares a region option, so GeoSpec cannot crop 'main.ts' before admission.",
    };
    refusing.exportModel.mockRejectedValueOnce(new GeoSpecModelLoadError([refusal]));
    const scoped = createGeoSpecNativeModelLoader({ engine, exporters: [refusing.exporter] });
    await expect(scoped({ file: 'main.ts', region })).rejects.toMatchObject({ diagnostics: [refusal] });
    expect(undeclared.exportModel).not.toHaveBeenCalled();
    expect(refusing.exportModel).toHaveBeenCalledOnce();
    expect(ingestSubject).not.toHaveBeenCalled();
    await loader.releaseAll();
    await scoped.releaseAll();
  });

  it('should refuse a malformed crop, a STEP crop and a direct-source crop before reading anything', async () => {
    const { engine } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter({ diagnostics: confirm });
    const readSource = vi.fn(async () => Uint8Array.of(1));
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [exporter],
      readSource,
    });
    for (const malformed of [
      { min: [0, 0, 0], max: [0, 1, 1] },
      { min: [0, 0], max: [1, 1, 1] },
      { min: [0, 0, 0], max: [1, 1, Number.POSITIVE_INFINITY] },
      { min: [0, 0, 0], max: [1, 1, 1], pad: 1 },
      null,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each malformed crop must refuse before export.
      await expect(
        loader({ file: 'main.ts', region: malformed as unknown as GeoSpecLoadRegion }),
      ).rejects.toMatchObject({
        diagnostics: [{ code: 'GEOSPEC_MODEL_OPTION_INVALID', details: { option: 'region' } }],
      });
    }
    await expect(loader({ file: 'main.ts', format: 'step', region })).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_MODEL_OPTION_UNSUPPORTED',
          details: { option: 'region' },
        }),
      ],
    });
    const directCrop: unknown = { source: 'part.glb', region };
    await expect(loader(directCrop as GeoSpecNativeLoadModelOptions)).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_MODEL_OPTION_UNSUPPORTED',
          details: { option: 'region' },
        }),
      ],
    });
    expect(exportModel).not.toHaveBeenCalled();
    expect(readSource).not.toHaveBeenCalled();
    await loader.releaseAll();
  });
});

class MemoryFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string>();

  public constructor(entries: Record<string, string>) {
    for (const [path, content] of Object.entries(entries)) {
      this.files.set(path, content);
    }
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(): Promise<void> {
    return undefined;
  }
}

describe('run-level load coalescing', () => {
  it('should perform one export and one ingest for two it blocks with identical loads', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const { exporter, exportModel } = fixtureExporter();
    const nativeModelLoader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [exporter],
    });
    try {
      const result = await runGeoSpecModule({
        filesystem: new MemoryFileSystem({
          'spec.geospec.ts': `
            import { describe, it } from 'geospec';
            import { loadModel } from 'geospec/model';
            describe('print layout', () => {
              it('first view', async () => { await loadModel({ file: 'main.ts', parameters: { voxelSize: 0.5 } }); });
              it('second view', async () => { await loadModel({ file: 'main.ts', parameters: { voxelSize: 0.5 } }); });
            });
          `,
        }),
        entryPath: 'spec.geospec.ts',
        nativeAssertions: { engine },
        nativeModelLoader,
      });
      expect(result.success && result.tests.map(({ status }) => status)).toEqual(['passed', 'passed']);
      expect(exportModel).toHaveBeenCalledOnce();
      expect(ingestSubject).toHaveBeenCalledOnce();
      const loads = result.lineage?.loads ?? [];
      expect(loads).toHaveLength(2);
      expect(new Set(loads.map(({ loadId }) => loadId)).size).toBe(2);
      expect(
        loads.map(({ status, evidence }) => ({
          status,
          reused: evidence?.reused,
        })),
      ).toEqual([
        { status: 'complete', reused: undefined },
        { status: 'complete', reused: true },
      ]);
    } finally {
      await nativeModelLoader.releaseAll();
    }
  });
});

describe('region-scoped subjects', () => {
  const confirm = (request: GeoSpecModelExportRequest): GeometryDiagnostic[] =>
    request.region === undefined
      ? []
      : [{ code: 'RESOURCE_LIMIT', severity: 'info', message: 'Cropped.', details: { region: request.region } }];
  const run = async (claims: string) => {
    const { engine } = fixtureEngine();
    const { exporter } = fixtureExporter({ diagnostics: confirm });
    const nativeModelLoader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    try {
      const result = await runGeoSpecModule({
        filesystem: new MemoryFileSystem({
          'spec.geospec.ts': `
            import { expectGeo, it } from 'geospec';
            import { loadModel } from 'geospec/model';
            const region = { min: [0, 0, 0], max: [10, 10, 10] };
            ${claims}
          `,
        }),
        entryPath: 'spec.geospec.ts',
        nativeAssertions: { engine },
        nativeModelLoader,
      });
      return result;
    } finally {
      await nativeModelLoader.releaseAll();
    }
  };

  it('should refuse whole-model claims on a crop with a typed scope diagnostic, under either polarity', async () => {
    const result = await run(`
      it('components', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).toHaveConnectedComponents(1); });
      it('no components', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).not.toHaveConnectedComponents(2); });
      it('interference', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).toHaveNoComponentInterference(); });
      it('watertight', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).toBeWatertight(); });
      it('occurrences', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).toHaveAssemblyOccurrences({ total: 3 }); });
    `);
    expect(result.success).toBe(true);
    const tests = result.success ? result.tests : [];
    expect(tests).toHaveLength(5);
    for (const test of tests) {
      expect(test.status).toBe('failed');
      expect(test.assertions).toHaveLength(1);
      expect(test.assertions[0]).toMatchObject({
        passed: false,
        region: { min: [0, 0, 0], max: [10, 10, 10] },
        diagnostics: [
          { code: 'GEOSPEC_REGION_WHOLE_MODEL_CLAIM', details: { region: { min: [0, 0, 0], max: [10, 10, 10] } } },
        ],
      });
      expect(test.assertions[0]?.report).toBeUndefined();
    }
  });

  it('should evaluate region measurements with the region recorded, and whole-model claims on a whole load', async () => {
    const result = await run(`
      it('volume', async () => { expectGeo(await loadModel({ file: 'main.ts', region })).toHaveVolume({ min: 1, max: 2 }); });
      it('components', async () => { expectGeo(await loadModel({ file: 'main.ts' })).toHaveConnectedComponents(1); });
    `);
    // The fixture engine cannot answer either claim; what matters is that neither is refused for scope.
    const [volume, components] = result.success ? result.tests : [];
    expect(volume?.assertions[0]).toMatchObject({ kind: 'volume', region: { min: [0, 0, 0], max: [10, 10, 10] } });
    expect(
      volume?.assertions[0]?.diagnostics?.some(({ code }) => code === 'GEOSPEC_REGION_WHOLE_MODEL_CLAIM'),
    ).not.toBe(true);
    expect(components?.assertions[0]?.kind).toBe('connectedComponents');
    expect(components?.assertions[0]).not.toHaveProperty('region');
    expect(
      components?.assertions[0]?.diagnostics?.some(({ code }) => code === 'GEOSPEC_REGION_WHOLE_MODEL_CLAIM'),
    ).not.toBe(true);
  });
});
