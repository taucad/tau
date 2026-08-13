/* eslint-disable @typescript-eslint/naming-convention -- VM paths and module specifiers are object keys here. */
import { describe, expect, it, vi } from 'vitest';
import { geoSpecEngineImplementation } from '#register.js';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';
import type { GeometrySubject } from '#mesh/types.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { exposeEngineSubject } from '#engine/subject-store.js';
import { failingSpec, memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';

const twoTests = `
  import { describe, it } from 'geospec';
  describe('suite', () => {
    it('one', () => {});
    it('two', () => {});
  });
`;

const loadedSubject = async (): Promise<GeometrySubject> => {
  const result = await loadMesh({ source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] } });
  if (!result.success) {
    throw new Error(result.diagnostics.map(({ message }) => message).join('\n'));
  }
  return result.subject;
};

void geoSpecEngineImplementation;

/** Start a host over an in-memory project and drive it message by message. */
const startHost = (
  files: Readonly<Record<string, string>>,
  over: Partial<Parameters<typeof startGeoSpecPoolWorkerHost>[0]> = {},
) => {
  const posted: GeoSpecPoolWorkerMessage[] = [];
  let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
  startGeoSpecPoolWorkerHost({
    filesystem: memoryFileSystem(files),
    projectPath: '/',
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
  it('should announce readiness before any shard arrives', () => {
    const host = startHost({});

    expect(host.posted).toStrictEqual([{ type: 'ready' }]);
  });

  it('should run a shard and report its result, duration and load key', async () => {
    const host = startHost({ '/a.geospec.ts': passingSpec('a') }, { measureMemoryBytes: () => 4096 });

    const replies = await host.send({ type: 'run-shard', shard: { id: 7, file: '/a.geospec.ts' } });

    expect(replies[0]).toStrictEqual({ type: 'file-start', shardId: 7, file: '/a.geospec.ts' });
    const done = replies.find((message) => message.type === 'shard-complete');
    expect(done).toMatchObject({ shardId: 7, file: '/a.geospec.ts', workerMemoryBytes: 4096 });
    expect(done?.type === 'shard-complete' && done.result.success).toBe(true);
  });

  it('should elide the compiled module before posting a result', async () => {
    const host = startHost({ '/a.geospec.ts': passingSpec('a') });

    const replies = await host.send({ type: 'run-shard', shard: { id: 0, file: '/a.geospec.ts' } });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(done?.type === 'shard-complete' && done.result.bundle?.code).toBe('');
  });

  it('should honour a split shard pattern over the run-wide one', async () => {
    const host = startHost({ '/a.geospec.ts': twoTests });

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 0, file: '/a.geospec.ts', testNamePattern: '^suite > two$' },
      testNamePattern: '^suite > one$',
    });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(
      done?.type === 'shard-complete' && done.result.success && done.result.tests.map((test) => test.name),
    ).toStrictEqual(['two']);
  });

  it('should apply the run-wide pattern when a shard names none', async () => {
    const host = startHost({ '/a.geospec.ts': twoTests });

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 0, file: '/a.geospec.ts' },
      testNamePattern: '^suite > one$',
      testTimeout: 5000,
    });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(
      done?.type === 'shard-complete' && done.result.success && done.result.tests.map((test) => test.name),
    ).toStrictEqual(['one']);
  });

  it('should list a file without running any body', async () => {
    const host = startHost({ '/a.geospec.ts': failingSpec('never runs') });

    const replies = await host.send({ type: 'list-tests', shardId: 3, file: '/a.geospec.ts', testTimeout: 100 });

    expect(replies[0]).toStrictEqual({
      type: 'tests-listed',
      shardId: 3,
      file: '/a.geospec.ts',
      names: ['never runs > fails'],
    });
  });

  it('should apply resolved forensic and matcher limits to a collection pass', async () => {
    const host = startHost({ '/a.geospec.ts': passingSpec('listed') });

    const replies = await host.send({
      type: 'list-tests',
      shardId: 4,
      file: '/a.geospec.ts',
      matcherWallBackstop: 1000,
      forensic: true,
    });

    expect(replies[0]).toMatchObject({ type: 'tests-listed', shardId: 4 });
  });

  it('should list nothing for a file that could not be collected', async () => {
    const host = startHost({});

    const replies = await host.send({ type: 'list-tests', shardId: 1, file: '/missing.geospec.ts' });

    expect(replies[0]).toMatchObject({ type: 'tests-listed', names: [] });
  });

  it('should dispose the run-wide scope exactly once, on shutdown', async () => {
    const onShutdown = vi.fn(async () => undefined);
    const host = startHost({ '/a.geospec.ts': passingSpec('a') }, { onShutdown });

    await host.send({ type: 'run-shard', shard: { id: 0, file: '/a.geospec.ts' } });
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
      filesystem: memoryFileSystem({ '/a.geospec.ts': passingSpec('a') }),
      projectPath: '/',
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

    deliver?.({ type: 'run-shard', shard: { id: 5, file: '/a.geospec.ts' } });
    await vi.waitFor(
      () => {
        expect(posted.some((message) => message.type === 'shard-error')).toBe(true);
      },
      { timeout: 30_000 },
    );

    expect(posted.at(-1)).toStrictEqual({
      type: 'shard-error',
      shardId: 5,
      file: '/a.geospec.ts',
      message: 'could not be cloned',
    });
  });

  it('should report a collection pass whose reply could not be posted', async () => {
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;
    startGeoSpecPoolWorkerHost({
      filesystem: memoryFileSystem({ '/a.geospec.ts': passingSpec('a') }),
      projectPath: '/',
      postMessage: (message) => {
        if (message.type === 'tests-listed') {
          // A non-Error throw: the host must still name it.
          // oxlint-disable-next-line typescript/only-throw-error -- a worker that throws a non-Error is exactly the case under test.
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- same.
          throw 'not an Error';
        }
        posted.push(message);
      },
      onHostMessage: (listener) => {
        deliver = listener;
      },
    });

    deliver?.({ type: 'list-tests', shardId: 2, file: '/a.geospec.ts' });
    await vi.waitFor(
      () => {
        expect(posted.some((message) => message.type === 'list-error')).toBe(true);
      },
      { timeout: 30_000 },
    );

    expect(posted.at(-1)).toMatchObject({ type: 'list-error', shardId: 2, message: 'not an Error' });
  });

  it('should carry the worker-lifetime loaders and report the affinity key', async () => {
    const subject = await loadedSubject();
    const host = startHost(
      {
        '/a.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          import { tag } from 'project/extra';
          describe('deps', () => {
            it('loads', async () => { await loadModel({ file: 'main.ts' }); if (tag !== 'ok') throw new Error(tag); });
          });
        `,
      },
      {
        modelLoader: async () => exposeEngineSubject(subject),
        stepLoader: async () => exposeEngineSubject(subject),
        builtinModules: { 'project/extra': { version: '1', code: "export const tag = 'ok';" } },
      },
    );

    const replies = await host.send({ type: 'run-shard', shard: { id: 0, file: '/a.geospec.ts' } });
    const done = replies.find((message) => message.type === 'shard-complete');

    expect(done?.type === 'shard-complete' && done.result.success && done.result.passed).toBe(true);
    expect(done?.type === 'shard-complete' && typeof done.primaryLoadKey).toBe('string');
    expect(done?.type === 'shard-complete' && done.workerMemoryBytes).toBeUndefined();
  });

  it('should load identical model options once across shards on one worker', async () => {
    const source = `
      import { describe, it } from 'geospec';
      import { loadModel } from 'geospec/model';
      describe('cache', () => {
        it('loads', async () => { await loadModel({ file: 'assembly.ts', format: 'step', mesh: false }); });
      });
    `;
    const subject = await loadedSubject();
    const modelLoader = vi.fn(async () => exposeEngineSubject(subject));
    const host = startHost({ '/a.geospec.ts': source, '/b.geospec.ts': source }, { modelLoader });

    await host.send({ type: 'run-shard', shard: { id: 0, file: '/a.geospec.ts' } });
    await host.send({ type: 'run-shard', shard: { id: 1, file: '/b.geospec.ts' } });

    expect(modelLoader).toHaveBeenCalledTimes(1);
  });

  it('should forward observed matcher spans with the shard identity', async () => {
    const model = await loadedSubject();
    const host = startHost(
      {
        '/forensic.geospec.ts': `
          import { describe, expectGeo, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          describe('forensic', () => {
            it('measures', async () => {
              const model = await loadModel({ file: 'main.ts' });
              expectGeo(model).toHaveVolume({ value: 0 });
            });
          });
        `,
      },
      { modelLoader: async () => exposeEngineSubject(model) },
    );

    const replies = await host.send({
      type: 'run-shard',
      shard: { id: 9, file: '/forensic.geospec.ts' },
      testTimeout: 5000,
      matcherWallBackstop: 1000,
      forensic: true,
    });

    expect(
      replies.some(
        (reply) =>
          reply.type === 'forensic' &&
          reply.shardId === 9 &&
          reply.name === 'engine.claims' &&
          typeof reply.value === 'number' &&
          reply.unit === 'milliseconds',
      ),
    ).toBe(true);
  });
});
