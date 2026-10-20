import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { GeoSpecModelLoadError } from 'geospec/model';
import type { GeoSpecModelExportRequest } from 'geospec/model';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { KernelIssue, SourceRevision } from '@taucad/runtime/types';

import { tauClientExporter } from '#geospec/tau-client-exporter.js';
import type { TauExporterClient } from '#geospec/tau-client-exporter.js';
import type { GeoSpecExportRoute } from '#geospec/tau-export-intent.js';

type RuntimeDocument = ReturnType<TauExporterClient['open']>;
type ExportResult = Awaited<ReturnType<RuntimeDocument['export']>>;
type OpenInput = Parameters<TauExporterClient['open']>[0];
type SnapshotSource = NonNullable<TauExporterClient['snapshotSource']>;
type SnapshotResult = Awaited<ReturnType<SnapshotSource>>;
type Description = Awaited<ReturnType<NonNullable<TauExporterClient['describe']>>>;

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decodeRequest = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

// SAFETY: the fixture constructs an exact 64-hex SHA-256 digest for source revision identity.
const digest = (fill: string): Exclude<SourceRevision['files'][string], 'missing'> =>
  `sha256:${fill.repeat(64)}` as Exclude<SourceRevision['files'][string], 'missing'>;

const description = (kernelId: string | undefined): Description => ({ success: false, kernelId, issues: [] });

/** One engine whose subject identity is the first primary byte, with release accounting. */
const fixtureEngine = () => {
  const released: string[] = [];
  const ingestSubject = vi.fn(
    (
      _request: Uint8Array<ArrayBuffer>,
      primary: Uint8Array<ArrayBuffer>,
      _resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    ) => encode({ result: { subject: { subjectHash: String(primary[0]).repeat(64) } } }),
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
      encode({ result: { subjectHandle: { subjectHash: decodeRequest(request)['subjectHash'], generation: 1 } } }),
    releaseSubject: (request) => {
      const handle = decodeRequest(request)['subjectHandle'] as { subjectHash: string };
      released.push(handle.subjectHash[0]!);
      return encode({ result: {} });
    },
  };
  return { engine, ingestSubject, released };
};

/** A file-backed Runtime client whose export revision and snapshot follow the mutable source digests. */
const fixtureClient = (
  options: {
    snapshot?: boolean;
    issues?: (exportOptions: unknown) => KernelIssue[];
  } = {},
) => {
  const files: Record<string, SourceRevision['files'][string]> = {
    'main.ts': digest('a'),
    'part.ts': digest('b'),
  };
  const byte = { value: 7 };
  const exportModel = vi.fn(
    async (format: string, request?: { readonly options?: unknown }): Promise<ExportResult> => ({
      success: true,
      exportId: format,
      evaluationId: 'evaluation-1',
      issues: options.issues?.(request?.options) ?? [],
      sourceRevision: { entry: 'main.ts', files: { ...files } },
      files: [{ name: `model.${format}`, mimeType: 'model/gltf-binary', bytes: Uint8Array.of(byte.value) }],
    }),
  );
  const closeDocument = vi.fn();
  // SAFETY: the fake document implements only the export and close the exporter calls.
  const document = { export: exportModel, close: closeDocument } as unknown as RuntimeDocument;
  const snapshotSource = vi.fn<SnapshotSource>(
    async (): Promise<SnapshotResult> => ({
      success: true,
      data: { entryPath: 'main.ts', files: [], unresolvedPaths: [], kernelId: 'fixture' },
      issues: [],
      sourceRevision: { entry: 'main.ts', files: { ...files } },
    }),
  );
  const open = vi.fn((_input: OpenInput) => document);
  const client: TauExporterClient = {
    connect: vi.fn(async () => undefined),
    terminate: vi.fn(),
    open,
    ...(options.snapshot === false ? {} : { snapshotSource }),
  };
  return { client, exportModel, closeDocument, open, snapshotSource, files, byte };
};

