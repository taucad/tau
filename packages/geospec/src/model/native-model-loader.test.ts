import { describe, expect, it, vi } from 'vitest';
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
    canonicalPlan: (input) => input,
    evaluatePlan: (input) => input,
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
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      export: vi.fn().mockResolvedValue({
        success: true,
        data: [
          { name: 'model.glb', bytes: exported },
          { name: 'model.bin', bytes: resource },
        ],
      }),
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
    const firstExport = Promise.withResolvers<Awaited<ReturnType<GeoSpecRuntimeClient['export']>>>();
    const exportModel = vi
      .fn()
      .mockImplementationOnce(async () => firstExport.promise)
      .mockResolvedValue({
        success: true,
        data: [{ name: 'model.glb', bytes: Uint8Array.of(8) }],
      });
    const terminate = vi.fn();
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      export: exportModel,
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
    expect(exportModel.mock.calls[2]?.[1]).toMatchObject({
      source: { files: { 'main.ts': 'model B' } },
    });
    await loader.releaseAll();
    expect(releaseSubject).toHaveBeenCalledTimes(1);
  });

  it('keeps a shared Runtime admission alive until releaseAll drains it', async () => {
    const { engine, ingestSubject, releaseSubject } = testEngine();
    const exported = Promise.withResolvers<Awaited<ReturnType<GeoSpecRuntimeClient['export']>>>();
    const terminate = vi.fn();
    const runtime: GeoSpecRuntimeClient = {
      connect: vi.fn(async () => undefined),
      export: vi.fn(async () => exported.promise),
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
      expect(runtime.export).toHaveBeenCalledTimes(1);
    });
    expect(releaseSubject).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
    exported.resolve({
      success: true,
      issues: [],
      data: [
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
      canonicalPlan: (input) => input,
      evaluatePlan: (input) => input,
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
      canonicalPlan: (input) => input,
      evaluatePlan: (input) => input,
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
