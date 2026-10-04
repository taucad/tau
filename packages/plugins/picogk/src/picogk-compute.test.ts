import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CacheRequiredError,
  canonicalizeComputeAction,
  contentDigest,
  digestAction,
  digestContent,
} from '@taucad/cache-core';
import type { ComputeAction } from '@taucad/cache-core';
import type {
  ComputeGeneration,
  ComputeStoreEntry,
  ComputeReuseScope,
  ComputeScopeSettlement,
  KernelComputeCapability,
} from '@taucad/runtime/kernel';
import { decodeStoredEnvelope, encodeStoredEnvelope } from '#compute-stored-envelope.js';
import { createComputeWorkerTransport } from '#compute-worker-transport.js';
import { createPicogkComputeReuse } from '#picogk-compute-reuse.js';
import {
  computeNamespace,
  createCanonicalFragments,
  floatBits,
  readComputeManifest,
  validateCanonicalFragments,
  validateComputeAction,
  validateLayoutBytes,
  validateMeshBytes,
} from '#picogk-compute-contract.js';

const asset = contentDigest({ value: `sha256:${'a'.repeat(64)}` });
const producer = { id: 'picogk-test', version: '1', implementationAssets: [asset] };
const environment = { arithmetic: 'float32-ordered', profile: 'test' };
const options = { producer, environment, maxEncodedBytes: 1_000_000, maxNativeBytes: 1_000_000, maxEntries: 8 };
const { signal } = new AbortController();
const roots: string[] = [];
const temporary = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-picogk-compute-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});
const makeRecord = async (value = 1): Promise<ComputeStoreEntry & { nativeBytes: number; computeDuration: number }> => {
  const action: ComputeAction = {
    schemaVersion: 1,
    namespace: computeNamespace,
    producer,
    environment,
    operation: 'voxels.sign-equal',
    inputs: [
      { kind: 'content', role: 'left', digest: asset },
      { kind: 'content', role: 'right', digest: asset },
    ],
    arguments: {},
    codec: { id: 'picogk.bool', version: '2' },
  };
  const bytes = encodeStoredEnvelope({
    body: new Uint8Array([value]),
    family: 'bool',
    nativeAllowance: 0,
    maximumEncoded: 1024,
  });
  return {
    action,
    bytes,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes }),
    mediaType: 'application/vnd.picogk.bool',
    determinism: 'byte-exact',
    nativeBytes: 0,
    computeDuration: 3,
  };
};
// A public scope contract fixture: its deferred tail makes retirement and required errors observable.
const capabilityFixture = (generation = 1, warmFailure?: Error) => {
  const tail = Promise.withResolvers<ComputeScopeSettlement>();
  const close = vi.fn<ComputeReuseScope['close']>(() => ({ settled: tail.promise }));
  const scope: ComputeReuseScope = {
    generation: generation as ComputeGeneration,
    warm: vi.fn<ComputeReuseScope['warm']>(async () => {
      if (warmFailure) {
        throw warmFailure;
      }
      return { status: 'imported', imported: [], omitted: [], bytes: 0 };
    }),
    announce: vi.fn<ComputeReuseScope['announce']>(({ entries }) => ({
      admitted: entries.flatMap((entry) =>
        entry.kind === 'action' && entry.computeDuration >= 1 ? [entry.digest] : [],
      ),
      rejected: [],
    })),
    close,
  };
  const compute: KernelComputeCapability = {
    status: 'on',
    mode: 'memory',
    evaluate: vi.fn(),
    openScope: vi.fn(() => scope),
  };
  return {
    compute,
    scope,
    close,
    tail,
    settle: () => {
      tail.resolve({ status: 'published', published: [], omitted: [], conflicts: [] });
    },
  };
};
const writeManifest = async (root: string, records: Array<Awaited<ReturnType<typeof makeRecord>>>) => {
  const wire = await Promise.all(
    records.map(async (record) => {
      const filename = `${record.contentDigest.slice(7)}.bool`;
      await writeFile(join(root, filename), record.bytes);
      const { bytes, ...entry } = record;
      return { ...entry, canonicalAction: canonicalizeComputeAction(record.action), filename, size: bytes.byteLength };
    }),
  );
  const manifest = {
    version: 1,
    generation: 1,
    producer,
    environment,
    ...createCanonicalFragments(options),
    records: wire,
  };
  const path = join(root, 'result.json');
  await writeFile(path, JSON.stringify(manifest));
  return { path, manifest, context: { sessionRoot: root, generation: 1, ...options, signal } };
};