const request = (overrides: Partial<GeoSpecModelExportRequest> = {}): GeoSpecModelExportRequest => ({
  file: 'main.ts',
  format: 'glb',
  ...overrides,
});

const diagnosticsOf = async (pending: Promise<unknown>) => {
  const error: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(GeoSpecModelLoadError);
  return (error as GeoSpecModelLoadError).diagnostics;
};

describe('tauClientExporter claims', () => {
  it("should claim the extensions the client's kernels declare, without the catch-all", async () => {
    const { client } = fixtureClient();
    const exporter = await tauClientExporter({
      client: {
        ...client,
        capabilities: {
          registrations: [
            { kind: 'kernel', extensions: ['ts', '.scad', '*'] },
            { kind: 'kernel', extensions: ['kcl', 'ts'] },
            { kind: 'kernel' },
            { kind: 'transcoder', extensions: ['stl'] },
          ],
        },
      },
    });

    expect(exporter.id).toBe('tau');
    expect(exporter.extensions).toStrictEqual(['ts', 'scad', 'kcl']);
    expect(exporter.capabilities).toStrictEqual({
      formats: ['glb', 'step'],
      parameters: true,
      region: true,
      inlineSources: true,
    });
    expect(client.connect).toHaveBeenCalledOnce();
  });

  it('should keep explicit extensions and id, and refuse a client that reports no kernels without them', async () => {
    const { client } = fixtureClient();
    const exporter = await tauClientExporter({ client, extensions: ['py'], id: 'tau-python' });

    expect(exporter).toMatchObject({ id: 'tau-python', extensions: ['py'] });
    await expect(tauClientExporter({ client })).rejects.toThrow(
      new TypeError('tauClientExporter needs a client that reports its kernels, or explicit extensions.'),
    );
  });

  it('should accept a connected Tau RuntimeClient', () => {
    expectTypeOf<RuntimeClient>().toExtend<TauExporterClient>();
  });
});

