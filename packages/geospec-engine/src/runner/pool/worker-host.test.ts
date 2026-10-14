import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeoSpecNativeModelEngine, ManagedGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';
import { failingSpec, memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';

const twoTests = `
  import { describe, it } from 'geospec';
  describe('suite', () => {
    it('one', () => {});
    it('two', () => {});
  });
`;

/** A native loader that admits nothing and records each release. */
const nativeLoader = (
  releaseAll: () => Promise<void> = async () => undefined,
  load: () => Promise<{ subjectHash: string }> = async () => ({ subjectHash: 'unused' }),
): ManagedGeoSpecNativeModelLoader => Object.assign(load, { releaseAll });

/** Start a host over an in-memory project and drive it message by message. */
const startHost = (
  files: Readonly<Record<string, string>>,
  over: Partial<Parameters<typeof startGeoSpecPoolWorkerHost>[0]> = {},
) => {
  const posted: GeoSpecPoolWorkerMessage[] = [];
  let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
  startGeoSpecPoolWorkerHost({
    filesystem: memoryFileSystem(files),
    nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
    nativeModelLoader: nativeLoader(),
    postMessage: (message) => posted.push(message),
    onHostMessage: (listener) => {
      deliver = listener;
    },
    ...over,
  });

  /** Send one message and wait for the reply that settles it. */
  const send = async (
    message: GeoSpecPoolHostMessage,
    settles: Array<GeoSpecPoolWorkerMessage['type']> = ['shard-complete', 'shard-error', 'tests-listed', 'list-error'],
  ): Promise<GeoSpecPoolWorkerMessage[]> => {
    const before = posted.length;
    deliver?.(message);
    await vi.waitFor(
      () => {
        expect(posted.slice(before).some((reply) => settles.includes(reply.type))).toBe(true);
      },
      { timeout: 30_000 },
    );
    return posted.slice(before);
  };

  return { posted, send, deliver: (message: GeoSpecPoolHostMessage) => deliver?.(message) };
};

describe('startGeoSpecPoolWorkerHost', () => {
  it('should report a throwing shutdown callback without stranding the worker queue', async () => {
    const host = startHost(
      {},
      {
        onShutdown: () => {
          throw new Error('engine close failed');
        },
      },
    );
    const replies = await host.send({ type: 'shutdown' }, ['initialization-error']);
    expect(replies).toStrictEqual([{ type: 'initialization-error', message: 'engine close failed' }]);
  });

  it('should still close the native engine after admission release fails and report the release error', async () => {
    const order: string[] = [];
    const nativeModelLoader = nativeLoader(async () => {
      order.push('release');
      throw new Error('release failed');
    });
    const host = startHost(
      {},
      {
        nativeModelLoader,
        onShutdown: () => {
          order.push('close-engine');
        },
      },
    );
    const replies = await host.send({ type: 'shutdown' }, ['initialization-error']);
    expect(order).toStrictEqual(['release', 'close-engine']);
    expect(replies).toStrictEqual([{ type: 'initialization-error', message: 'release failed' }]);
  });

  it('should release native admissions before closing the worker-owned engine', async () => {
    const order: string[] = [];
    const nativeModelLoader = nativeLoader(async () => {
      order.push('release');
    });
    const host = startHost(
      {},
      {
        nativeModelLoader,
        onShutdown: () => {
          order.push('close-engine');
        },
      },
    );
    const replies = await host.send({ type: 'shutdown' }, ['initialized', 'initialization-error']);
    expect(order).toStrictEqual(['release', 'close-engine']);
    expect(replies).toStrictEqual([{ type: 'initialized' }]);
  });

  it('should release native admissions after every shard and collection pass', async () => {
    const releaseAll = vi.fn(async () => undefined);
    const nativeModelLoader = nativeLoader(releaseAll);
    const host = startHost({ 'a.geospec.ts': passingSpec('a') }, { nativeModelLoader });

    await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    await vi.waitFor(() => {
      expect(releaseAll).toHaveBeenCalledTimes(1);
    });
    await host.send({ type: 'list-tests', shardId: 1, file: 'a.geospec.ts' });
    await vi.waitFor(() => {
      expect(releaseAll).toHaveBeenCalledTimes(2);
    });
  });

  it('should report a native release failure as that pass error and keep serving', async () => {
    const releaseAll = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('shard release failed'))
      .mockRejectedValueOnce(new Error('list release failed'));
    const nativeModelLoader = nativeLoader(releaseAll);
    const host = startHost({ 'a.geospec.ts': passingSpec('a') }, { nativeModelLoader });

    const shard = await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    const listed = await host.send({ type: 'list-tests', shardId: 1, file: 'a.geospec.ts' });
    const next = await host.send({ type: 'run-shard', shard: { id: 2, file: 'a.geospec.ts' } });

    expect(shard.slice(1)).toStrictEqual([
      { type: 'shard-error', shardId: 0, file: 'a.geospec.ts', message: 'shard release failed' },
    ]);
    expect(listed).toStrictEqual([
      { type: 'list-error', shardId: 1, file: 'a.geospec.ts', message: 'list release failed' },
    ]);
    expect(next.map(({ type }) => type)).toStrictEqual(['file-start', 'shard-complete']);
    expect(host.posted.some(({ type }) => type === 'initialization-error')).toBe(false);
  });

  it('should announce readiness before any shard arrives', () => {
    const host = startHost({});

    expect(host.posted).toStrictEqual([{ type: 'ready' }]);
  });

  it('should acknowledge initialization before running shards', async () => {
    const host = startHost({});

    const replies = await host.send({ type: 'initialize' }, ['initialized', 'initialization-error']);

    expect(replies).toStrictEqual([{ type: 'initialized' }]);
  });

  it('should run a shard and report its result, duration and load key', async () => {
    const host = startHost({ 'a.geospec.ts': passingSpec('a') }, { measureMemoryBytes: () => 4096 });

    const replies = await host.send({ type: 'run-shard', shard: { id: 7, file: 'a.geospec.ts' } });

    expect(replies[0]).toStrictEqual({ type: 'file-start', shardId: 7, file: 'a.geospec.ts' });
    const done = replies.find((message) => message.type === 'shard-complete');
    expect(done).toMatchObject({ shardId: 7, file: 'a.geospec.ts', workerMemoryBytes: 4096 });
    expect(done?.type === 'shard-complete' && done.result.success).toBe(true);
  });

  it('should elide the compiled module before posting a result', async () => {
    const host = startHost({ 'a.geospec.ts': passingSpec('a') });

    const replies = await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(done?.type === 'shard-complete' && done.result.bundle?.code).toBe('');
  });

  it('should honour a split shard pattern over the run-wide one', async () => {
    const host = startHost({ 'a.geospec.ts': twoTests });

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 0, file: 'a.geospec.ts', testNamePattern: '^suite > two$' },
      testNamePattern: '^suite > one$',
    });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(
      done?.type === 'shard-complete' && done.result.success && done.result.tests.map((test) => test.name),
    ).toStrictEqual(['two']);
  });

  it('should apply the run-wide pattern when a shard names none', async () => {
    const host = startHost({ 'a.geospec.ts': twoTests });

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 0, file: 'a.geospec.ts' },
      testNamePattern: '^suite > one$',
      testTimeout: 5000,
    });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(
      done?.type === 'shard-complete' && done.result.success && done.result.tests.map((test) => test.name),
    ).toStrictEqual(['one']);
  });

  it('should list a file without running any body', async () => {
    const host = startHost({ 'a.geospec.ts': failingSpec('never runs') });

    const replies = await host.send({ type: 'list-tests', shardId: 3, file: 'a.geospec.ts', testTimeout: 100 });

    expect(replies[0]).toStrictEqual({
      type: 'tests-listed',
      shardId: 3,
      file: 'a.geospec.ts',
      names: ['never runs > fails'],
    });
  });

  it('should apply resolved forensic and matcher limits to a collection pass', async () => {
    const host = startHost({ 'a.geospec.ts': passingSpec('listed') });

    const replies = await host.send({
      type: 'list-tests',
      shardId: 4,
      file: 'a.geospec.ts',
      matcherWallBackstop: 1000,
      forensic: true,
    });

    expect(replies[0]).toMatchObject({ type: 'tests-listed', shardId: 4 });
  });

  it('should list nothing for a file that could not be collected', async () => {
    const host = startHost({});

    const replies = await host.send({ type: 'list-tests', shardId: 1, file: 'missing.geospec.ts' });

    expect(replies[0]).toMatchObject({ type: 'tests-listed', names: [] });
  });

  it('should run the shutdown callback exactly once, on shutdown', async () => {
    const onShutdown = vi.fn(async () => undefined);
    const host = startHost({ 'a.geospec.ts': passingSpec('a') }, { onShutdown });

    await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    expect(onShutdown).not.toHaveBeenCalled();

    host.deliver({ type: 'shutdown' });

    await vi.waitFor(
      () => {
        expect(onShutdown).toHaveBeenCalledTimes(1);
      },
      { timeout: 30_000 },
    );
  });

  it('should report a shard whose result could not be posted', async () => {
    // The realistic failure: a result the host cannot structured-clone. The
    // worker must say so rather than going silent and letting the pool wait.
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
    startGeoSpecPoolWorkerHost({
      filesystem: memoryFileSystem({ 'a.geospec.ts': passingSpec('a') }),
      nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
      nativeModelLoader: nativeLoader(),
      postMessage: (message) => {
        if (message.type === 'shard-complete') {
          throw new Error('could not be cloned');
        }
        posted.push(message);
      },
      onHostMessage: (listener) => {
        deliver = listener;
      },
    });

    deliver?.({ type: 'run-shard', shard: { id: 5, file: 'a.geospec.ts' } });
    await vi.waitFor(
      () => {
        expect(posted.some((message) => message.type === 'shard-error')).toBe(true);
      },
      { timeout: 30_000 },
    );

    expect(posted.at(-1)).toStrictEqual({
      type: 'shard-error',
      shardId: 5,
      file: 'a.geospec.ts',
      message: 'could not be cloned',
    });
  });

  it('should report a collection pass whose reply could not be posted', async () => {
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
    startGeoSpecPoolWorkerHost({
      filesystem: memoryFileSystem({ 'a.geospec.ts': passingSpec('a') }),
      nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
      nativeModelLoader: nativeLoader(),
      postMessage: (message) => {
        if (message.type === 'tests-listed') {
          // A non-Error throw: the host must still name it.
          // oxlint-disable-next-line typescript/only-throw-error -- a worker that throws a non-Error is exactly the case under test.
          throw 'not an Error';
        }
        posted.push(message);
      },
      onHostMessage: (listener) => {
        deliver = listener;
      },
    });

    deliver?.({ type: 'list-tests', shardId: 2, file: 'a.geospec.ts' });
    await vi.waitFor(
      () => {
        expect(posted.some((message) => message.type === 'list-error')).toBe(true);
      },
      { timeout: 30_000 },
    );

    expect(posted.at(-1)).toMatchObject({ type: 'list-error', shardId: 2, message: 'not an Error' });
  });

  it('should pass native loads and builtin modules through to the VM without reporting memory unasked', async () => {
    const load = vi.fn(async () => ({ subjectHash: 'a'.repeat(64) }));
    const host = startHost(
      {
        'a.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          import { tag } from 'project/extra';
          describe('deps', () => {
            it('loads', async () => { await loadModel({ file: 'main.ts' }); if (tag !== 'ok') throw new Error(tag); });
          });
        `,
      },
      {
        nativeModelLoader: nativeLoader(undefined, load),
        builtinModules: { 'project/extra': { version: '1', code: "export const tag = 'ok';" } },
      },
    );

    const replies = await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(done?.type === 'shard-complete' && done.result.success).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(done).not.toHaveProperty('primaryLoadKey');
    expect(done?.type === 'shard-complete' && done.workerMemoryBytes).toBeUndefined();
  });

  it('should load identical model options afresh across shards on one worker', async () => {
    const source = `
      import { describe, it } from 'geospec';
      import { loadModel } from 'geospec/model';
      describe('cache', () => {
        it('loads', async () => { await loadModel({ file: 'assembly.ts', format: 'step', mesh: false }); });
      });
    `;
    const load = vi.fn(async () => ({ subjectHash: 'a'.repeat(64) }));
    const host = startHost(
      { 'a.geospec.ts': source, 'b.geospec.ts': source },
      { nativeModelLoader: nativeLoader(undefined, load) },
    );

    await host.send({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    await host.send({ type: 'run-shard', shard: { id: 1, file: 'b.geospec.ts' } });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('should post file and shard timings with the shard identity when forensic', async () => {
    const host = startHost({ 'a.geospec.ts': passingSpec('a') });

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 9, file: 'a.geospec.ts' },
      testTimeout: 5000,
      matcherWallBackstop: 1000,
      forensic: true,
    });

    const forensic = replies.flatMap((reply) =>
      reply.type === 'forensic' ? [[reply.shardId, reply.name, reply.unit]] : [],
    );
    expect(forensic).toStrictEqual([
      [9, 'runner.file', 'milliseconds'],
      [9, 'runner.shard', 'milliseconds'],
    ]);
  });

  it('should keep a pass error over a later release failure', async () => {
    const releaseAll = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('release failed'));
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
    startGeoSpecPoolWorkerHost({
      filesystem: memoryFileSystem({ 'a.geospec.ts': passingSpec('a') }),
      nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
      nativeModelLoader: nativeLoader(releaseAll),
      postMessage: (message) => {
        if (message.type === 'forensic') {
          throw new Error('forensic port closed');
        }
        posted.push(message);
      },
      onHostMessage: (listener) => {
        deliver = listener;
      },
    });

    deliver?.({ type: 'run-shard', shard: { id: 3, file: 'a.geospec.ts' }, forensic: true });
    await vi.waitFor(() => {
      expect(posted.some((message) => message.type === 'shard-error')).toBe(true);
    });

    expect(releaseAll).toHaveBeenCalledOnce();
    expect(posted.at(-1)).toStrictEqual({
      type: 'shard-error',
      shardId: 3,
      file: 'a.geospec.ts',
      message: 'forensic port closed',
    });
  });

  it('should report an initialization reply that could not be posted', async () => {
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
    startGeoSpecPoolWorkerHost({
      filesystem: memoryFileSystem({}),
      nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
      nativeModelLoader: nativeLoader(),
      postMessage: (message) => {
        if (message.type === 'initialized') {
          throw new Error('port detached');
        }
        posted.push(message);
      },
      onHostMessage: (listener) => {
        deliver = listener;
      },
    });

    deliver?.({ type: 'initialize' });
    await vi.waitFor(() => {
      expect(posted).toStrictEqual([{ type: 'ready' }, { type: 'initialization-error', message: 'port detached' }]);
    });
  });

  it('should report the release failure when the shutdown callback also fails', async () => {
    const host = startHost(
      {},
      {
        nativeModelLoader: nativeLoader(async () => {
          throw new Error('release failed');
        }),
        onShutdown: () => {
          throw new Error('engine close failed');
        },
      },
    );

    const replies = await host.send({ type: 'shutdown' }, ['initialization-error']);

    expect(replies).toStrictEqual([{ type: 'initialization-error', message: 'release failed' }]);
  });
});
