import type { VmFileSystem } from '@taucad/esbuild/vm';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeDocument } from '@taucad/runtime/client';
import type { KernelIssue, SourceRevision } from '@taucad/runtime/types';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeLoadModelOptions, GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import type { GeoSpecLoadRegion, GeoSpecRuntimeClient } from '#model/types.js';
import type { GeoSpecExportRoute } from '#model/export-intent.js';
import { rawSubjectResidency, resolveGeoSpecSubject, bindGeoSpecSubject } from '#model/subject.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { runGeoSpecModule } from '#runner/index.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decodeRequest = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

// SAFETY: the fixture constructs an exact 64-hex SHA-256 digest for source revision identity.
const digest = (fill: string): Exclude<SourceRevision['files'][string], 'missing'> =>
  `sha256:${fill.repeat(64)}` as Exclude<SourceRevision['files'][string], 'missing'>;

type SnapshotSource = NonNullable<GeoSpecRuntimeClient['snapshotSource']>;
type SnapshotResult = Awaited<ReturnType<SnapshotSource>>;

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

/** A file-backed Runtime whose export revision and snapshot follow the mutable source digests. */
const fixtureRuntime = (
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
  const document = mock<RuntimeDocument>();
  document.export.mockImplementation(async (_format, request) => ({
    success: true,
    exportId: 'glb',
    evaluationId: 'evaluation-1',
    issues: options.issues?.(request?.options) ?? [],
    sourceRevision: { entry: 'main.ts', files: { ...files } },
    files: [
      {
        name: 'model.glb',
        mimeType: 'model/gltf-binary',
        bytes: Uint8Array.of(byte.value),
      },
    ],
  }));
  const snapshotSource = vi.fn<SnapshotSource>(
    async (): Promise<SnapshotResult> => ({
      success: true,
      data: {
        entryPath: 'main.ts',
        files: [],
        unresolvedPaths: [],
        kernelId: 'fixture',
      },
      issues: [],
      sourceRevision: { entry: 'main.ts', files: { ...files } },
    }),
  );
  const open = vi.fn(() => document);
  const runtime: GeoSpecRuntimeClient = {
    connect: async () => undefined,
    terminate: () => undefined,
    open,
    ...(options.snapshot === false ? {} : { snapshotSource }),
  };
  return { runtime, document, open, snapshotSource, files, byte };
};