describe('tauClientExporter client lifetime', () => {
  it('should create a lazy client once per scope, shut it down on close, and create another after', async () => {
    const created: Array<ReturnType<typeof fixtureClient> & { shutdown: () => Promise<void> }> = [];
    const factory = vi.fn(async () => {
      const fixture = { ...fixtureClient(), shutdown: vi.fn(async () => undefined) };
      created.push(fixture);
      return { ...fixture.client, shutdown: fixture.shutdown };
    });
    const exporter = await tauClientExporter({ client: factory, extensions: ['ts'] });

    expect(factory).not.toHaveBeenCalled();
    await exporter.close?.();
    await exporter.export(request());
    await exporter.export(request());
    expect(factory).toHaveBeenCalledOnce();
    expect(created[0]?.client.connect).toHaveBeenCalledOnce();
    expect(created[0]?.exportModel).toHaveBeenCalledTimes(2);

    await exporter.close?.();
    expect(created[0]?.shutdown).toHaveBeenCalledOnce();
    expect(created[0]?.client.terminate).not.toHaveBeenCalled();

    await exporter.export(request());
    expect(factory).toHaveBeenCalledTimes(2);
    expect(created[1]?.exportModel).toHaveBeenCalledOnce();
    await exporter.close?.();
    await exporter.close?.();
    expect(created[1]?.shutdown).toHaveBeenCalledOnce();
    expect(created[0]?.shutdown).toHaveBeenCalledOnce();
  });

  it('should shut down a lazy client whose connect fails and start a fresh one on the next export', async () => {
    const first = { ...fixtureClient(), shutdown: vi.fn(async () => undefined) };
    vi.mocked(first.client.connect).mockRejectedValueOnce(new Error('worker failed to start'));
    const second = fixtureClient();
    const factory = vi
      .fn<() => Promise<TauExporterClient>>()
      .mockResolvedValueOnce({ ...first.client, shutdown: first.shutdown })
      .mockResolvedValueOnce(second.client);
    const exporter = await tauClientExporter({ client: factory, extensions: ['ts'] });

    await expect(exporter.export(request())).rejects.toThrow('worker failed to start');
    expect(first.shutdown).toHaveBeenCalledOnce();

    await exporter.export(request());
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second.exportModel).toHaveBeenCalledOnce();
    await exporter.close?.();
    expect(second.client.terminate).toHaveBeenCalledOnce();
  });

  it('should close cleanly after a lazy client that never started', async () => {
    const factory = vi.fn(async () => {
      throw new Error('no worker');
    });
    const exporter = await tauClientExporter({ client: factory, extensions: ['ts'] });

    await expect(exporter.export(request())).rejects.toThrow('no worker');
    await expect(exporter.close?.()).resolves.toBeUndefined();
  });

  it('should terminate a lazy client that has no shutdown', async () => {
    const { client } = fixtureClient();
    const exporter = await tauClientExporter({ client: async () => client, extensions: ['ts'] });

    await exporter.export(request());
    await exporter.close?.();

    expect(client.terminate).toHaveBeenCalledOnce();
  });

  it('should never shut down or terminate a host-owned client', async () => {
    const { client } = fixtureClient();
    const shutdown = vi.fn(async () => undefined);
    const exporter = await tauClientExporter({ client: { ...client, shutdown }, extensions: ['ts'] });

    await exporter.export(request());
    await exporter.close?.();
    await exporter.export(request());
    await exporter.close?.();

    expect(shutdown).not.toHaveBeenCalled();
    expect(client.terminate).not.toHaveBeenCalled();
  });

  it('should keep releaseAll pending until an owned client shutdown settles, and report a failed one', async () => {
    const { engine } = fixtureEngine();
    const closed = Promise.withResolvers<void>();
    const fixture = fixtureClient();
    const shutdown = vi.fn(async () => closed.promise);
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [
        await tauClientExporter({ client: async () => ({ ...fixture.client, shutdown }), extensions: ['ts'] }),
      ],
    });
    await loader({ code: { 'main.ts': 'model' }, file: 'main.ts', format: 'glb' });

    const cleanup = loader.releaseAll();
    await vi.waitFor(() => {
      expect(shutdown).toHaveBeenCalledOnce();
    });
    const pending = Symbol('pending');
    await expect(Promise.race([cleanup, Promise.resolve(pending)])).resolves.toBe(pending);
    closed.resolve();
    await expect(cleanup).resolves.toBeUndefined();
    expect(fixture.client.terminate).not.toHaveBeenCalled();

    const shutdownFailure = new Error('shutdown failed');
    const failing = createGeoSpecNativeModelLoader({
      engine,
      exporters: [
        await tauClientExporter({
          client: async () => ({
            ...fixtureClient().client,
            shutdown: async () => {
              throw shutdownFailure;
            },
          }),
          extensions: ['ts'],
        }),
      ],
    });
    const loaded = await failing({ code: { 'main.ts': 'model A' }, file: 'main.ts', format: 'glb' });
    expect(loaded.load?.artifacts).toMatchObject([{ name: 'model.glb', byteLength: 1 }]);
    await expect(failing.releaseAll()).rejects.toMatchObject({
      message: 'Native GeoSpec model cleanup failed.',
      errors: [shutdownFailure],
    });
  });
});

