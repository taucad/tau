import { describe, expect, it, vi } from 'vitest';

import { CacheCorruptionError, CacheRequiredError } from '#errors.js';
import { createComputeReuseService } from '#compute-reuse.js';
import { contentDigest, digestAction, digestContent } from '#digest.js';
import { createMemoryActionStore, createMemoryContentStore } from '#memory-store.js';
import { unsupportedCacheMaintenance } from '#store.js';
import type { CacheCodec, ComputeAction } from '#types.js';
import type { ActionStore, ContentStore } from '#store.js';

const textCodec: CacheCodec<string> = {
  id: 'text/plain',
  version: '1',
  mediaType: 'text/plain;charset=utf-8',
  encode: async ({ value }) => new TextEncoder().encode(value),
  decode: async ({ bytes }) => new TextDecoder().decode(bytes),
};

const action: ComputeAction = {
  schemaVersion: 1,
  namespace: 'test.kernel',
  producer: { id: 'test', version: '1', implementationAssets: [] },
  operation: 'solve',
  inputs: [],
  arguments: { parameter: 2 },
  environment: null,
  codec: { id: textCodec.id, version: textCodec.version },
};

const createService = () => {
  const contentStore = createMemoryContentStore({ maxBytes: 4096 });
  const actionStore = createMemoryActionStore({ maxBytes: 4096 });
  return { contentStore, actionStore, service: createComputeReuseService({ contentStore, actionStore }) };
};