describe('native model loader run coalescing', () => {
  it('should export and ingest identical file loads once and record each load as its own reuse', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const { runtime, document, snapshotSource } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    try {
      const first = await loader({
        file: 'main.ts',
        parameters: { width: 2, depth: { value: 1 } },
      });
      const second = await loader({
        file: 'main.ts',
        parameters: { depth: { value: 1 }, width: 2 },
      });
      expect(document.export).toHaveBeenCalledOnce();
      expect(ingestSubject).toHaveBeenCalledOnce();
      expect(snapshotSource).toHaveBeenCalledWith({
        source: { path: 'main.ts' },
      });
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
    const changed = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime: changed.runtime,
    });
    try {
      await loader({ file: 'main.ts' });
      changed.files['part.ts'] = digest('c');
      const edited = await loader({ file: 'main.ts' });
      expect(changed.document.export).toHaveBeenCalledTimes(2);
      expect(edited.load).not.toHaveProperty('reused');
      expect(edited.load?.sourceRevision?.files['part.ts']).toBe(digest('c'));
      changed.snapshotSource.mockResolvedValueOnce({
        success: true,
        data: {
          entryPath: 'main.ts',
          files: [],
          unresolvedPaths: [],
          kernelId: 'fixture',
        },
        issues: [],
        sourceRevision: {
          entry: 'main.ts',
          files: { ...changed.files, 'extra.ts': digest('d') },
        },
      });
      await loader({ file: 'main.ts' });
      changed.snapshotSource.mockRejectedValueOnce(new Error('snapshot unavailable'));
      await loader({ file: 'main.ts' });
      changed.snapshotSource.mockResolvedValueOnce({
        success: false,
        issues: [],
      });
      await loader({ file: 'main.ts' });
      expect(changed.document.export).toHaveBeenCalledTimes(5);
    } finally {
      await loader.releaseAll();
    }
    const unverifiable = fixtureRuntime({ snapshot: false });
    const second = createGeoSpecNativeModelLoader({
      engine,
      runtime: unverifiable.runtime,
    });
    try {
      await second({ file: 'main.ts' });
      await second({ file: 'main.ts' });
      expect(unverifiable.document.export).toHaveBeenCalledTimes(2);
    } finally {
      await second.releaseAll();
    }
    expect(ingestSubject).toHaveBeenCalledTimes(7);
  });

  it('should compare digests derived from snapshot files when the snapshot carries no revision', async () => {
    const { engine } = fixtureEngine();
    const { runtime, document, snapshotSource } = fixtureRuntime();
    snapshotSource.mockResolvedValue({
      success: true,
      data: {
        entryPath: 'main.ts',
        files: [
          {
            path: 'main.ts',
            content: Uint8Array.of(1),
            sha256: 'a'.repeat(64),
            role: 'entry',
          },
          {
            path: 'part.ts',
            content: Uint8Array.of(2),
            sha256: 'b'.repeat(64),
            role: 'kernel-dependency',
          },
        ],
        unresolvedPaths: [],
        kernelId: 'fixture',
      },
      issues: [],
    });
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    try {
      await loader({ file: 'main.ts' });
      await loader({ file: 'main.ts' });
      expect(document.export).toHaveBeenCalledOnce();
    } finally {
      await loader.releaseAll();
    }
  });

  it('should key on every export and admission input and never reuse a failure or a released scope', async () => {
    const { engine } = fixtureEngine();
    const { runtime, document } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
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
      expect(document.export).toHaveBeenCalledTimes(7);
    } finally {
      await loader.releaseAll();
    }
    await loader({ file: 'main.ts', parameters: { width: 2 } });
    expect(document.export).toHaveBeenCalledTimes(8);
    document.export.mockRejectedValueOnce(new Error('export failed'));
    await expect(loader({ file: 'failing.ts' })).rejects.toThrow('export failed');
    await loader({ file: 'failing.ts' });
    expect(document.export).toHaveBeenCalledTimes(10);
    await loader.releaseAll();
  });

  it('should coalesce only key inputs JSON carries exactly, whatever their key order', async () => {
    const { engine } = fixtureEngine();
    const { runtime, document } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
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
      expect(document.export).toHaveBeenCalledTimes(6);
      const ordered = await loader({ file: 'main.ts', parameters: { c: 3, a: [1, 'x'], b: { z: null, y: true } } });
      const reordered = await loader({
        file: 'main.ts',
        parameters: { b: { y: true, z: null }, a: [1, 'x'], c: 3, skipped: undefined },
      });
      expect(document.export).toHaveBeenCalledTimes(7);
      expect(ordered.load).not.toHaveProperty('reused');
      expect(reordered.load).toMatchObject({ reused: true });
      await loader({ file: 'main.ts', code: nullPrototypeCode() });
      const sharedCode = await loader({ file: 'main.ts', code: nullPrototypeCode() });
      expect(document.export).toHaveBeenCalledTimes(8);
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
    const fixture = fixtureRuntime();
    fixture.files['extra.ts'] = 'missing';
    const loader = createGeoSpecNativeModelLoader({ engine, runtime: fixture.runtime });
    try {
      await loader({ file: 'main.ts' });
      await loader({ file: 'main.ts' });
      expect(fixture.document.export).toHaveBeenCalledOnce();
      fixture.files['extra.ts'] = digest('c');
      await loader({ file: 'main.ts' });
      expect(fixture.document.export).toHaveBeenCalledTimes(2);
    } finally {
      await loader.releaseAll();
    }
    const unrevisioned = fixtureRuntime();
    unrevisioned.document.export.mockImplementation(async () => ({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      issues: [],
      files: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.of(9) }],
    }));
    const scoped = createGeoSpecNativeModelLoader({ engine, runtime: unrevisioned.runtime });
    try {
      const first = await scoped({ file: 'main.ts' });
      await scoped({ file: 'main.ts' });
      expect(first.load).toMatchObject({ status: 'unavailable' });
      expect(unrevisioned.document.export).toHaveBeenCalledTimes(2);
      expect(unrevisioned.snapshotSource).not.toHaveBeenCalled();
    } finally {
      await scoped.releaseAll();
    }
  });

  it('should load afresh once every owner released the earlier admission', async () => {
    const { engine, released } = fixtureEngine();
    const { runtime, document } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
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
      expect(document.export).toHaveBeenCalledOnce();
      lease(first).dispose();
      expect(released).toEqual([]);
      lease(reused).dispose();
      expect(released).toEqual(['7']);
      const fresh = await loader(options);
      expect(document.export).toHaveBeenCalledTimes(2);
      expect(fresh.load).not.toHaveProperty('reused');
    } finally {
      await loader.releaseAll();
    }
  });
});