describe('tauClientExporter export', () => {
  it('should open, export and close once per load with watch off, and return canonical millimetre bytes', async () => {
    const fixture = fixtureClient();
    const resource = Uint8Array.of(3);
    fixture.exportModel.mockImplementationOnce(async () => ({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      issues: [{ code: 'RUNTIME', severity: 'warning', message: 'Model warning', type: 'runtime' }],
      sourceRevision: { entry: 'main.ts', files: { 'main.ts': digest('a'), 'part.ts': 'missing' } },
      files: [
        { name: 'model.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.of(2) },
        { name: 'model.bin', mimeType: 'application/octet-stream', bytes: resource },
      ],
    }));
    const exporter = await tauClientExporter({ client: fixture.client, extensions: ['ts'] });

    const artifact = await exporter.export(
      request({ parameters: { width: 2 }, mesh: { linearTolerance: 0.1, angularToleranceDegrees: 30 } }),
    );

    expect(fixture.open).toHaveBeenCalledOnce();
    expect(fixture.open).toHaveBeenCalledWith({
      source: { path: 'main.ts' },
      parameters: { width: 2 },
      watch: false,
    });
    expect(fixture.exportModel).toHaveBeenCalledOnce();
    expect(fixture.exportModel).toHaveBeenCalledWith('glb', {
      options: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        tessellation: { linearTolerance: 0.1, angularTolerance: 30 },
      },
    });
    expect(fixture.closeDocument).toHaveBeenCalledOnce();
    expect(artifact).toStrictEqual({
      bytes: Uint8Array.of(2),
      format: 'glb',
      sourceUnit: 'mm',
      resources: [{ name: 'model.bin', bytes: resource }],
      consumedSources: [
        { path: 'main.ts', sha256: digest('a') },
        { path: 'part.ts', sha256: 'missing' },
      ],
      diagnostics: [
        {
          code: 'RUNTIME',
          severity: 'warning',
          message: 'Model warning',
          suggestion: 'Fix the model source or its Runtime export route, then retry the native run.',
        },
      ],
      exportOptions: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        tessellation: { linearTolerance: 0.1, angularTolerance: 30 },
      },
    });
    expect(artifact.resources?.[0]?.bytes).toBe(resource);
  });

  it('should open inline sources as files with their entry, and close the document when export throws', async () => {
    const fixture = fixtureClient();
    fixture.exportModel.mockRejectedValueOnce(new Error('export failed'));
    const exporter = await tauClientExporter({ client: fixture.client, extensions: ['ts'] });

    await expect(exporter.export(request({ inline: { 'main.ts': 'model B', 'part.ts': 'part' } }))).rejects.toThrow(
      'export failed',
    );

    expect(fixture.open).toHaveBeenCalledWith({
      source: { files: { 'main.ts': 'model B', 'part.ts': 'part' }, entry: 'main.ts' },
      watch: false,
    });
    expect(fixture.closeDocument).toHaveBeenCalledOnce();
  });

  it('should admit successful Runtime issues into the compiled subject', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const fixture = fixtureClient({
      issues: () => [{ code: 'RUNTIME', severity: 'warning', message: 'Model warning', type: 'runtime' }],
    });
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [await tauClientExporter({ client: fixture.client, extensions: ['ts'] })],
    });
    try {
      const subject = await loader({ file: 'main.ts' });
      expect(decodeRequest(ingestSubject.mock.calls[0]![0])).toMatchObject({
        diagnostics: [{ code: 'RUNTIME', severity: 'warning', message: 'Model warning' }],
      });
      expect(subject.load).toMatchObject({
        status: 'complete',
        exportOptions: {
          exporter: 'tau',
          options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        },
        sourceRevision: { entry: 'main.ts', files: { 'main.ts': digest('a'), 'part.ts': digest('b') } },
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it("should refuse a failed export with the Runtime's issues, and an empty one with a typed diagnostic", async () => {
    const fixture = fixtureClient();
    fixture.exportModel
      .mockResolvedValueOnce({
        success: false,
        issues: [{ code: 'RUNTIME', severity: 'error', message: 'Kernel failed.', type: 'runtime' }],
      })
      .mockResolvedValueOnce({
        success: true,
        exportId: 'glb',
        evaluationId: 'evaluation-1',
        issues: [],
        // SAFETY: the Runtime type promises a file, but the exporter still refuses a response without one.
        files: [] as unknown as Extract<ExportResult, { success: true }>['files'],
      });
    const exporter = await tauClientExporter({ client: fixture.client, extensions: ['ts'] });

    expect(await diagnosticsOf(exporter.export(request()))).toStrictEqual([
      {
        code: 'RUNTIME',
        severity: 'error',
        message: 'Kernel failed.',
        suggestion: 'Fix the model source or its Runtime export route, then retry the native run.',
      },
    ]);
    expect(await diagnosticsOf(exporter.export(request()))).toStrictEqual([
      expect.objectContaining({
        code: 'GEOSPEC_NATIVE_MODEL_EXPORT_EMPTY',
        severity: 'error',
        details: { file: 'main.ts', format: 'glb' },
      }),
    ]);
    expect(fixture.closeDocument).toHaveBeenCalledTimes(2);
  });

  it('should refuse a route that cannot give canonical evidence before opening the source', async () => {
    const fixture = fixtureClient();
    const client = Object.assign(fixture.client, {
      bestRouteFor: vi.fn(() => ({
        kernelId: 'legacy',
        targetFormat: 'glb',
        exportOptions: { schema: { properties: { coordinateSystem: {} } }, defaults: {} },
      })),
    });
    const exporter = await tauClientExporter({ client, extensions: ['ts'] });

    expect(await diagnosticsOf(exporter.export(request()))).toMatchObject([
      { code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED', details: { format: 'glb', missing: ['unit'] } },
    ]);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should name the root when the file is missing, and keep the Runtime's own issues otherwise", async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const notFound = (): Error => Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    const runtimeIssue = { code: 'RUNTIME', message: "ENOENT: no such file or directory, open '/work/x'" } as const;
    const missingClient = () => {
      const fixture = fixtureClient();
      fixture.exportModel.mockResolvedValue({
        success: false,
        issues: [{ ...runtimeIssue, severity: 'error', type: 'runtime' }],
      });
      return fixture;
    };
    const missing = missingClient();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [await tauClientExporter({ client: missing.client, extensions: ['ts'] })],
      readSource: async () => {
        throw notFound();
      },
      projectPath: '/work',
    });
    try {
      await expect(loader({ file: 'main.ts', rootDir: 'parts/gear' })).rejects.toMatchObject({
        diagnostics: [
          {
            code: 'GEOSPEC_MODEL_SOURCE_NOT_FOUND',
            details: { path: 'parts/gear/main.ts', rootDir: 'parts/gear', projectRoot: '/work' },
          },
        ],
      });
      expect(missing.open.mock.calls.map(([input]) => input.source)).toEqual([{ path: 'parts/gear/main.ts' }]);
    } finally {
      await loader.releaseAll();
    }
    const present = createGeoSpecNativeModelLoader({
      engine,
      exporters: [await tauClientExporter({ client: missingClient().client, extensions: ['ts'] })],
      readSource: async () => Uint8Array.of(1),
      projectPath: '/work',
    });
    try {
      await expect(present({ file: 'main.ts' })).rejects.toMatchObject({ diagnostics: [runtimeIssue] });
    } finally {
      await present.releaseAll();
    }
    expect(ingestSubject).not.toHaveBeenCalled();
  });
});

