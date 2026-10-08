import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeDocument } from '@taucad/runtime/client';
import type { SourceRevision } from '@taucad/runtime/types';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import type { GeoSpecRuntimeClient } from '#model/types.js';
import { bindGeoSpecSubject, rawSubjectResidency, resolveGeoSpecSubject } from '#model/subject.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import type { GeoSpecNativeSubject } from '#engine/client.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

// SAFETY: the fixture constructs an exact 64-hex SHA-256 digest for source revision identity.
const digest = (fill: string): Exclude<SourceRevision['files'][string], 'missing'> =>
  `sha256:${fill.repeat(64)}` as Exclude<SourceRevision['files'][string], 'missing'>;

const testEngine = () => {
  const ingestSubject = vi.fn(
    (
      _request: Uint8Array<ArrayBuffer>,
      _primary: Uint8Array<ArrayBuffer>,
      _resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    ) => encode({ result: { subject: { subjectHash: 'a'.repeat(64) } } }),
  );
  const subjectHandle = vi.fn(() =>
    encode({
      result: { subjectHandle: { subjectHash: 'a'.repeat(64), generation: 1 } },
    }),
  );
  const releaseSubject = vi.fn(() => encode({ result: {} }));
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
    subjectHandle,
    releaseSubject,
  };
  return { engine, ingestSubject, subjectHandle, releaseSubject };
};