describe('native model loader work-unit budget', () => {
  it('should record a bounded loadModel budget per load and refuse an unbounded one before export', async () => {
    const { engine } = fixtureEngine();
    const { runtime, document } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime,
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
      expect(document.export).toHaveBeenCalledOnce();
    } finally {
      await loader.releaseAll();
    }
  });

  it('should admit a budget above the default maximum when the host raised it', async () => {
    const { engine } = fixtureEngine();
    const { runtime } = fixtureRuntime();
    const loader = createGeoSpecNativeModelLoader({ engine, runtime, maximumWorkUnitLimit: 2_048_000_000 });
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
    const fixture = fixtureRuntime({ issues: confirm });
    const runtime = Object.assign(fixture.runtime, {
      bestRouteFor: vi.fn(() => regionRoute),
    });
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    try {
      const cropped = await loader({ file: 'main.ts', region });
      const whole = await loader({ file: 'main.ts' });
      const again = await loader({
        file: 'main.ts',
        region: { min: [0, 0, 0], max: [10, 20, 30] },
      });
      expect(fixture.document.export).toHaveBeenCalledTimes(2);
      expect(fixture.document.export.mock.calls[0]?.[1]).toMatchObject({
        options: { region },
      });
      expect(fixture.document.export.mock.calls[1]?.[1]?.options).not.toHaveProperty('region');
      expect(cropped.load).toMatchObject({ region, exportOptions: { region } });
      expect(whole.load).not.toHaveProperty('region');
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

  it('should admit a crop when any direct route declares it, even when a B-rep route ranks first', async () => {
    const { engine } = fixtureEngine();
    const fixture = fixtureRuntime({ issues: confirm });
    const brepRoute: GeoSpecExportRoute = {
      kernelId: 'replicad',
      targetFormat: 'glb',
      fidelity: 'brep',
      exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } }, defaults: {} },
    };
    const routesFor = vi.fn(() => [brepRoute, { ...regionRoute, transcoderId: 'mesh' }, regionRoute]);
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime: Object.assign(fixture.runtime, { routesFor, bestRouteFor: () => brepRoute }),
    });
    try {
      const cropped = await loader({ file: 'main.ts', region });
      expect(cropped.load).toMatchObject({ region });
      expect(routesFor).toHaveBeenCalledWith('glb');
    } finally {
      await loader.releaseAll();
    }
    const refusing = createGeoSpecNativeModelLoader({
      engine,
      runtime: Object.assign(fixtureRuntime({ issues: confirm }).runtime, {
        routesFor: () => [brepRoute, { ...brepRoute }, { targetFormat: 'glb' }],
      }),
    });
    await expect(refusing({ file: 'main.ts', region })).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
          message:
            "No direct GLB export of this Runtime (replicad) declares a region option, so GeoSpec cannot crop 'main.ts' before admission.",
          details: { file: 'main.ts', format: 'glb', region, kernelIds: ['replicad'] },
        }),
      ],
    });
  });

  it('should refuse a crop no route declares, a route that transcodes, or an export that does not confirm it', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const routeless = fixtureRuntime({ issues: confirm });
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime: routeless.runtime,
    });
    await expect(loader({ file: 'main.ts', region })).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
          details: { file: 'main.ts', format: 'glb', region, kernelIds: [] },
        }),
      ],
    });
    for (const route of [
      {
        ...regionRoute,
        exportOptions: {
          schema: { properties: { coordinateSystem: {}, unit: {} } },
        },
      },
      { ...regionRoute, transcoderId: 'mesh' },
    ]) {
      const runtime = Object.assign(fixtureRuntime({ issues: confirm }).runtime, { bestRouteFor: () => route });
      const scoped = createGeoSpecNativeModelLoader({ engine, runtime });
      // oxlint-disable-next-line no-await-in-loop -- Each route must refuse before export.
      await expect(scoped({ file: 'main.ts', region })).rejects.toMatchObject({
        diagnostics: [{ code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED', details: { kernelIds: ['picovoxel'] } }],
      });
    }
    const silent = fixtureRuntime();
    const unconfirmed = createGeoSpecNativeModelLoader({
      engine,
      runtime: Object.assign(silent.runtime, {
        bestRouteFor: () => regionRoute,
      }),
    });
    await expect(unconfirmed({ file: 'main.ts', region })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_MODEL_REGION_NOT_HONORED' })],
    });
    expect(silent.document.export).toHaveBeenCalledOnce();
    expect(routeless.document.export).not.toHaveBeenCalled();
    expect(ingestSubject).not.toHaveBeenCalled();
  });

  it('should refuse a malformed crop, a STEP crop and a direct-source crop before reading anything', async () => {
    const { engine } = fixtureEngine();
    const { runtime, document } = fixtureRuntime({ issues: confirm });
    const readSource = vi.fn(async () => Uint8Array.of(1));
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime,
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
    expect(document.export).not.toHaveBeenCalled();
    expect(readSource).not.toHaveBeenCalled();
    await loader.releaseAll();
  });
});