describe('PicoGK persisted framing and operation contracts', () => {
  it.each(['vdb', 'mesh', 'bool', 'layout'] as const)(
    'should retain a bounded body view and exact allowance for %s',
    (family) => {
      const nativeAllowance = family === 'vdb' || family === 'mesh' ? 64 : 0;
      const bytes = encodeStoredEnvelope({
        body: new Uint8Array([0, 1, 2]),
        family,
        nativeAllowance,
        maximumEncoded: 67,
      });
      const decoded = decodeStoredEnvelope({ bytes, family, maximumEncoded: 67, maximumNative: 64 });
      expect(decoded.body).toEqual(new Uint8Array([0, 1, 2]));
      expect(decoded.body.buffer).toBe(bytes.buffer);
      expect(decoded.nativeAllowance).toBe(nativeAllowance);
      expect(decoded.semanticBodyDigest).toMatch(/^sha256:[a-f\d]{64}$/u);
    },
  );
  it('should reject wrong framing, family, flags, SHA and overflow before exposing a body', () => {
    const bytes = encodeStoredEnvelope({
      body: new Uint8Array([1]),
      family: 'bool',
      nativeAllowance: 0,
      maximumEncoded: 65,
    });
    for (const offset of [0, 8, 12, 16, 24, 32, 64]) {
      const corrupt = new Uint8Array(bytes);
      corrupt[offset] = (corrupt[offset] ?? 0) + 1;
      expect(() =>
        decodeStoredEnvelope({ bytes: corrupt, family: 'bool', maximumEncoded: 65, maximumNative: 64 }),
      ).toThrow(TypeError);
    }
    expect(() => decodeStoredEnvelope({ bytes, family: 'mesh', maximumEncoded: 65, maximumNative: 0 })).toThrow(
      TypeError,
    );
    expect(() => decodeStoredEnvelope({ bytes, family: 'bool', maximumEncoded: 64, maximumNative: 0 })).toThrow(
      TypeError,
    );
    expect(() =>
      encodeStoredEnvelope({ body: bytes, family: 'bool', nativeAllowance: -1, maximumEncoded: 1000 }),
    ).toThrow(TypeError);
    expect(() => encodeStoredEnvelope({ body: bytes, family: 'bool', nativeAllowance: 0, maximumEncoded: 64 })).toThrow(
      TypeError,
    );
    expect(() => decodeStoredEnvelope({ bytes, family: 'bool', maximumEncoded: Number.NaN, maximumNative: 0 })).toThrow(
      TypeError,
    );
  });
  it('should retain float32 signs, rounding and distinct algorithm identities', async () => {
    expect(floatBits(-0)).toBe('80000000');
    expect(floatBits(0)).toBe('00000000');
    expect(floatBits(1 / 3)).toBe('3eaaaaab');
    expect(() => floatBits(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => floatBits(Number.MAX_VALUE)).toThrow(TypeError);
    const { action } = await makeRecord();
    expect(() => {
      validateComputeAction(action);
    }).not.toThrow();
    expect(() => {
      validateComputeAction({
        ...action,
        inputs: [...action.inputs]
          .reverse()
          .map((operand, index) => ({ ...operand, role: index === 0 ? 'right' : 'left' })),
      });
    }).toThrow(TypeError);
    expect(() => {
      validateComputeAction({ ...action, arguments: { callback: true } });
    }).toThrow();
    expect(() => {
      validateComputeAction({ ...action, codec: { id: 'picogk.layout', version: '2' } });
    }).toThrow(TypeError);
    const fragments = createCanonicalFragments({ producer, environment: { 日本: 'é', value: [true, null, 1e-7] } });
    expect(() => {
      validateCanonicalFragments({ producer, environment: { 日本: 'é', value: [true, null, 1e-7] }, ...fragments });
    }).not.toThrow();
    expect(() => {
      validateCanonicalFragments({ producer, environment, ...fragments });
    }).toThrow(TypeError);
  });
  it('should reject invalid mesh placement, index topology and layout stability while preserving infinity sentinels', () => {
    const mesh = new Uint8Array(84 + 36 + 12),
      view = new DataView(mesh.buffer);
    view.setUint32(0, 0x31_50_4b_50, true);
    view.setUint32(4, 1, true);
    view.setUint32(8, 3, true);
    view.setUint32(12, 3, true);
    for (let index = 0; index < 16; index++) {
      view.setFloat32(20 + index * 4, index % 5 === 0 ? 1 : 0, true);
    }
    expect(() => {
      validateMeshBytes(mesh);
    }).not.toThrow();
    view.setUint32(120, 3, true);
    expect(() => {
      validateMeshBytes(mesh);
    }).toThrow(TypeError);
    view.setUint32(120, 0, true);
    view.setFloat32(32, 1, true);
    expect(() => {
      validateMeshBytes(mesh);
    }).toThrow(TypeError);
    const layout = new Uint8Array(64),
      layoutView = new DataView(layout.buffer);
    layout.set(new TextEncoder().encode('PKLAY001'));
    layoutView.setUint32(8, 1, true);
    layoutView.setUint32(12, 1, true);
    layoutView.setFloat32(40, Number.POSITIVE_INFINITY, true);
    expect(() => {
      validateLayoutBytes(layout);
    }).not.toThrow();
    layoutView.setFloat32(40, Number.NaN, true);
    expect(() => {
      validateLayoutBytes(layout);
    }).toThrow(TypeError);
    layoutView.setFloat32(40, 0, true);
    layoutView.setUint32(16, 3, true);
    expect(() => {
      validateLayoutBytes(layout);
    }).toThrow(TypeError);
  });
  it('should reject foreign, duplicate, mismatched, symlinked and corrupt manifests atomically', async () => {
    const root = await temporary(),
      foreign = await temporary(),
      record = await makeRecord();
    const fixture = await writeManifest(root, [record]);
    expect(await readComputeManifest(fixture)).toEqual([record]);
    const outside = await writeManifest(foreign, [record]);
    await expect(readComputeManifest({ ...fixture, path: outside.path })).rejects.toThrow(TypeError);
    await writeFile(fixture.path, JSON.stringify({ ...fixture.manifest, generation: 2 }));
    await expect(readComputeManifest(fixture)).rejects.toThrow(TypeError);
    await writeFile(
      fixture.path,
      JSON.stringify({ ...fixture.manifest, records: [...fixture.manifest.records, ...fixture.manifest.records] }),
    );
    await expect(readComputeManifest(fixture)).rejects.toThrow(TypeError);
    await writeFile(fixture.path, JSON.stringify(fixture.manifest));
    const filename = fixture.manifest.records[0]?.filename;
    if (!filename) {
      throw new Error('Missing record');
    }
    await writeFile(join(root, filename), new Uint8Array(record.bytes.length));
    await expect(readComputeManifest(fixture)).rejects.toThrow(TypeError);
    await rm(join(root, filename));
    await symlink(join(foreign, filename), join(root, filename));
    await expect(readComputeManifest(fixture)).rejects.toThrow(TypeError);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      readComputeManifest({ ...fixture, context: { ...fixture.context, signal: cancelled.signal } }),
    ).rejects.toThrow();
  });
});