describe('native model loader ownership', () => {
  it('should honor no eager STEP mesh without forwarding an unsupported ingest flag', async () => {
    const { engine, ingestSubject } = testEngine();
    const document = mock<RuntimeDocument>();
    document.export.mockResolvedValue({
      success: true,
      exportId: 'step',
      evaluationId: 'evaluation-1',
      issues: [],
      files: [{ name: 'part.step', mimeType: 'application/step', bytes: Uint8Array.of(1) }],
    });
    const runtime: GeoSpecRuntimeClient = {
      connect: async () => undefined,
      terminate: () => undefined,
      open: vi.fn(() => document),
    };
    const loader = createGeoSpecNativeModelLoader({ engine, format: 'stp', runtime });
    try {
      await loader({ source: Uint8Array.of(1), mesh: false });
      const request: unknown = JSON.parse(new TextDecoder().decode(ingestSubject.mock.calls[0]![0]));
      expect(request).toMatchObject({ format: 'step', ingestOptions: {} });
      await loader({ file: 'main.ts', format: 'step', mesh: false });
      for (const options of [
        { format: 'step', mesh: true },
        { format: 'glb', mesh: false },
        { format: 'step', mesh: false, stepStreaming: 'native-stream' },
        { format: 'step', mesh: false, meshLinearTolerance: 0.1 },
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- Each unsupported policy must fail before another admission.
        await expect(loader({ source: Uint8Array.of(1), ...options })).rejects.toMatchObject({
          diagnostics: [expect.objectContaining({ code: 'GEOSPEC_MODEL_OPTION_UNSUPPORTED' })],
        });
      }
      expect(ingestSubject).toHaveBeenCalledTimes(2);
    } finally {
      await loader.releaseAll();
    }
  });
  it('should retain only actual source locators in load lineage', async () => {
    const { engine } = testEngine();
    const loader = createGeoSpecNativeModelLoader({ engine, readSource: async () => Uint8Array.of(1) });
    try {
      const bytes = await loader({ source: Uint8Array.of(1), path: 'display.step', format: 'step' });
      const locator = await loader({ source: 'actual.step', path: 'display.step', format: 'step' });
      expect(bytes.load).not.toHaveProperty('sourcePath');
      expect(locator.load).toHaveProperty('sourcePath', 'actual.step');
    } finally {
      await loader.releaseAll();
    }
  });

  it('should retain direct resource locators independently from artifact labels', async () => {
    const { engine } = testEngine();
    let resource = 1;
    const loader = createGeoSpecNativeModelLoader({ engine, readSource: async () => Uint8Array.of(resource) });
    try {
      const options = {
        source: Uint8Array.of(0),
        path: 'display.glb',
        format: 'glb',
        resources: [
          { name: 'mesh.bin', source: 'assets/actual.bin' },
          { name: 'anonymous.bin', source: Uint8Array.of(2) },
        ],
      } as const;
      const first = await loader(options);
      resource = 3;
      const edited = await loader(options);
      expect(first.load?.artifacts).toMatchObject([
        { name: 'display.glb' },
        { name: 'mesh.bin', sourcePath: 'assets/actual.bin' },
        { name: 'anonymous.bin' },
      ]);
      expect(first.load?.artifacts[0]).not.toHaveProperty('sourcePath');
      expect(first.load?.artifacts[2]).not.toHaveProperty('sourcePath');
      expect(edited.load?.artifacts[1]?.sha256).not.toBe(first.load?.artifacts[1]?.sha256);
    } finally {
      await loader.releaseAll();
    }
  });

  it('should admit successful Runtime issues into the compiled subject', async () => {
    const { engine, ingestSubject } = testEngine();
    const document = mock<RuntimeDocument>();
    document.export.mockResolvedValue({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      issues: [{ code: 'RUNTIME', severity: 'warning', message: 'Model warning' }],
      files: [{ name: 'part.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.of(1) }],
    });
    const runtime: GeoSpecRuntimeClient = {
      connect: async () => undefined,
      terminate: () => undefined,
      open: vi.fn(() => document),
    };
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    try {
      await loader({ file: 'main.ts' });
      const request: unknown = JSON.parse(new TextDecoder().decode(ingestSubject.mock.calls[0]![0]));
      expect(request).toMatchObject({
        diagnostics: [{ code: 'RUNTIME', severity: 'warning', message: 'Model warning' }],
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it('should retain each Runtime load graph and actual export bytes despite equal admitted geometry', async () => {
    const { engine } = testEngine();
    const parameters = { width: 2 };
    const files = { 'main.ts': digest('a'), 'cache.json': digest('b') };
    const document = mock<RuntimeDocument>();
    document.export.mockImplementation(async () => ({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      issues: [],
      sourceRevision: { entry: 'main.ts', files: { ...files } },
      files: [{ name: 'part.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.of(parameters.width) }],
    }));
    const runtime: GeoSpecRuntimeClient = {
      connect: async () => undefined,
      terminate: () => undefined,
      open: vi.fn(() => document),
    };
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    const first = await loader({ file: 'main.ts', parameters });
    parameters.width = 3;
    files['cache.json'] = digest('c');
    const second = await loader({ file: 'main.ts', parameters });
    expect(first).toMatchObject({
      load: {
        status: 'complete',
        parameters: { width: 2 },
        sourceRevision: { files: { 'cache.json': `sha256:${'b'.repeat(64)}` } },
        artifacts: [{ name: 'part.glb', byteLength: 1 }],
      },
    });
    expect(first.load?.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(second).toMatchObject({
      load: { parameters: { width: 3 }, sourceRevision: { files: { 'cache.json': `sha256:${'c'.repeat(64)}` } } },
    });
    expect(first.subjectHash).toBe(second.subjectHash);
    expect(first.load?.artifacts[0]?.sha256).not.toBe(second.load?.artifacts[0]?.sha256);
    await loader.releaseAll();
  });
  it('should reject ignored STEP source-unit overrides before reading or admission', async () => {
    const { engine, ingestSubject } = testEngine();
    const readSource = vi.fn(async () => Uint8Array.of(1));
    const loader = createGeoSpecNativeModelLoader({ engine, readSource });
    await expect(loader({ source: 'model.step', format: 'step', sourceUnit: 'm' })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_MODEL_OPTION_UNSUPPORTED' })],
    });
    expect(readSource).not.toHaveBeenCalled();
    expect(ingestSubject).not.toHaveBeenCalled();
    await loader.releaseAll();
  });
  it('should admit reader and Runtime export bytes as they are but snapshot caller-owned bytes', async () => {
    const { engine, ingestSubject } = testEngine();
    const read = Uint8Array.of(1);
    const exported = Uint8Array.of(2);
    const resource = Uint8Array.of(3);
    const document = mock<RuntimeDocument>();
    document.export.mockResolvedValue({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      files: [
        { name: 'model.glb', mimeType: 'model/gltf-binary', bytes: exported },
        { name: 'model.bin', mimeType: 'application/octet-stream', bytes: resource },
      ],
      issues: [],
    });
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      open: vi.fn(() => document),
      terminate: vi.fn(),
    };
    const loader = createGeoSpecNativeModelLoader({ engine, runtime, readSource: async () => read });
    const caller = Uint8Array.of(4);

    await loader({ source: 'model.step', format: 'step' });
    await loader({ file: 'main.ts', format: 'glb' });
    await loader({ source: caller, format: 'step' });
    await loader.releaseAll();

    const admitted = ingestSubject.mock.calls.map(([, primary, resources]) => [primary, ...resources]);
    expect(admitted[0]?.[0]).toBe(read);
    expect(admitted[1]?.[0]).toBe(exported);
    expect(admitted[1]?.[1]).toBe(resource);
    expect(admitted[2]?.[0]).not.toBe(caller);
    expect(admitted[2]?.[0]).toStrictEqual(caller);
  });

  it('coalesces inline Runtime exports, drains release, and retries after failure', async () => {
    const { engine, ingestSubject, releaseSubject } = testEngine();
    const firstExport = Promise.withResolvers<Awaited<ReturnType<RuntimeDocument['export']>>>();
    const exportModel = vi
      .fn()
      .mockImplementationOnce(async () => firstExport.promise)
      .mockResolvedValue({
        success: true,
        exportId: 'glb',
        evaluationId: 'evaluation-1',
        files: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.of(8) }],
        issues: [],
      });
    const terminate = vi.fn();
    const document = mock<RuntimeDocument>({ export: exportModel });
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      open: vi.fn(() => document),
      terminate,
    };
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    const code = { 'main.ts': 'model A' };
    const options = { code, file: 'main.ts', format: 'glb' } as const;
    const first = loader(options);
    const duplicate = loader({ ...options, code: { 'main.ts': 'model A' } });
    const cleanup = loader.releaseAll();
    await vi.waitFor(() => {
      expect(exportModel).toHaveBeenCalledTimes(1);
    });
    firstExport.reject(new Error('export failed'));
    await expect(first).rejects.toThrow('export failed');
    await expect(duplicate).rejects.toThrow('export failed');
    await cleanup;
    expect(ingestSubject).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
    await loader(options);
    expect(exportModel).toHaveBeenCalledTimes(2);
    expect(ingestSubject).toHaveBeenCalledTimes(1);
    code['main.ts'] = 'model B';
    await loader(options);
    expect(exportModel).toHaveBeenCalledTimes(3);
    expect(vi.mocked(runtime.open).mock.calls[2]?.[0]).toMatchObject({
      source: { files: { 'main.ts': 'model B' } },
      watch: false,
    });
    await loader.releaseAll();
    expect(releaseSubject).toHaveBeenCalledTimes(1);
  });

  it('keeps a shared Runtime admission alive until releaseAll drains it', async () => {
    const { engine, ingestSubject, releaseSubject } = testEngine();
    const exported = Promise.withResolvers<Awaited<ReturnType<RuntimeDocument['export']>>>();
    const terminate = vi.fn();
    const exportModel = vi.fn(async () => exported.promise);
    const document = mock<RuntimeDocument>({ export: exportModel });
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      open: vi.fn(() => document),
      terminate,
    };
    const loader = createGeoSpecNativeModelLoader({
      engine,
      runtime: async () => runtime,
    });
    const options = {
      code: { 'main.ts': 'model' },
      file: 'main.ts',
      format: 'glb',
    } as const;
    const first = loader(options);
    const duplicate = loader(options);
    const cleanup = loader.releaseAll();
    await vi.waitFor(() => {
      expect(exportModel).toHaveBeenCalledTimes(1);
    });
    expect(releaseSubject).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
    exported.resolve({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation-1',
      issues: [],
      files: [
        {
          name: 'model.glb',
          mimeType: 'model/gltf-binary',
          bytes: Uint8Array.of(9),
        },
      ],
    });
    await Promise.all([first, duplicate, cleanup]);
    expect(ingestSubject).toHaveBeenCalledTimes(1);
    expect(releaseSubject).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('should settle an in-flight admission before releasing its subject', async () => {
    const hash = 'a'.repeat(64);
    const source = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const operations: string[] = [];
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
      ingestSubject: () => {
        operations.push('ingest');
        return encode({ result: { subject: { subjectHash: hash } } });
      },
      subjectHandle: () => {
        operations.push('handle');
        return encode({ result: { subjectHandle: { subjectHash: hash, generation: 1 } } });
      },
      releaseSubject: () => {
        operations.push('release');
        return encode({ result: {} });
      },
    };
    const loader = createGeoSpecNativeModelLoader({
      engine,
      readSource: async () => source.promise,
    });

    const loading = loader({ source: 'part.step', format: 'step' });
    const cleanup = loader.releaseAll();
    source.resolve(Uint8Array.of(1, 2, 3));

    await expect(loading).resolves.toMatchObject({ subjectHash: hash, load: { status: 'complete' } });
    await cleanup;
    expect(operations).toStrictEqual(['ingest', 'handle', 'release']);
  });

  it('should drain successive finite chained admissions before releasing any subjects', async () => {
    const first = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const second = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const third = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const readSource = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise)
      .mockImplementationOnce(async () => third.promise);
    const operations: string[] = [];
    let admission = 0;
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
      ingestSubject: () => {
        admission += 1;
        operations.push(`ingest:${admission}`);
        return encode({ result: { subject: { subjectHash: String(admission).repeat(64) } } });
      },
      subjectHandle: () => {
        operations.push(`handle:${admission}`);
        return encode({ result: { subjectHandle: { subjectHash: String(admission).repeat(64), generation: 1 } } });
      },
      releaseSubject: () => {
        operations.push('release');
        return encode({ result: {} });
      },
    };
    const loader = createGeoSpecNativeModelLoader({ engine, readSource });
    /* oxlint-disable promise/prefer-await-to-then -- Exercise admissions registered by promise continuations during drainage. */
    const loading = loader({ source: 'first.step', format: 'step' }).then(async () =>
      loader({ source: 'second.step', format: 'step' }).then(async () =>
        loader({ source: 'third.step', format: 'step' }),
      ),
    );
    /* oxlint-enable promise/prefer-await-to-then */
    const cleanup = loader.releaseAll();
    let released = false;
    const observeCleanup = async (): Promise<void> => {
      await cleanup;
      released = true;
    };
    const observed = observeCleanup();
    try {
      first.resolve(Uint8Array.of(1));
      await vi.waitFor(() => {
        expect(readSource).toHaveBeenCalledTimes(2);
      });
      expect(released).toBe(false);
      expect(operations).toStrictEqual(['ingest:1', 'handle:1']);
      second.resolve(Uint8Array.of(2));
      await vi.waitFor(() => {
        expect(readSource).toHaveBeenCalledTimes(3);
      });
      expect(released).toBe(false);
      expect(operations).toStrictEqual(['ingest:1', 'handle:1', 'ingest:2', 'handle:2']);
      third.resolve(Uint8Array.of(3));

      await expect(loading).resolves.toMatchObject({ subjectHash: '3'.repeat(64), load: { status: 'complete' } });
      await cleanup;
      expect(readSource.mock.calls).toStrictEqual([['first.step'], ['second.step'], ['third.step']]);
      expect(operations).toStrictEqual([
        'ingest:1',
        'handle:1',
        'ingest:2',
        'handle:2',
        'ingest:3',
        'handle:3',
        'release',
        'release',
        'release',
      ]);
    } finally {
      first.resolve(Uint8Array.of(1));
      second.resolve(Uint8Array.of(2));
      third.resolve(Uint8Array.of(3));
      await loading;
      await observed;
    }
  });
});

/** Content-addressed stand-in: the first primary byte names the subject, as a digest would. */
const contentEngine = () => {
  const decodeRequest = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
    JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const released: string[] = [];
  let refusals = 0;
  const ingestSubject = vi.fn(
    (
      _request: Uint8Array<ArrayBuffer>,
      primary: Uint8Array<ArrayBuffer>,
      _resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    ) => {
      if (refusals > 0) {
        refusals -= 1;
        throw Object.assign(new Error('Engine exceeds the configured retained subject count.'), {
          code: 'limit-exceeded',
        });
      }
      return encode({ result: { subject: { subjectHash: String(primary[0]).repeat(64) } } });
    },
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
  const files: Record<string, number> = { 'a.step': 1, 'b.step': 2, 'c.step': 3 };
  const readSource = vi.fn(async (source: unknown) => Uint8Array.of(files[String(source)]!));
  return {
    engine,
    files,
    ingestSubject,
    readSource,
    released,
    refuseNext: () => {
      refusals += 1;
    },
  };
};

describe('native model loader freshness', () => {
  it('should read every load again and admit edited bytes as a new subject', async () => {
    const { engine, files, ingestSubject, readSource } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine, readSource });

    const first = await loader({ source: 'a.step', format: 'step' });
    const repeat = await loader({ source: 'a.step', format: 'step' });
    files['a.step'] = 9;
    const edited = await loader({ source: 'a.step', format: 'step' });

    expect(readSource).toHaveBeenCalledTimes(3);
    expect(ingestSubject).toHaveBeenCalledTimes(3);
    expect([first, repeat, edited].map(({ subjectHash }) => ({ subjectHash }))).toStrictEqual([
      { subjectHash: '1'.repeat(64) },
      { subjectHash: '1'.repeat(64) },
      { subjectHash: '9'.repeat(64) },
    ]);
  });
});

describe('native model loader carried scopes', () => {
  const leaseFor = (subject: GeoSpecNativeSubject, engine: GeoSpecNativeModelEngine) => {
    const facade = bindGeoSpecSubject({
      client: createGeoSpecAssertionClient({ engine }),
      engine,
      identity: subject,
      isLive: () => true,
      ensureResident: rawSubjectResidency(subject)!,
    });
    const { lease } = resolveGeoSpecSubject(facade);
    expect(lease).toBeDefined();
    return lease!;
  };

  it('should drop only a genuine load lease and retain root and sibling aliases', async () => {
    const { engine, released } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    const bytes = new Uint8Array(800);
    bytes[0] = 1;
    try {
      const root = await loader({ source: bytes, format: 'step' });
      const child = await loader({ source: bytes, format: 'step' });
      const sibling = await loader({ source: bytes, format: 'step' });
      const childLease = leaseFor(child, engine);
      childLease.dispose();
      childLease.dispose();
      expect(released).toEqual([]);
      rawSubjectResidency(root)!();
      rawSubjectResidency(sibling)!();
      leaseFor(root, engine).dispose();
      expect(released).toEqual([]);
      leaseFor(sibling, engine).dispose();
      expect(released).toEqual(['1']);
      expect(rawSubjectResidency(child)).toThrow(TypeError);
      bytes[0] = 2;
      await expect(loader({ source: bytes, format: 'step' })).resolves.toMatchObject({ subjectHash: '2'.repeat(64) });
    } finally {
      await loader.releaseAll();
    }
  });

  it('should retain another loader and a carried owner when the closed loader drops its last lease', async () => {
    const { engine, released } = contentEngine();
    const carried = new Map<string, unknown>();
    const prior = createGeoSpecNativeModelLoader({ engine, carried });
    await prior({ source: Uint8Array.of(1), format: 'step' });
    await prior.releaseAll();
    const child = createGeoSpecNativeModelLoader({ engine });
    const sibling = createGeoSpecNativeModelLoader({ engine });
    try {
      const childSubject = await child({ source: Uint8Array.of(1), format: 'step' });
      const siblingSubject = await sibling({ source: Uint8Array.of(1), format: 'step' });
      leaseFor(childSubject, engine).dispose();
      await child.releaseAll();
      rawSubjectResidency(siblingSubject)!();
      expect(released).toEqual([]);
      leaseFor(siblingSubject, engine).dispose();
      expect([...carried.keys()]).toEqual(['1'.repeat(64)]);
      expect(released).toEqual([]);
    } finally {
      await child.releaseAll();
      await sibling.releaseAll();
      await prior.releaseAll();
    }
    expect(released).toEqual(['1']);
  });

  it('should keep failed lease cleanup owned for retry without deleting the snapshot', async () => {
    const { engine, released } = contentEngine();
    const release = engine.releaseSubject.bind(engine);
    const failure = new Error('Owned subject release refused.');
    let refused = true;
    engine.releaseSubject = (request) => {
      if (refused) {
        throw failure;
      }
      return release(request);
    };
    const loader = createGeoSpecNativeModelLoader({ engine });
    try {
      const subject = await loader({ source: Uint8Array.of(1), format: 'step' });
      const lease = leaseFor(subject, engine);
      expect(() => {
        lease.dispose();
      }).toThrow(failure);
      expect(released).toEqual([]);
      refused = false;
      lease.dispose();
      lease.dispose();
      expect(released).toEqual(['1']);
      expect(rawSubjectResidency(subject)).toThrow(TypeError);
    } finally {
      refused = false;
      await loader.releaseAll();
    }
  });

  it('should reserve each coalesced pending admission before its owner can dispose', async () => {
    const { engine, released } = contentEngine();
    const exported = Promise.withResolvers<Awaited<ReturnType<RuntimeDocument['export']>>>();
    const started = Promise.withResolvers<void>();
    const document = mock<RuntimeDocument>();
    document.export.mockImplementation(async () => {
      started.resolve();
      return exported.promise;
    });
    const runtime: GeoSpecRuntimeClient = {
      connect: async () => undefined,
      terminate: () => undefined,
      open: vi.fn(() => document),
    };
    const loader = createGeoSpecNativeModelLoader({ engine, runtime });
    try {
      const options = { file: 'main.ts', code: { 'main.ts': 'model' }, format: 'step' } as const;
      const first = loader(options);
      const second = loader(options);
      await started.promise;
      exported.resolve({
        success: true,
        exportId: 'step',
        evaluationId: 'evaluation-1',
        issues: [],
        files: [{ name: 'model.step', mimeType: 'application/step', bytes: Uint8Array.of(1) }],
      });
      const firstSubject = await first;
      leaseFor(firstSubject, engine).dispose();
      const secondSubject = await second;
      rawSubjectResidency(secondSubject)!();
      expect(document.export).toHaveBeenCalledOnce();
      expect(released).toEqual([]);
      leaseFor(secondSubject, engine).dispose();
      expect(released).toEqual(['1']);
    } finally {
      await loader.releaseAll();
    }
  });

  it('should leave a new generation intact when an earlier released alias disposes late', async () => {
    const { engine, released } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    const earlier = await loader({ source: Uint8Array.of(1), format: 'step' });
    const earlierLease = leaseFor(earlier, engine);
    await loader.releaseAll();
    try {
      const current = await loader({ source: Uint8Array.of(1), format: 'step' });
      earlierLease.dispose();
      rawSubjectResidency(current)!();
      expect(rawSubjectResidency(earlier)).toThrow(TypeError);
      expect(released).toEqual(['1']);
    } finally {
      await loader.releaseAll();
    }
    expect(released).toEqual(['1', '1']);
  });
  it.each(['releaseAll', 'count refusal'] as const)(
    'should retain failed carried cleanup for retry after %s',
    async (operation) => {
      const { engine, readSource, released, refuseNext } = contentEngine();
      const releaseSubject = engine.releaseSubject.bind(engine);
      const failure = new Error('Selective release temporarily unavailable.');
      let fail = false;
      engine.releaseSubject = (request) => {
        if (fail) {
          throw failure;
        }
        return releaseSubject(request);
      };
      const carried = new Map<string, unknown>();
      const first = createGeoSpecNativeModelLoader({ engine, readSource, carried });
      await first({ source: 'a.step', format: 'step' });
      await first.releaseAll();
      const second = createGeoSpecNativeModelLoader({ engine, readSource, carried });
      fail = true;
      if (operation === 'releaseAll') {
        await expect(second.releaseAll()).rejects.toBeInstanceOf(AggregateError);
      } else {
        refuseNext();
        await expect(second({ source: 'b.step', format: 'step' })).rejects.toBe(failure);
      }
      expect([...carried.keys()]).toStrictEqual(['1'.repeat(64)]);
      expect(released).toStrictEqual([]);
      fail = false;
      await second.releaseAll();
      expect(carried.size).toBe(0);
      expect(released).toStrictEqual(['1']);
      await second.releaseAll();
      expect(released).toStrictEqual(['1']);
    },
  );
  it('should refuse a restored identity mismatch without marking the earlier subject resident', async () => {
    const { engine, ingestSubject, refuseNext } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    try {
      const first = await loader({ source: Uint8Array.of(1), format: 'step' });
      refuseNext();
      await loader({ source: Uint8Array.of(2), format: 'step' });
      const restore = rawSubjectResidency(first)!;
      ingestSubject.mockImplementationOnce(() => encode({ result: { subject: { subjectHash: '9'.repeat(64) } } }));
      expect(restore).toThrow(new TypeError('Native GeoSpec restored admission changed its subject identity.'));
      const before = ingestSubject.mock.calls.length;
      restore();
      expect(ingestSubject).toHaveBeenCalledTimes(before + 1);
      expect([...ingestSubject.mock.calls.at(-1)![1]]).toEqual([1]);
    } finally {
      await loader.releaseAll();
    }
  });
  it('should restore exact resource and descriptor bytes without rereading source', async () => {
    const { engine, ingestSubject, refuseNext } = contentEngine();
    const primary = Uint8Array.of(1);
    const resource = Uint8Array.of(7);
    const readSource = vi.fn(async () => primary);
    const loader = createGeoSpecNativeModelLoader({ engine, readSource });
    const ingestOptions = { name: 'original' };
    try {
      const first = await loader({
        source: 'first.step',
        format: 'step',
        resources: [{ name: 'resource.bin', source: resource }],
        ingestOptions,
      });
      primary[0] = 9;
      resource[0] = 9;
      ingestOptions.name = 'changed';
      await loader({ source: Uint8Array.of(2), format: 'step' });
      refuseNext();
      await loader({ source: Uint8Array.of(3), format: 'step' });
      const restore = rawSubjectResidency(first);
      expect(restore).toBeTypeOf('function');
      restore!();
      const restored = ingestSubject.mock.calls.at(-1)!;
      expect([...restored[1]]).toEqual([1]);
      expect(restored[2].map((bytes) => [...bytes])).toEqual([[7]]);
      expect(JSON.parse(new TextDecoder().decode(restored[0]))).toMatchObject({
        ingestOptions: { name: 'original' },
        resources: [{ name: 'resource.bin', byteLength: 1 }],
      });
      expect(readSource).toHaveBeenCalledOnce();
      await loader.releaseAll();
      expect(() => {
        restore!();
      }).toThrow('not admitted');
    } finally {
      await loader.releaseAll();
    }
  });
  it('should reject a descriptor exceeding the existing wire byte ceiling before native admission', async () => {
    const { engine, ingestSubject } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    try {
      await expect(
        loader({ source: Uint8Array.of(1), format: 'step', ingestOptions: { name: 'x'.repeat(16 * 1024 * 1024) } }),
      ).rejects.toMatchObject({
        name: 'RangeError',
        code: 'limit-exceeded',
        message: 'GeoSpec retained admission input exceeds its byte limit.',
      });
      expect(ingestSubject).not.toHaveBeenCalled();
    } finally {
      await loader.releaseAll();
    }
  });
  it('should retain one accepted boundary-sized input and reject aggregate growth before native admission', async () => {
    const { engine, ingestSubject } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    const bytes = new Uint8Array(1024);
    bytes[0] = 1;
    try {
      await loader({ source: bytes, format: 'step' });
      await loader({ source: Uint8Array.from(bytes), format: 'step' });
      const before = ingestSubject.mock.calls.length;
      await expect(loader({ source: Uint8Array.of(2), format: 'step' })).rejects.toMatchObject({
        name: 'RangeError',
        code: 'limit-exceeded',
        message: 'GeoSpec live admission snapshots exceed their retained input byte limit.',
      });
      expect(ingestSubject).toHaveBeenCalledTimes(before);
      await loader.releaseAll();
      await expect(loader({ source: Uint8Array.of(2), format: 'step' })).resolves.toMatchObject({
        subjectHash: '2'.repeat(64),
      });
    } finally {
      await loader.releaseAll();
    }
  });

  it('should propagate a geometry-byte limit unchanged without evicting a live subject', async () => {
    const { engine, ingestSubject, released } = contentEngine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    try {
      await loader({ source: Uint8Array.of(1), format: 'step' });
      const failure = Object.assign(new Error('Primary geometry exceeds the configured binary subject limit.'), {
        code: 'limit-exceeded',
      });
      ingestSubject.mockImplementationOnce(() => {
        throw failure;
      });
      await expect(loader({ source: Uint8Array.of(2), format: 'step' })).rejects.toBe(failure);
      expect(released).toEqual([]);
    } finally {
      await loader.releaseAll();
    }
  });
  it('should keep a scope for the next one and release only the subjects it did not load again', async () => {
    const { engine, readSource, released } = contentEngine();
    const carried = new Map<string, unknown>();
    const first = createGeoSpecNativeModelLoader({ engine, readSource, carried });
    await first({ source: 'a.step', format: 'step' });
    await first({ source: 'b.step', format: 'step' });
    await first.releaseAll();

    expect(released).toStrictEqual([]);
    expect([...carried.keys()]).toStrictEqual(['1'.repeat(64), '2'.repeat(64)]);

    const second = createGeoSpecNativeModelLoader({ engine, readSource, carried });
    await second({ source: 'b.step', format: 'step' });
    await second({ source: 'c.step', format: 'step' });
    await second.releaseAll();

    expect(released).toStrictEqual(['1']);
    expect([...carried.keys()]).toStrictEqual(['2'.repeat(64), '3'.repeat(64)]);
  });

  it('should free stale carried subjects and retry once when the engine is full', async () => {
    const { engine, readSource, refuseNext, released } = contentEngine();
    const carried = new Map<string, unknown>();
    const first = createGeoSpecNativeModelLoader({ engine, readSource, carried });
    await first({ source: 'a.step', format: 'step' });
    await first({ source: 'b.step', format: 'step' });
    await first.releaseAll();

    const second = createGeoSpecNativeModelLoader({ engine, readSource, carried });
    await second({ source: 'b.step', format: 'step' });
    refuseNext();
    await expect(second({ source: 'c.step', format: 'step' })).resolves.toMatchObject({
      subjectHash: '3'.repeat(64),
      load: { status: 'complete' },
    });
    expect(released).toStrictEqual(['1']);
    expect([...carried.keys()]).toStrictEqual(['2'.repeat(64)]);

    refuseNext();
    await expect(second({ source: 'a.step', format: 'step' })).resolves.toMatchObject({ subjectHash: '1'.repeat(64) });
    await second.releaseAll();
  });
});