describe('tauClientExporter source revision', () => {
  it('should reuse an identical file load while its snapshot revision is unchanged', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const fixture = fixtureClient();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [await tauClientExporter({ client: fixture.client, extensions: ['ts'] })],
    });
    try {
      const first = await loader({ file: 'main.ts', parameters: { width: 2 } });
      const second = await loader({ file: 'main.ts', parameters: { width: 2 } });
      expect(fixture.exportModel).toHaveBeenCalledOnce();
      expect(fixture.open).toHaveBeenCalledOnce();
      expect(ingestSubject).toHaveBeenCalledOnce();
      expect(fixture.snapshotSource).toHaveBeenCalledWith({ source: { path: 'main.ts' } });
      expect(second).toMatchObject({ subjectHash: first.subjectHash, load: { reused: true } });
      fixture.files['part.ts'] = digest('c');
      const edited = await loader({ file: 'main.ts', parameters: { width: 2 } });
      expect(fixture.exportModel).toHaveBeenCalledTimes(2);
      expect(edited.load).not.toHaveProperty('reused');
    } finally {
      await loader.releaseAll();
    }
  });

  it('should derive the revision from snapshot files when the snapshot carries none', async () => {
    const fixture = fixtureClient();
    fixture.snapshotSource.mockResolvedValue({
      success: true,
      data: {
        entryPath: 'main.ts',
        files: [
          { path: 'main.ts', content: Uint8Array.of(1), sha256: 'a'.repeat(64), role: 'entry' },
          { path: 'part.ts', content: Uint8Array.of(2), sha256: 'b'.repeat(64), role: 'kernel-dependency' },
        ],
        unresolvedPaths: [],
        kernelId: 'fixture',
      },
      issues: [],
    });
    const exporter = await tauClientExporter({ client: fixture.client, extensions: ['ts'] });
    expect(await exporter.revision?.({ file: 'main.ts' })).toStrictEqual([
      { path: 'main.ts', sha256: 'a'.repeat(64) },
      { path: 'part.ts', sha256: 'b'.repeat(64) },
    ]);

    const { engine } = fixtureEngine();
    const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
    try {
      await loader({ file: 'main.ts' });
      await loader({ file: 'main.ts' });
      expect(fixture.exportModel).toHaveBeenCalledOnce();
    } finally {
      await loader.releaseAll();
    }
  });

  it('should report no revision for a failed snapshot or a client without snapshots, so loads export afresh', async () => {
    const failed = fixtureClient();
    failed.snapshotSource.mockResolvedValue({ success: false, issues: [] });
    const unverifiable = fixtureClient({ snapshot: false });
    const { engine } = fixtureEngine();
    for (const fixture of [failed, unverifiable]) {
      // oxlint-disable-next-line no-await-in-loop -- each client gets its own exporter and scope.
      const exporter = await tauClientExporter({ client: fixture.client, extensions: ['ts'] });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      expect(await exporter.revision?.({ file: 'main.ts' })).toBeUndefined();
      const loader = createGeoSpecNativeModelLoader({ engine, exporters: [exporter] });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await loader({ file: 'main.ts' });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await loader({ file: 'main.ts' });
      expect(fixture.exportModel).toHaveBeenCalledTimes(2);
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await loader.releaseAll();
    }
  });
});

