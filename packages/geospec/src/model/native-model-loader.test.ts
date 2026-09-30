import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeDocument } from '@taucad/runtime/client';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import type { GeoSpecRuntimeClient } from '#model/types.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

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
    processRequest: (input) => input,
    ingestSubject,
    subjectHandle,
    releaseSubject,
  };
  return { engine, ingestSubject, subjectHandle, releaseSubject };
};

describe('native model loader ownership', () => {
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
      processRequest: (input) => input,
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

    await expect(loading).resolves.toStrictEqual({ subjectHash: hash });
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
      processRequest: (input) => input,
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

      await expect(loading).resolves.toStrictEqual({ subjectHash: '3'.repeat(64) });
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
    processRequest: (input) => input,
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
    expect([first, repeat, edited]).toStrictEqual([
      { subjectHash: '1'.repeat(64) },
      { subjectHash: '1'.repeat(64) },
      { subjectHash: '9'.repeat(64) },
    ]);
  });
});

describe('native model loader carried scopes', () => {
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
    await expect(second({ source: 'c.step', format: 'step' })).resolves.toStrictEqual({ subjectHash: '3'.repeat(64) });
    expect(released).toStrictEqual(['1']);
    expect([...carried.keys()]).toStrictEqual(['2'.repeat(64)]);

    refuseNext();
    await expect(second({ source: 'a.step', format: 'step' })).rejects.toMatchObject({ code: 'limit-exceeded' });
  });
});