describe('PicoGK bounded resident binding and lifecycle', () => {
  it('should preserve late export bytes through disposal and release them at the returned settlement boundary', async () => {
    const adapter = createPicogkComputeReuse(options),
      fixture = capabilityFixture(),
      record = await makeRecord();
    const job = await adapter.openJob({ compute: fixture.compute, signal });
    if (!job) {
      throw new Error('Missing job');
    }
    expect(await job.acceptDelivered([record])).toEqual([record.actionDigest]);
    record.bytes.fill(0);
    const receipt = job.finish('delivered');
    adapter.dispose();
    expect(adapter.resident.stats().encodedBytes).toEqual({ status: 'known', bytes: 65 });
    const exported = await adapter.resident.exportEntries({ digests: [record.actionDigest], signal });
    expect(
      decodeStoredEnvelope({
        bytes: exported.entries[0]?.bytes ?? new Uint8Array(),
        family: 'bool',
        maximumEncoded: 1024,
        maximumNative: 0,
      }).body,
    ).toEqual(new Uint8Array([1]));
    fixture.settle();
    await receipt.settled;
    expect(adapter.resident.stats().encodedBytes).toEqual({ status: 'known', bytes: 0 });
    await expect(adapter.openJob({ compute: fixture.compute, signal })).rejects.toThrow('disposed');
  });
  it('should rollback failed output and fence a clear or cancellation before delivery', async () => {
    const adapter = createPicogkComputeReuse(options),
      fixture = capabilityFixture(),
      record = await makeRecord();
    const job = await adapter.openJob({ compute: fixture.compute, signal });
    if (!job) {
      throw new Error('Missing job');
    }
    await job.acceptDelivered([record]);
    const receipt = job.finish('failed');
    expect(adapter.resident.contains({ digest: record.actionDigest })).toBe(false);
    fixture.settle();
    await receipt.settled;
    const nextFixture = capabilityFixture(),
      next = await adapter.openJob({ compute: nextFixture.compute, signal });
    if (!next) {
      throw new Error('Missing job');
    }
    adapter.resident.clear({ generation: 2 as ComputeGeneration });
    expect(next.signal.aborted).toBe(true);
    expect(() => next.preload()).toThrow();
    await expect(next.acceptDelivered([record])).rejects.toThrow();
    const closed = next.finish('cancelled');
    nextFixture.settle();
    await closed.settled;
    expect(adapter.resident.stats().logicalBytes).toBe(0);
    adapter.dispose();
  });
  it('should validate the whole batch before mutation and omit low-cost, conflicting or over-budget records', async () => {
    const adapter = createPicogkComputeReuse(options),
      fixture = capabilityFixture(),
      record = await makeRecord();
    const job = await adapter.openJob({ compute: fixture.compute, signal });
    if (!job) {
      throw new Error('Missing job');
    }
    await expect(job.acceptDelivered([record, record])).rejects.toThrow(TypeError);
    expect(adapter.resident.stats().entries).toBe(0);
    await expect(job.acceptDelivered([{ ...record, nativeBytes: -1 }])).rejects.toThrow(TypeError);
    expect(await job.acceptDelivered([{ ...record, computeDuration: 0 }])).toEqual([]);
    expect(await job.acceptDelivered([record])).toEqual([record.actionDigest]);
    const conflict = await makeRecord(0);
    expect(await job.acceptDelivered([conflict])).toEqual([]);
    expect(adapter.resident.stats().omissions).toBeGreaterThan(0);
    const result = await adapter.resident.importEntries({
      entries: [{ ...record, action: { ...record.action, producer: { ...producer, version: 'wrong' } } }],
      signal,
    });
    expect(result.omitted).toEqual([record.actionDigest]);
    const receipt = job.finish('delivered');
    fixture.settle();
    await receipt.settled;
    adapter.dispose();
    const small = createPicogkComputeReuse({ ...options, maxEncodedBytes: 65 });
    const omitted = await small.resident.importEntries({ entries: [record], signal });
    expect(omitted.omitted).toEqual([record.actionDigest]);
    small.dispose();
  });
  it('should return the off path without opening a scope and preserve required warm failures', async () => {
    const adapter = createPicogkComputeReuse(options);
    expect(await adapter.openJob({ compute: { status: 'off' }, signal })).toBeUndefined();
    const failure = new CacheRequiredError('required store unavailable'),
      fixture = capabilityFixture(1, failure);
    await expect(adapter.openJob({ compute: fixture.compute, signal })).rejects.toBe(failure);
    expect(fixture.close).toHaveBeenCalledWith({ outcome: 'failed' });
    fixture.settle();
    adapter.dispose();
    expect(() => createPicogkComputeReuse({ ...options, maxEntries: -1 })).toThrow(TypeError);
  });
});

