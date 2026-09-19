import { describe, expect, it } from 'vitest';
import { actionDigest, contentDigest, digestContent } from '@taucad/cache-core';
import type { ComputeActionRecord } from '@taucad/cache-core';
import { runOwnerScopedStoreConformance } from '@taucad/cache-core/testing';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import {
  createProjectComputeStores,
  readProjectComputeIndex,
  writeProjectComputeIndex,
} from '#cache/project-compute-store.js';

const createFilesystem = (): KernelFileSystem => {
  const handle = _fromMemoryFsHandle();
  if (handle.kind !== 'inline') {
    throw new Error('Expected an inline memory filesystem.');
  }
  return createRuntimeFileSystem(handle.create());
};

const createRecord = (input: {
  readonly digest: ComputeActionRecord['actionDigest'];
  readonly output: ComputeActionRecord['output'];
}): ComputeActionRecord => ({
  schemaVersion: 1,
  actionDigest: input.digest,
  codec: { id: 'test.bytes', version: '1' },
  output: input.output,
  dependencies: [],
});

describe('project compute store', () => {
  it('passes the shared owner-scoped store conformance suite', async () => {
    const primaryFilesystem = createFilesystem();
    const otherFilesystem = createFilesystem();

    await expect(
      runOwnerScopedStoreConformance({
        createStores: () => ({
          primary: createProjectComputeStores(primaryFilesystem),
          sameOwner: createProjectComputeStores(primaryFilesystem),
          otherOwner: createProjectComputeStores(otherFilesystem),
        }),
      }),
    ).resolves.toBeUndefined();
  });

  it('persists immutable content and action records across store instances', async () => {
    const filesystem = createFilesystem();
    const bytes = new Uint8Array([1, 2, 3]);
    const outputDigest = await digestContent({ bytes });
    const key = actionDigest({ value: `sha256:${'1'.repeat(64)}` });
    const first = createProjectComputeStores(filesystem);

    expect(await first.contentStore.write({ digest: outputDigest, bytes })).toEqual({ status: 'stored' });
    const record = createRecord({
      digest: key,
      output: { digest: outputDigest, size: bytes.byteLength, mediaType: 'application/octet-stream' },
    });
    expect(await first.actionStore.publish({ record })).toEqual({ status: 'published' });

    bytes[0] = 99;
    const second = createProjectComputeStores(filesystem);
    const content = await second.contentStore.read({ digest: outputDigest });
    expect(content).toEqual({ status: 'hit', bytes: new Uint8Array([1, 2, 3]) });
    if (content.status === 'hit') {
      content.bytes[1] = 99;
    }
    expect(await second.contentStore.read({ digest: outputDigest })).toEqual({
      status: 'hit',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(await second.actionStore.read({ digest: key })).toEqual({ status: 'hit', record });
  });

  it('publishes actions only after their exact content exists', async () => {
    const stores = createProjectComputeStores(createFilesystem());
    const record = createRecord({
      digest: actionDigest({ value: `sha256:${'2'.repeat(64)}` }),
      output: {
        digest: contentDigest({ value: `sha256:${'3'.repeat(64)}` }),
        size: 3,
        mediaType: 'application/octet-stream',
      },
    });

    await expect(stores.actionStore.publish({ record })).rejects.toThrow(
      'Cannot publish an action before its referenced content exists.',
    );
  });

  it('rejects corrupt durable bytes instead of returning them', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([4, 5, 6]);
    const digest = await digestContent({ bytes });
    await stores.contentStore.write({ digest, bytes });
    const hexadecimal = digest.slice('sha256:'.length);
    await filesystem.writeFile(
      `.tau/cache/compute/v1/blobs/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}`,
      new Uint8Array([9]),
    );

    await expect(stores.contentStore.read({ digest })).rejects.toThrow(
      'Project cache content does not match its digest.',
    );
  });

  it('hashes opaque ref and lease identifiers instead of reconstructing filesystem paths', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    await stores.lifecycle.writeRef({
      scope: '../../outside',
      name: '/absolute/path',
      actionDigests: [],
      contentDigests: [],
    });
    await stores.lifecycle.renewLease({
      sessionId: '../../../foreign-session',
      actionDigests: [],
      contentDigests: [],
      expiresAt: Date.now() + 1000,
    });

    await expect(stores.lifecycle.readRef({ scope: '../../outside', name: '/absolute/path' })).resolves.toEqual({
      actionDigests: [],
      contentDigests: [],
    });
    await expect(filesystem.readdirStat('')).resolves.toEqual([expect.objectContaining({ name: '.tau' })]);
    await expect(filesystem.exists('outside')).resolves.toBe(false);
  });

  it('enforces byte bounds and exposes inspect and clear maintenance', async () => {
    const stores = createProjectComputeStores(createFilesystem(), { maxContentBytes: 2 });
    const bytes = new Uint8Array([7, 8, 9]);
    const digest = await digestContent({ bytes });
    expect(await stores.contentStore.write({ digest, bytes })).toEqual({
      status: 'rejected',
      reason: 'entry-too-large',
    });

    expect(stores.contentStore.maintenance.status).toBe('supported');
    if (stores.contentStore.maintenance.status === 'supported') {
      expect(await stores.contentStore.maintenance.inspect({})).toMatchObject({
        status: 'supported',
        statistics: { entries: 0, bytes: 0 },
      });
      expect(await stores.contentStore.maintenance.clear({})).toEqual({ status: 'cleared' });
    }
  });

  it('marks refs and their transitive action dependencies before sweeping orphans', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const childBytes = new Uint8Array([10]);
    const parentBytes = new Uint8Array([11]);
    const orphanBytes = new Uint8Array([12]);
    const childContent = await digestContent({ bytes: childBytes });
    const parentContent = await digestContent({ bytes: parentBytes });
    const orphanContent = await digestContent({ bytes: orphanBytes });
    const childAction = actionDigest({ value: `sha256:${'4'.repeat(64)}` });
    const parentAction = actionDigest({ value: `sha256:${'5'.repeat(64)}` });
    const orphanAction = actionDigest({ value: `sha256:${'6'.repeat(64)}` });

    await Promise.all([
      stores.contentStore.write({ digest: childContent, bytes: childBytes }),
      stores.contentStore.write({ digest: parentContent, bytes: parentBytes }),
      stores.contentStore.write({ digest: orphanContent, bytes: orphanBytes }),
    ]);
    await stores.actionStore.publish({
      record: { ...createRecord({ digest: childAction, output: { digest: childContent, size: 1, mediaType: 'x' } }) },
    });
    await stores.actionStore.publish({
      record: {
        ...createRecord({ digest: parentAction, output: { digest: parentContent, size: 1, mediaType: 'x' } }),
        dependencies: [childAction],
      },
    });
    await stores.actionStore.publish({
      record: createRecord({ digest: orphanAction, output: { digest: orphanContent, size: 1, mediaType: 'x' } }),
    });
    await stores.lifecycle.writeRef({
      scope: 'timeline',
      name: 'current',
      actionDigests: [parentAction],
      contentDigests: [],
    });
    await expect(stores.lifecycle.readRef({ scope: 'timeline', name: 'current' })).resolves.toEqual({
      actionDigests: [parentAction],
      contentDigests: [],
    });

    await expect(stores.lifecycle.collect({ gracePeriod: 0, now: Date.now() + 1 })).resolves.toMatchObject({
      status: 'collected',
      removedActions: 1,
      removedContent: 1,
    });
    await expect(stores.actionStore.read({ digest: parentAction })).resolves.toMatchObject({ status: 'hit' });
    await expect(stores.actionStore.read({ digest: childAction })).resolves.toMatchObject({ status: 'hit' });
    await expect(stores.actionStore.read({ digest: orphanAction })).resolves.toEqual({ status: 'miss' });
    await expect(stores.contentStore.read({ digest: orphanContent })).resolves.toEqual({ status: 'miss' });

    await stores.lifecycle.removeRef({ scope: 'timeline', name: 'current' });
    await expect(stores.lifecycle.readRef({ scope: 'timeline', name: 'current' })).resolves.toBeUndefined();
    await expect(stores.lifecycle.collect({ gracePeriod: 0, now: Date.now() + 2 })).resolves.toMatchObject({
      removedActions: 2,
      removedContent: 2,
    });
    await expect(stores.actionStore.read({ digest: parentAction })).resolves.toEqual({ status: 'miss' });
    await expect(stores.actionStore.read({ digest: childAction })).resolves.toEqual({ status: 'miss' });
  });

  it('keeps young unreachable entries until their grace period elapses', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([17]);
    const output = await digestContent({ bytes });
    const action = actionDigest({ value: `sha256:${'b'.repeat(64)}` });
    const createdAt = Date.now();
    await stores.contentStore.write({ digest: output, bytes });
    await stores.actionStore.publish({
      record: createRecord({ digest: action, output: { digest: output, size: 1, mediaType: 'x' } }),
    });

    await stores.lifecycle.collect({ gracePeriod: 1000, now: createdAt });
    await expect(stores.actionStore.read({ digest: action })).resolves.toMatchObject({ status: 'hit' });
    await stores.lifecycle.collect({ gracePeriod: 1000, now: createdAt + 1001 });
    await expect(stores.actionStore.read({ digest: action })).resolves.toEqual({ status: 'miss' });
  });

  it('preserves active leases and reclaims them after expiry', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([13]);
    const now = Date.now();
    const output = await digestContent({ bytes });
    const action = actionDigest({ value: `sha256:${'7'.repeat(64)}` });
    await stores.contentStore.write({ digest: output, bytes });
    await stores.actionStore.publish({
      record: createRecord({ digest: action, output: { digest: output, size: 1, mediaType: 'x' } }),
    });
    await stores.lifecycle.renewLease({
      sessionId: 'worker-session',
      actionDigests: [action],
      contentDigests: [],
      expiresAt: now + 200,
    });

    await stores.lifecycle.collect({ gracePeriod: 0, now: now + 100 });
    await expect(stores.actionStore.read({ digest: action })).resolves.toMatchObject({ status: 'hit' });

    await stores.lifecycle.collect({ gracePeriod: 0, now: now + 201 });
    await expect(stores.actionStore.read({ digest: action })).resolves.toEqual({ status: 'miss' });
    await expect(filesystem.exists('.tau/cache/compute/v1/leases')).resolves.toBe(false);
  });

  it('treats compute discovery indexes as durable refs', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([14]);
    const output = await digestContent({ bytes });
    const action = actionDigest({ value: `sha256:${'8'.repeat(64)}` });
    await stores.contentStore.write({ digest: output, bytes });
    await stores.actionStore.publish({
      record: createRecord({ digest: action, output: { digest: output, size: 1, mediaType: 'x' } }),
    });
    await writeProjectComputeIndex({
      filesystem,
      key: '9'.repeat(64),
      entries: [{ canonicalAction: '{}', actionDigest: action }],
    });

    await stores.lifecycle.collect({ gracePeriod: 0, now: Date.now() + 1 });
    await expect(stores.actionStore.read({ digest: action })).resolves.toMatchObject({ status: 'hit' });
    await expect(readProjectComputeIndex({ filesystem, key: '9'.repeat(64) })).resolves.toHaveLength(1);
  });

  it('restarts marking after an interrupted sweep instead of trusting stale reachability', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([15]);
    const output = await digestContent({ bytes });
    const action = actionDigest({ value: `sha256:${'a'.repeat(64)}` });
    await stores.contentStore.write({ digest: output, bytes });
    await stores.actionStore.publish({
      record: createRecord({ digest: action, output: { digest: output, size: 1, mediaType: 'x' } }),
    });

    const unlink = filesystem.unlink.bind(filesystem);
    let interrupt = true;
    filesystem.unlink = async (path) => {
      if (interrupt && path.includes('/actions/')) {
        interrupt = false;
        throw new Error('simulated interruption');
      }
      await unlink(path);
    };
    await expect(stores.lifecycle.collect({ gracePeriod: 0, now: Date.now() + 1 })).rejects.toThrow(
      'simulated interruption',
    );
    const interruptedState = await filesystem.readFile('.tau/cache/compute/v1/gc/state.json', 'utf8');
    expect(JSON.parse(interruptedState)).toMatchObject({ phase: 'sweeping' });
    await filesystem.writeFile('.tau/cache/compute/v1/gc/state.json', '{interrupted');

    await stores.lifecycle.writeRef({
      scope: 'bookmark',
      name: 'saved-after-interruption',
      actionDigests: [action],
      contentDigests: [],
    });
    await stores.lifecycle.collect({ gracePeriod: 0, now: Date.now() + 2 });
    await expect(stores.actionStore.read({ digest: action })).resolves.toMatchObject({ status: 'hit' });
    const completedState = await filesystem.readFile('.tau/cache/compute/v1/gc/state.json', 'utf8');
    expect(JSON.parse(completedState)).toMatchObject({ phase: 'idle' });
  });

  it('inspects and clears the complete project cache lifecycle', async () => {
    const filesystem = createFilesystem();
    const stores = createProjectComputeStores(filesystem);
    const bytes = new Uint8Array([16]);
    const digest = await digestContent({ bytes });
    await stores.contentStore.write({ digest, bytes });
    await stores.lifecycle.writeRef({
      scope: 'pin',
      name: 'one',
      actionDigests: [],
      contentDigests: [digest],
    });
    await stores.lifecycle.renewLease({
      sessionId: 'inspect',
      actionDigests: [],
      contentDigests: [digest],
      expiresAt: 100,
    });

    await expect(stores.lifecycle.inspect({})).resolves.toMatchObject({
      status: 'supported',
      content: { entries: 1, bytes: 1 },
      refs: 1,
      leases: 1,
    });
    await expect(stores.lifecycle.clear({})).resolves.toEqual({ status: 'cleared' });
    await expect(filesystem.exists('.tau/cache/compute/v1')).resolves.toBe(false);
  });
});