describe('tauClientExporter region crop', () => {
  const region = { min: [0, 0, 0], max: [10, 20, 30] } as const;
  const regionRoute: GeoSpecExportRoute = {
    kernelId: 'picovoxel',
    targetFormat: 'glb',
    exportOptions: {
      schema: { properties: { coordinateSystem: {}, unit: {}, region: {} } },
      defaults: {},
    },
  };
  const confirm = (exportOptions: unknown): KernelIssue[] => {
    const requested =
      exportOptions !== null && typeof exportOptions === 'object' && 'region' in exportOptions
        ? exportOptions.region
        : undefined;
    return requested === undefined
      ? []
      : [
          { code: 'RUNTIME', severity: 'warning', message: 'Unrelated notice.', type: 'runtime' },
          {
            code: 'RUNTIME',
            severity: 'info',
            message: 'Unrelated region detail.',
            type: 'runtime',
            details: { region: 'whole' },
          },
          {
            code: 'RESOURCE_LIMIT',
            severity: 'info',
            message: 'Cropped to the region.',
            type: 'runtime',
            details: { region: requested },
          },
        ];
  };

  it('should crop through a declaring direct route and keep the crop in admission and evidence', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const fixture = fixtureClient({ issues: confirm });
    const client = Object.assign(fixture.client, { bestRouteFor: vi.fn(() => regionRoute) });
    const loader = createGeoSpecNativeModelLoader({
      engine,
      exporters: [await tauClientExporter({ client, extensions: ['ts'] })],
    });
    try {
      const cropped = await loader({ file: 'main.ts', region });
      const whole = await loader({ file: 'main.ts' });
      expect(fixture.exportModel).toHaveBeenCalledTimes(2);
      expect(fixture.exportModel.mock.calls[0]?.[1]).toStrictEqual({
        options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' }, region },
      });
      expect(fixture.exportModel.mock.calls[1]?.[1]?.options).not.toHaveProperty('region');
      expect(cropped.load).toMatchObject({
        region,
        exportOptions: {
          exporter: 'tau',
          region,
          options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' }, region },
        },
      });
      expect(whole.load).not.toHaveProperty('region');
      expect(decodeRequest(ingestSubject.mock.calls[0]![0])).toMatchObject({
        diagnostics: [
          { code: 'RUNTIME', message: 'Unrelated notice.' },
          { code: 'RUNTIME', message: 'Unrelated region detail.' },
          { code: 'RESOURCE_LIMIT', severity: 'info', message: 'Cropped to the region.' },
        ],
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it('should admit a crop when any direct route declares it, even when a B-rep route ranks first', async () => {
    const fixture = fixtureClient({ issues: confirm });
    const brepRoute: GeoSpecExportRoute = {
      kernelId: 'replicad',
      targetFormat: 'glb',
      fidelity: 'brep',
      exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } }, defaults: {} },
    };
    const routesFor = vi.fn(() => [brepRoute, { ...regionRoute, transcoderId: 'mesh' }, regionRoute]);
    const exporter = await tauClientExporter({
      client: Object.assign(fixture.client, { routesFor, bestRouteFor: () => brepRoute }),
      extensions: ['ts'],
    });
    await expect(exporter.export(request({ region }))).resolves.toMatchObject({ format: 'glb' });
    expect(routesFor).toHaveBeenCalledWith('glb');

    const refusing = fixtureClient({ issues: confirm });
    const refusingExporter = await tauClientExporter({
      client: Object.assign(refusing.client, {
        routesFor: () => [brepRoute, { ...brepRoute }, { targetFormat: 'glb' }],
      }),
      extensions: ['ts'],
    });
    expect(await diagnosticsOf(refusingExporter.export(request({ region })))).toStrictEqual([
      expect.objectContaining({
        code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
        message:
          "No direct GLB export of this Runtime (replicad) declares a region option, so GeoSpec cannot crop 'main.ts' before admission.",
        details: { file: 'main.ts', format: 'glb', region, kernelIds: ['replicad'] },
      }),
    ]);
    expect(refusing.open).not.toHaveBeenCalled();
  });

  it('should refuse a crop no route declares, a route that transcodes, or an export that does not confirm it', async () => {
    const routeless = fixtureClient({ issues: confirm });
    const routelessExporter = await tauClientExporter({ client: routeless.client, extensions: ['ts'] });
    expect(await diagnosticsOf(routelessExporter.export(request({ region })))).toStrictEqual([
      expect.objectContaining({
        code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
        details: { file: 'main.ts', format: 'glb', region, kernelIds: [] },
      }),
    ]);
    for (const route of [
      { ...regionRoute, exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } } } },
      { ...regionRoute, transcoderId: 'mesh' },
    ]) {
      const fixture = fixtureClient({ issues: confirm });
      // oxlint-disable-next-line no-await-in-loop -- Each route must refuse before export.
      const exporter = await tauClientExporter({
        client: Object.assign(fixture.client, { bestRouteFor: () => route }),
        extensions: ['ts'],
      });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      expect(await diagnosticsOf(exporter.export(request({ region })))).toMatchObject([
        { code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED', details: { kernelIds: ['picovoxel'] } },
      ]);
      expect(fixture.exportModel).not.toHaveBeenCalled();
    }
    const silent = fixtureClient();
    const silentExporter = await tauClientExporter({
      client: Object.assign(silent.client, { bestRouteFor: () => regionRoute }),
      extensions: ['ts'],
    });
    expect(await diagnosticsOf(silentExporter.export(request({ region })))).toStrictEqual([
      expect.objectContaining({
        code: 'GEOSPEC_MODEL_REGION_NOT_HONORED',
        details: { file: 'main.ts', format: 'glb', region },
      }),
    ]);
    expect(silent.exportModel).toHaveBeenCalledOnce();
    expect(routeless.exportModel).not.toHaveBeenCalled();
  });
});