describe('PicoGK generation and bounded eviction boundaries', () => {
  it('should evict the oldest distinct action and export omissions without losing the retained action', async () => {
    const adapter = createPicogkComputeReuse({ ...options, maxEntries: 1 });
    const first = await makeRecord();
    const action: ComputeAction = {
      ...first.action,
      inputs: [
        ...first.action.inputs.slice(0, 1),
        { kind: 'content', role: 'right', digest: contentDigest({ value: `sha256:${'b'.repeat(64)}` }) },
      ],
    };
    const second = { ...first, action, actionDigest: await digestAction({ action }) };
    const imported = await adapter.resident.importEntries({ entries: [first, second], signal });
    expect(imported.imported).toEqual([first.actionDigest, second.actionDigest]);
    expect(adapter.resident.stats().evictions).toBe(1);
    expect(adapter.resident.contains({ digest: first.actionDigest })).toBe(false);
    const exported = await adapter.resident.exportEntries({
      digests: [first.actionDigest, second.actionDigest],
      signal,
    });
    expect(exported.omitted).toEqual([first.actionDigest]);
    const repeated = await adapter.resident.importEntries({ entries: [second], signal });
    expect(repeated.imported).toEqual([second.actionDigest]);
    expect(adapter.resident.stats().entries).toBe(1);
    const wrongContent = await adapter.resident.importEntries({
      entries: [{ ...second, contentDigest: asset }],
      signal,
    });
    expect(wrongContent.omitted).toEqual([second.actionDigest]);
    const wrongAction = await adapter.resident.importEntries({
      entries: [{ ...second, actionDigest: first.actionDigest }],
      signal,
    });
    expect(wrongAction.omitted).toEqual([first.actionDigest]);
    adapter.dispose();
  });
  it('should reject stale scopes and abort active work when the adapter retires', async () => {
    const adapter = createPicogkComputeReuse(options);
    adapter.resident.clear({ generation: 2 as ComputeGeneration });
    const stale = capabilityFixture(1);
    await expect(adapter.openJob({ compute: stale.compute, signal })).rejects.toThrow('Stale');
    expect(stale.close).toHaveBeenCalledWith({ outcome: 'failed' });
    stale.settle();
    const fixture = capabilityFixture(2);
    const job = await adapter.openJob({ compute: fixture.compute, signal });
    if (!job) {
      throw new Error('Missing job');
    }
    adapter.dispose();
    expect(job.signal.aborted).toBe(true);
    expect(() => job.preload()).toThrow('disposed');
    const receipt = job.finish('cancelled');
    expect(() => job.finish('cancelled')).toThrow('already closed');
    fixture.settle();
    await receipt.settled;
  });
  it('should fence generation changes while an asynchronous import validates a record', async () => {
    const adapter = createPicogkComputeReuse(options);
    const record = await makeRecord();
    const pending = adapter.resident.importEntries({ entries: [record], signal });
    adapter.resident.clear({ generation: 2 as ComputeGeneration });
    expect(await pending).toEqual({ imported: [], omitted: [record.actionDigest] });
    expect(adapter.resident.stats().entries).toBe(0);
    adapter.dispose();
  });
});