type Description = Awaited<ReturnType<NonNullable<GeoSpecRuntimeClient['describe']>>>;
const description = (kernelId: string | undefined): Description => ({ success: false, kernelId, issues: [] });

describe('native model loader kernel description', () => {
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
  const routedRuntime = (describe: NonNullable<GeoSpecRuntimeClient['describe']> | undefined) => {
    const fixture = fixtureRuntime();
    const bestRouteFor = vi.fn((_format: string, options?: { kernelId?: string }) =>
      options?.kernelId === 'picovoxel' ? voxelStep : brepStep,
    );
    const runtime = Object.assign(fixture.runtime, {
      bestRouteFor,
      routesFor: () => [brepStep, voxelStep],
      ...(describe === undefined ? {} : { describe }),
    });
    return { ...fixture, runtime, bestRouteFor };
  };

  it('should pick STEP routes among the described kernel and refuse a mesh-only kernel before export', async () => {
    const { engine, ingestSubject } = fixtureEngine();
    const describe = vi.fn(async () => description('picovoxel'));
    const { runtime, document, bestRouteFor } = routedRuntime(describe);
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    await expect(loader({ file: 'main.ts', format: 'step' })).rejects.toMatchObject({
      diagnostics: [{ code: 'GEOSPEC_KERNEL_BREP_UNSUPPORTED', details: { kernelId: 'picovoxel' } }],
    });
    expect(describe).toHaveBeenCalledWith({ source: { path: 'main.ts' } });
    expect(bestRouteFor).toHaveBeenCalledWith('step', { kernelId: 'picovoxel' });
    expect(document.export).not.toHaveBeenCalled();
    expect(ingestSubject).not.toHaveBeenCalled();
    await loader.releaseAll();
  });

  it('should keep the runtime-wide route when the Runtime cannot describe the source', async () => {
    for (const describe of [
      undefined,
      vi.fn(async () => {
        throw new Error('describe failed');
      }),
      vi.fn(async () => description(undefined)),
    ]) {
      const { engine } = fixtureEngine();
      const { runtime, document, bestRouteFor } = routedRuntime(describe);
      const loader = createGeoSpecNativeModelLoader({ engine, runtime });
      // oxlint-disable-next-line no-await-in-loop -- Each Runtime shape loads on its own engine.
      const subject = await loader({ file: 'main.ts', format: 'step' });
      expect(subject.load).toMatchObject({ format: 'step' });
      expect(bestRouteFor).toHaveBeenCalledWith('step');
      expect(document.export).toHaveBeenCalledOnce();
      // oxlint-disable-next-line no-await-in-loop -- Release before the next Runtime shape.
      await loader.releaseAll();
    }
  });

  it('should admit a region only when the described kernel itself declares the crop', async () => {
    const { engine } = fixtureEngine();
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
    const fixture = fixtureRuntime();
    const runtime = Object.assign(fixture.runtime, {
      routesFor: () => [plainRoute, cropRoute],
      bestRouteFor: () => plainRoute,
      describe: async () => description('replicad'),
    });
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    await expect(loader({ file: 'main.ts', region: { min: [0, 0, 0], max: [1, 1, 1] } })).rejects.toMatchObject({
      diagnostics: [{ code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED', details: { kernelIds: ['replicad'] } }],
    });
    expect(fixture.document.export).not.toHaveBeenCalled();
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
    const { runtime, document } = fixtureRuntime();
    const nativeModelLoader = createGeoSpecNativeModelLoader({
      engine,
      runtime,
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
      expect(document.export).toHaveBeenCalledOnce();
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
  const regionRoute: GeoSpecExportRoute = {
    kernelId: 'picovoxel',
    targetFormat: 'glb',
    exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {}, region: {} } }, defaults: {} },
  };
  const confirm = (exportOptions: unknown): KernelIssue[] =>
    exportOptions !== null && typeof exportOptions === 'object' && 'region' in exportOptions
      ? [
          {
            code: 'RESOURCE_LIMIT',
            severity: 'info',
            message: 'Cropped.',
            type: 'runtime',
            details: { region: exportOptions.region },
          },
        ]
      : [];
  const run = async (claims: string) => {
    const { engine } = fixtureEngine();
    const fixture = fixtureRuntime({ issues: confirm });
    const runtime = Object.assign(fixture.runtime, { bestRouteFor: () => regionRoute });
    const nativeModelLoader = createGeoSpecNativeModelLoader({ engine, runtime });
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