describe('tauClientExporter kernel description', () => {
  const brepStep: GeoSpecExportRoute = {
    kernelId: 'replicad',
    targetFormat: 'step',
    fidelity: 'brep',
    exportOptions: { schema: { properties: { coordinateSystem: {} } }, defaults: {} },
  };
  const voxelStep: GeoSpecExportRoute = {
    kernelId: 'picovoxel',
    targetFormat: 'step',
    transcoderId: 'mesh-to-step',
    fidelity: 'mesh',
  };
  const routedClient = (describe: NonNullable<TauExporterClient['describe']> | undefined) => {
    const fixture = fixtureClient();
    const bestRouteFor = vi.fn((_format: string, options?: { kernelId?: string }) =>
      options?.kernelId === 'picovoxel' ? voxelStep : brepStep,
    );
    const client = Object.assign(fixture.client, {
      bestRouteFor,
      routesFor: () => [brepStep, voxelStep],
      ...(describe === undefined ? {} : { describe }),
    });
    return { ...fixture, client, bestRouteFor };
  };

  it('should pick STEP routes among the described kernel and refuse a mesh-only kernel before export', async () => {
    const describe = vi.fn(async () => description('picovoxel'));
    const { client, exportModel, bestRouteFor } = routedClient(describe);
    const exporter = await tauClientExporter({ client, extensions: ['ts'] });

    expect(await diagnosticsOf(exporter.export(request({ format: 'step' })))).toMatchObject([
      { code: 'GEOSPEC_KERNEL_BREP_UNSUPPORTED', details: { kernelId: 'picovoxel' } },
    ]);
    expect(describe).toHaveBeenCalledWith({ source: { path: 'main.ts' } });
    expect(bestRouteFor).toHaveBeenCalledWith('step', { kernelId: 'picovoxel' });
    expect(exportModel).not.toHaveBeenCalled();
  });

  it('should describe inline sources by their files and entry', async () => {
    const describe = vi.fn(async () => description('replicad'));
    const { client } = routedClient(describe);
    const exporter = await tauClientExporter({ client, extensions: ['ts'] });

    await exporter.export(request({ format: 'step', inline: { 'main.ts': 'model' } }));

    expect(describe).toHaveBeenCalledWith({ source: { files: { 'main.ts': 'model' }, entry: 'main.ts' } });
  });

  it('should keep the runtime-wide route when the Runtime cannot describe the source', async () => {
    for (const describe of [
      undefined,
      vi.fn(async () => {
        throw new Error('describe failed');
      }),
      vi.fn(async () => description(undefined)),
    ]) {
      const { client, exportModel, bestRouteFor } = routedClient(describe);
      // oxlint-disable-next-line no-await-in-loop -- Each Runtime shape exports on its own.
      const exporter = await tauClientExporter({ client, extensions: ['ts'] });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await expect(exporter.export(request({ format: 'step' }))).resolves.toMatchObject({ format: 'step' });
      expect(bestRouteFor).toHaveBeenCalledWith('step');
      expect(exportModel).toHaveBeenCalledOnce();
    }
  });

  it('should admit a region only when the described kernel itself declares the crop', async () => {
    const cropRoute: GeoSpecExportRoute = {
      kernelId: 'picovoxel',
      targetFormat: 'glb',
      exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {}, region: {} } }, defaults: {} },
    };
    const plainRoute: GeoSpecExportRoute = {
      kernelId: 'replicad',
      targetFormat: 'glb',
      exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } }, defaults: {} },
    };
    const fixture = fixtureClient();
    const exporter = await tauClientExporter({
      client: Object.assign(fixture.client, {
        routesFor: () => [plainRoute, cropRoute],
        bestRouteFor: () => plainRoute,
        describe: async () => description('replicad'),
      }),
      extensions: ['ts'],
    });

    expect(await diagnosticsOf(exporter.export(request({ region: { min: [0, 0, 0], max: [1, 1, 1] } })))).toMatchObject(
      [{ code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED', details: { kernelIds: ['replicad'] } }],
    );
    expect(fixture.exportModel).not.toHaveBeenCalled();
  });
});