describe('ComputeReuseService', () => {
  it('publishes content before the action and reuses the completed result', async () => {
    const { actionStore, contentStore, service } = createService();
    const compute = vi.fn(async () => 'solved');
    const first = await service.evaluate({ action, codec: textCodec, policy: 'required', compute });
    const second = await service.evaluate({ action, codec: textCodec, policy: 'required', compute });

    expect(first).toMatchObject({ source: 'computed', publication: { status: 'stored' } });
    expect(second).toMatchObject({ source: 'cache', value: 'solved' });
    expect(compute).toHaveBeenCalledTimes(1);
    const actionStatistics = await actionStore.maintenance.inspect({});
    const contentStatistics = await contentStore.maintenance.inspect({});
    expect(actionStatistics.status).toBe('supported');
    expect(contentStatistics.status).toBe('supported');
  });

  it('reuses a deterministic BRep meshing prefix and recomputes only affected descendants', async () => {
    const { service } = createService();
    const source = contentDigest({ value: `sha256:${'4'.repeat(64)}` });
    const invocations = { repair: 0, tessellate: 0, package: 0 };
    const evaluatePipeline = async (options: { readonly linearTolerance: number }) => {
      const repair = await service.evaluate({
        action: {
          schemaVersion: 1,
          namespace: 'test.brep-mesher',
          producer: { id: 'test-mesher', version: '1', implementationAssets: [] },
          operation: 'repair',
          inputs: [{ kind: 'content', role: 'brep', digest: source }],
          arguments: { tolerance: 0.001 },
          environment: null,
          codec: { id: textCodec.id, version: textCodec.version },
        },
        codec: textCodec,
        policy: 'required',
        compute: async () => {
          invocations.repair += 1;
          return 'repaired-brep';
        },
      });
      const tessellation = await service.evaluate({
        action: {
          schemaVersion: 1,
          namespace: 'test.brep-mesher',
          producer: { id: 'test-mesher', version: '1', implementationAssets: [] },
          operation: 'tessellate',
          inputs: [{ kind: 'action', role: 'repaired-brep', digest: repair.actionDigest }],
          arguments: { linearTolerance: options.linearTolerance, angularTolerance: 0.1 },
          environment: null,
          codec: { id: textCodec.id, version: textCodec.version },
        },
        codec: textCodec,
        policy: 'required',
        compute: async () => {
          invocations.tessellate += 1;
          return `${repair.value}:mesh:${String(options.linearTolerance)}`;
        },
      });
      const packaged = await service.evaluate({
        action: {
          schemaVersion: 1,
          namespace: 'test.brep-mesher',
          producer: { id: 'test-mesher', version: '1', implementationAssets: [] },
          operation: 'package-glb',
          inputs: [{ kind: 'action', role: 'mesh', digest: tessellation.actionDigest }],
          arguments: { format: 'glb', version: 2 },
          environment: null,
          codec: { id: textCodec.id, version: textCodec.version },
        },
        codec: textCodec,
        policy: 'required',
        compute: async () => {
          invocations.package += 1;
          return `${tessellation.value}:glb-v2`;
        },
      });
      return { repair, tessellation, packaged };
    };

    const cold = await evaluatePipeline({ linearTolerance: 0.2 });
    const edited = await evaluatePipeline({ linearTolerance: 0.05 });
    const warm = await evaluatePipeline({ linearTolerance: 0.05 });

    expect([cold.repair.source, cold.tessellation.source, cold.packaged.source]).toEqual([
      'computed',
      'computed',
      'computed',
    ]);
    expect([edited.repair.source, edited.tessellation.source, edited.packaged.source]).toEqual([
      'cache',
      'computed',
      'computed',
    ]);
    expect([warm.repair.source, warm.tessellation.source, warm.packaged.source]).toEqual(['cache', 'cache', 'cache']);
    expect(invocations).toEqual({ repair: 1, tessellate: 2, package: 2 });
    expect(edited.repair.actionDigest).toBe(cold.repair.actionDigest);
    expect(edited.tessellation.actionDigest).not.toBe(cold.tessellation.actionDigest);
    expect(edited.packaged.value).toBe('repaired-brep:mesh:0.05:glb-v2');
    expect(warm.packaged.value).toBe(edited.packaged.value);
    if (
      warm.packaged.source !== 'cache' ||
      edited.packaged.source !== 'computed' ||
      edited.packaged.publication.status !== 'stored'
    ) {
      expect.fail('The edited terminal stage must publish and the warm run must restore it.');
    }
    expect(warm.packaged.contentDigest).toBe(edited.packaged.publication.contentDigest);
  });

  it('never publishes an action when content publication fails', async () => {
    const published = vi.fn();
    const contentStore: ContentStore = {
      read: async () => ({ status: 'miss' }),
      write: async () => {
        throw new Error('disk full');
      },
      maintenance: unsupportedCacheMaintenance,
    };
    const actionStore: ActionStore = {
      read: async () => ({ status: 'miss' }),
      publish: async ({ record }) => {
        published(record);
        return { status: 'published' };
      },
      maintenance: unsupportedCacheMaintenance,
    };
    const service = createComputeReuseService({ contentStore, actionStore });

    await expect(
      service.evaluate({ action, codec: textCodec, policy: 'best-effort', compute: async () => 'ok' }),
    ).resolves.toMatchObject({ source: 'computed', publication: { status: 'skipped' } });
    expect(published).not.toHaveBeenCalled();

    await expect(
      service.evaluate({ action, codec: textCodec, policy: 'required', compute: async () => 'ok' }),
    ).rejects.toBeInstanceOf(CacheRequiredError);
    expect(published).not.toHaveBeenCalled();
  });

  it('does not write any cache state when computation fails', async () => {
    const contentWrite = vi.fn();
    const actionPublish = vi.fn();
    const contentStore: ContentStore = {
      read: async () => ({ status: 'miss' }),
      write: async (input) => {
        contentWrite(input);
        return { status: 'stored' };
      },
      maintenance: unsupportedCacheMaintenance,
    };
    const actionStore: ActionStore = {
      read: async () => ({ status: 'miss' }),
      publish: async (input) => {
        actionPublish(input);
        return { status: 'published' };
      },
      maintenance: unsupportedCacheMaintenance,
    };
    const service = createComputeReuseService({ contentStore, actionStore });

    await expect(
      service.evaluate({
        action,
        codec: textCodec,
        policy: 'required',
        compute: async () => {
          throw new Error('solve failed');
        },
      }),
    ).rejects.toThrow('solve failed');
    expect(contentWrite).not.toHaveBeenCalled();
    expect(actionPublish).not.toHaveBeenCalled();
  });

  it('treats corrupted content as a miss in best-effort mode and an error in required mode', async () => {
    const actionKey = await digestAction({ action });
    const expectedBytes = new TextEncoder().encode('expected');
    const expectedDigest = await digestContent({ bytes: expectedBytes });
    const record = {
      schemaVersion: 1,
      actionDigest: actionKey,
      codec: { id: textCodec.id, version: textCodec.version },
      output: { digest: expectedDigest, size: expectedBytes.byteLength, mediaType: textCodec.mediaType },
      dependencies: [],
    } as const;
    const actionStore: ActionStore = {
      read: async () => ({ status: 'hit', record }),
      publish: async () => ({ status: 'existing' }),
      maintenance: unsupportedCacheMaintenance,
    };
    const contentStore: ContentStore = {
      read: async () => ({ status: 'hit', bytes: new TextEncoder().encode('poison') }),
      write: async () => ({ status: 'stored' }),
      maintenance: unsupportedCacheMaintenance,
    };
    const service = createComputeReuseService({ contentStore, actionStore });
    const compute = vi.fn(async () => 'recomputed');

    await expect(service.evaluate({ action, codec: textCodec, policy: 'best-effort', compute })).resolves.toMatchObject(
      { source: 'computed', value: 'recomputed' },
    );
    expect(compute).toHaveBeenCalledOnce();

    await expect(service.evaluate({ action, codec: textCodec, policy: 'required', compute })).rejects.toBeInstanceOf(
      CacheCorruptionError,
    );
    expect(compute).toHaveBeenCalledOnce();
  });

  it('singleflights concurrent evaluations and lets one waiter cancel independently', async () => {
    const { service } = createService();
    let release!: (value: string) => void;
    const work = new Promise<string>((resolve) => {
      release = resolve;
    });
    const compute = vi.fn(async () => work);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = service.evaluate({
      action,
      codec: textCodec,
      policy: 'required',
      signal: firstController.signal,
      compute,
    });
    const second = service.evaluate({
      action,
      codec: textCodec,
      policy: 'required',
      signal: secondController.signal,
      compute,
    });
    firstController.abort(new DOMException('cancelled', 'AbortError'));
    release('shared');

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toMatchObject({ value: 'shared' });
    expect(compute).toHaveBeenCalledOnce();
  });

  it('aborts shared work only after every waiter cancels', async () => {
    const { service } = createService();
    let producerSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const compute = vi.fn(
      async ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          producerSignal = signal;
          markStarted();
          signal.addEventListener(
            'abort',
            () => {
              reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
            },
            { once: true },
          );
        }),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = service.evaluate({
      action,
      codec: textCodec,
      policy: 'required',
      signal: firstController.signal,
      compute,
    });
    const second = service.evaluate({
      action,
      codec: textCodec,
      policy: 'required',
      signal: secondController.signal,
      compute,
    });

    await started;
    expect(compute).toHaveBeenCalledOnce();
    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(producerSignal?.aborted).toBe(false);
    secondController.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(producerSignal?.aborted).toBe(true);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('rejects a codec whose identity differs from the action key', async () => {
    const { service } = createService();

    await expect(
      service.evaluate({
        action,
        codec: { ...textCodec, version: '2' },
        policy: 'best-effort',
        compute: async () => 'unused',
      }),
    ).rejects.toThrow('codec');
  });
});