describe('PicoGK worker request directory ownership', () => {
  it('should remove only each owned UUID directory before persistence settles and bound repeated Go requests', async () => {
    const root = await temporary(),
      transport = createComputeWorkerTransport(options);
    await writeFile(join(root, 'scene.bin'), new Uint8Array([3, 1, 4]));
    for (let iteration = 0; iteration < 12; iteration++) {
      const fixture = capabilityFixture();

      // oxlint-disable-next-line no-await-in-loop -- Each Go must finish ownership retirement before the next request.
      const job = await transport.open({ compute: fixture.compute, sessionRoot: root, signal });
      if (!job) {
        throw new Error('Missing job');
      }
      expect(job.request.preloadManifest).toMatch(/compute-[a-f\d-]{36}\/preload.json$/u);

      // oxlint-disable-next-line no-await-in-loop -- Retire each owned directory before inspecting the next one.
      const receipt = await job.delivered(undefined);

      // oxlint-disable-next-line no-await-in-loop -- Inspect the retired request before the next Go.
      const paths = await readdir(root);
      expect(paths.filter((name) => name.startsWith('compute-'))).toEqual([]);
      fixture.settle();

      // oxlint-disable-next-line no-await-in-loop -- Observe each retirement tail in order.
      await receipt.settled;
    }
    expect(new Uint8Array(await readFile(join(root, 'scene.bin')))).toEqual(new Uint8Array([3, 1, 4]));
    transport.dispose();
  });
  it('should publish validated bytes after delivery, omit corrupt optional results and clean cancelled requests', async () => {
    const root = await temporary(),
      transport = createComputeWorkerTransport(options),
      fixture = capabilityFixture();
    const job = await transport.open({ compute: fixture.compute, sessionRoot: root, signal });
    if (!job) {
      throw new Error('Missing job');
    }
    await writeManifest(join(job.request.preloadManifest, '..'), [await makeRecord()]);
    const delivered = await job.delivered(job.request.resultManifest);
    expect(delivered.omission).toBeUndefined();
    expect(transport.resident.stats().entries).toBe(1);
    fixture.settle();
    await delivered.settled;
    const corruptFixture = capabilityFixture(),
      corrupt = await transport.open({ compute: corruptFixture.compute, sessionRoot: root, signal });
    if (!corrupt) {
      throw new Error('Missing job');
    }
    const omitted = await corrupt.delivered(join(root, 'result.json'));
    expect(omitted.omission?.boundary).toBe('result');
    expect(corruptFixture.close).toHaveBeenCalledWith({ outcome: 'failed' });
    corruptFixture.settle();
    await omitted.settled;
    const cancel = new AbortController(),
      cancelFixture = capabilityFixture(),
      cancelled = await transport.open({ compute: cancelFixture.compute, sessionRoot: root, signal: cancel.signal });
    if (!cancelled) {
      throw new Error('Missing job');
    }
    cancel.abort(new Error('user cancelled'));
    await expect(cancelled.delivered(undefined)).rejects.toThrow('user cancelled');
    cancelFixture.settle();
    const paths = await readdir(root);
    expect(paths.filter((name) => name.startsWith('compute-'))).toEqual([]);
    transport.dispose();
  });
});
