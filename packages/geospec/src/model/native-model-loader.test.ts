import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

describe('native model loader ownership', () => {
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
