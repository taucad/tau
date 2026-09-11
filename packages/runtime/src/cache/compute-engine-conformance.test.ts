/**
 * One conformance suite over every compute store engine.
 *
 * The memory, native SQLite and browser IndexedDB engines implement identical
 * A3/A4 types, so they are held to identical behaviour and the durable-only
 * gates are asserted as a typed refusal on the engine that cannot honour them
 * rather than skipped. Gate ids are the charter's (U13–U21, U24–U26, U34,
 * U37–U40, U44).
 */

/* oxlint-disable no-await-in-loop, unicorn/no-await-expression-member, no-loop-func -- these cells assert ordering: a batch is observed after the batch before it and a variant starts after the seed barrier, so the awaits are the sequence under test. */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestAction, digestContent } from '@taucad/cache-core';
import { revisionReserveFloorBytes } from '@taucad/filesystem';
import type { ActionDigest, CacheRetention, ComputeAction, ContentDigest } from '@taucad/cache-core';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbComputeEngine } from '#cache/indexeddb-compute-engine.js';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import type { ComputeStoreControl, ComputeStoreEngine, ComputeStoreEntry } from '#types/runtime-compute.types.js';

// The engine builds bounded cursor ranges from the standard global; the browser
// has it, and this Node run installs the polyfill's.
Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true, writable: true });

const retention = (name: string): CacheRetention => {
  const owner = { name };
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the host mints the brand; a test names an owner directly.
  return owner as unknown as CacheRetention;
};

/**
 * A measurable origin. Node exposes `navigator` as a getter-only global and
 * `fake-indexeddb` brings no `storage` of its own, so the property is redefined.
 */
const defineNavigator = (value: unknown): void => {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
};

const installOriginQuota = (...freeBytes: readonly number[]): void => {
  // Each measurement may report different free space, the way a real origin
  // does once bytes are reclaimed. The last value repeats.
  let index = 0;
  defineNavigator({
    storage: {
      estimate: async () => {
        const free = freeBytes[Math.min(index, freeBytes.length - 1)] ?? 0;
        index += 1;
        return { quota: free * 2, usage: free };
      },
      persisted: async () => true,
    },
  });
};

const removeOriginQuota = (): void => {
  defineNavigator(undefined);
};

const buildAction = (input: {
  readonly operation: string;
  readonly assets?: readonly ContentDigest[];
  readonly ancestors?: readonly ActionDigest[];
  readonly payloads?: readonly ContentDigest[];
}): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'conformance',
  producer: { id: 'engine-test', version: '1.0.0', implementationAssets: input.assets ?? [] },
  operation: input.operation,
  inputs: [
    ...(input.ancestors ?? []).map((digest, index) => ({ kind: 'action', role: `ancestor-${index}`, digest }) as const),
    ...(input.payloads ?? []).map((digest, index) => ({ kind: 'content', role: `payload-${index}`, digest }) as const),
  ],
  arguments: { operation: input.operation },
  environment: { platform: 'test' },
  codec: { id: 'raw', version: '1' },
});

const makeEntry = async (input: {
  readonly operation: string;
  readonly bytes: string;
  readonly determinism?: 'byte-exact' | 'equivalent';
  readonly ancestors?: readonly ActionDigest[];
  readonly payloads?: readonly ContentDigest[];
  readonly requiredContent?: readonly ContentDigest[];
}): Promise<ComputeStoreEntry> => {
  const action = buildAction({
    operation: input.operation,
    ...(input.ancestors === undefined ? {} : { ancestors: input.ancestors }),
    ...(input.payloads === undefined ? {} : { payloads: input.payloads }),
  });
  const bytes = new TextEncoder().encode(input.bytes);
  return {
    action,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes }),
    mediaType: 'application/octet-stream',
    bytes,
    ...(input.requiredContent === undefined ? {} : { requiredContent: input.requiredContent }),
    determinism: input.determinism ?? 'byte-exact',
  };
};

type Harness = {
  readonly engine: ComputeStoreEngine;
  readonly control: () => Promise<ComputeStoreControl>;
  /** Close every handle without discarding persisted data, then reopen (U37). */
  readonly restart: () => Promise<void>;
  readonly dispose: () => Promise<void>;
};

type EngineCase = {
  readonly name: string;
  /** Whether this backend can acknowledge required durability at all (D8). */
  readonly durable: boolean;
  readonly create: () => Promise<Harness>;
};

const workspace = 'conformance-workspace';
const directories: string[] = [];

const sqliteHarness = async (options: { readonly reserveBytes?: number } = {}): Promise<Harness> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-compute-'));
  directories.push(directory);
  let store = createSqliteComputeEngine({ directory, ...options });
  return {
    engine: { open: async (input) => store.engine.open(input) },
    control: async () => store.control({ workspace }),
    restart: async () => {
      await store.dispose();
      store = createSqliteComputeEngine({ directory, ...options });
    },
    dispose: async () => store.dispose(),
  };
};

const indexedDbHarness = async (options: { readonly reserveBytes?: number } = {}): Promise<Harness> => {
  const prefix = `tau-compute-${Math.random().toString(36).slice(2)}-`;
  const factory = new IDBFactory();
  let store = createIndexedDbComputeEngine({
    factory,
    databasePrefix: prefix,
    persisted: async () => true,
    ...options,
  });
  return {
    engine: { open: async (input) => store.engine.open(input) },
    control: async () => store.control({ workspace }),
    restart: async () => {
      await store.dispose();
      store = createIndexedDbComputeEngine({
        factory,
        databasePrefix: prefix,
        persisted: async () => true,
        ...options,
      });
    },
    dispose: async () => store.dispose(),
  };
};

const engines: readonly EngineCase[] = [
  {
    name: 'memory',
    durable: false,
    create: async () => {
      const store = createMemoryComputeEngine();
      return {
        engine: store.engine,
        control: async () => store.control({ workspace }),
        // A process-local engine has no restart semantics to preserve.
        restart: async () => undefined,
        dispose: async () => undefined,
      };
    },
  },
  { name: 'sqlite', durable: true, create: async () => sqliteHarness() },
  { name: 'indexeddb', durable: true, create: async () => indexedDbHarness() },
];

afterAll(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe.each(engines)('compute store engine conformance — $name', (engineCase) => {
  let harness: Harness;

  beforeEach(async () => {
    installOriginQuota(64 * 1024 * 1024 * 1024);
    harness = await engineCase.create();
  });

  afterEach(async () => {
    await harness.dispose();
    removeOriginQuota();
  });

  const openSession = async () => harness.engine.open({ workspace });

  it('U17: one bounded request resolves discovery and fetch together, omitting what the caller already holds', async () => {
    const session = await openSession();
    const first = await makeEntry({ operation: 'first', bytes: 'alpha' });
    const second = await makeEntry({ operation: 'second', bytes: 'beta' });
    const put = await session.put({
      entries: [first, second],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status).toBe('committed');

    const warm = await session.get({
      digests: [first.actionDigest, second.actionDigest],
      resident: [second.actionDigest],
      maxEntries: 16,
      maxBytes: 1024,
      generation: session.generation,
    });
    expect(warm.status).toBe('ok');
    if (warm.status !== 'ok') {
      return;
    }
    // The resident identity is neither refetched nor reported as an omission.
    expect(warm.entries.map((entry) => entry.actionDigest)).toStrictEqual([first.actionDigest]);
    expect(warm.omitted).toStrictEqual([]);
    expect(new TextDecoder().decode(warm.entries[0]?.bytes)).toBe('alpha');
    await session.close();
  });

  it('U17/U40: a long-lived peer discovers later publications by scope context without knowing action ids', async () => {
    const peer = await openSession();
    const publisher = await openSession();
    const entry = await makeEntry({ operation: 'peer-publication', bytes: 'shared' });
    const discovery = {
      namespace: 'conformance',
      producer: entry.action.producer,
      environment: entry.action.environment,
      hint: { entryPath: 'model.py' },
    };
    await publisher.put({
      entries: [entry],
      discovery,
      generation: publisher.generation,
      durability: 'disposable',
    });

    const warm = await peer.get({
      digests: [],
      discovery,
      maxEntries: 4,
      maxBytes: 4096,
      generation: peer.generation,
    });
    expect(warm.status === 'ok' && warm.entries.map(({ actionDigest }) => actionDigest)).toStrictEqual([
      entry.actionDigest,
    ]);
    await publisher.close();
    await peer.close();
  });

  it('U17: poisoned discovery rows cannot starve a later honest candidate', async () => {
    const session = await openSession();
    const candidates = await Promise.all([
      makeEntry({ operation: 'discovery-a', bytes: 'a' }),
      makeEntry({ operation: 'discovery-b', bytes: 'b' }),
    ]);
    candidates.sort((left, right) => left.actionDigest.localeCompare(right.actionDigest));
    const [contested, honest] = candidates;
    const discovery = {
      namespace: 'conformance',
      producer: contested.action.producer,
      environment: contested.action.environment,
      hint: { entryPath: 'stale.py' },
    };
    await session.put({
      entries: [contested, honest],
      discovery,
      generation: session.generation,
      durability: 'disposable',
    });
    const divergentBytes = new TextEncoder().encode('divergent');
    await session.put({
      entries: [{ ...contested, bytes: divergentBytes, contentDigest: await digestContent({ bytes: divergentBytes }) }],
      discovery,
      generation: session.generation,
      durability: 'disposable',
    });
    const warm = await session.get({
      digests: [],
      discovery,
      maxEntries: 1,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(warm.status === 'ok' && warm.entries.map(({ actionDigest }) => actionDigest)).toStrictEqual([
      honest.actionDigest,
    ]);
    await session.close();
  });

  it('U17: a resident discovery row cannot starve a later eligible candidate', async () => {
    const session = await openSession();
    const candidates = await Promise.all([
      makeEntry({ operation: 'resident-a', bytes: 'a' }),
      makeEntry({ operation: 'resident-b', bytes: 'b' }),
    ]);
    candidates.sort((left, right) => left.actionDigest.localeCompare(right.actionDigest));
    const first = candidates[0];
    const second = candidates[1];
    const discovery = {
      namespace: 'conformance',
      producer: first.action.producer,
      environment: first.action.environment,
    };
    await session.put({ entries: candidates, discovery, generation: session.generation, durability: 'disposable' });
    const warm = await session.get({
      digests: [],
      discovery,
      resident: [first.actionDigest],
      maxEntries: 1,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(warm.status === 'ok' && warm.entries.map(({ actionDigest }) => actionDigest)).toStrictEqual([
      second.actionDigest,
    ]);
    await session.close();
  });

  it('U17/U26: a bounded request reports exact omissions instead of a silently complete result', async () => {
    const session = await openSession();
    const first = await makeEntry({ operation: 'first', bytes: 'aaaaaaaa' });
    const second = await makeEntry({ operation: 'second', bytes: 'bbbbbbbb' });
    const absent = await makeEntry({ operation: 'absent', bytes: 'cccccccc' });
    await session.put({ entries: [first, second], generation: session.generation, durability: 'disposable' });

    const budgeted = await session.get({
      digests: [first.actionDigest, second.actionDigest, absent.actionDigest],
      maxEntries: 1,
      maxBytes: 1024,
      generation: session.generation,
    });
    expect(budgeted.status).toBe('ok');
    if (budgeted.status !== 'ok') {
      return;
    }
    // Rehydration is bounded by the working set the caller asked for, and every
    // identity it did not get back carries a reason.
    expect(budgeted.entries).toHaveLength(1);
    expect(budgeted.omitted).toStrictEqual([
      { digest: second.actionDigest, reason: 'budget' },
      { digest: absent.actionDigest, reason: 'missing' },
    ]);
    await session.close();
  });

  it('U23/I6: a byte-exact conflict poisons that digest while the honest entries of the batch still commit', async () => {
    const session = await openSession();
    const honest = await makeEntry({ operation: 'honest', bytes: 'stable' });
    const contested = await makeEntry({ operation: 'contested', bytes: 'first-writer' });
    await session.put({ entries: [contested], generation: session.generation, durability: 'disposable' });

    // A second producer's differing output for the same action.
    const divergent: ComputeStoreEntry = {
      ...contested,
      bytes: new TextEncoder().encode('second-writer'),
      contentDigest: await digestContent({
        bytes: new TextEncoder().encode('second-writer'),
      }),
    };
    const put = await session.put({
      entries: [divergent, honest],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status).toBe('committed');
    if (put.status !== 'committed') {
      return;
    }
    expect(put.conflicts).toStrictEqual([{ digest: contested.actionDigest, outcome: 'poisoned' }]);
    expect(put.published).toStrictEqual([honest.actionDigest]);

    const after = await session.get({
      digests: [contested.actionDigest, honest.actionDigest],
      maxEntries: 16,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(after.status).toBe('ok');
    if (after.status !== 'ok') {
      return;
    }
    expect(after.omitted).toStrictEqual([{ digest: contested.actionDigest, reason: 'poisoned' }]);
    expect(after.entries).toHaveLength(1);
    await session.close();
  });

  it('I6: an equivalent codec retains the first verified payload instead of last-writer-wins', async () => {
    const session = await openSession();
    const original = await makeEntry({ operation: 'equivalent', bytes: 'original', determinism: 'equivalent' });
    await session.put({ entries: [original], generation: session.generation, durability: 'disposable' });
    const divergent: ComputeStoreEntry = {
      ...original,
      bytes: new TextEncoder().encode('different'),
      contentDigest: await digestContent({
        bytes: new TextEncoder().encode('different'),
      }),
    };
    const put = await session.put({
      entries: [divergent],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status).toBe('committed');
    if (put.status !== 'committed') {
      return;
    }
    expect(put.conflicts).toStrictEqual([{ digest: original.actionDigest, outcome: 'first-writer-retained' }]);

    const after = await session.get({
      digests: [original.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(after.status === 'ok' && new TextDecoder().decode(after.entries[0]?.bytes)).toBe('original');
    await session.close();
  });

  it('U18: no path, handle or port crosses the protocol, and no `.tau/cache` string is reachable', async () => {
    const session = await openSession();
    const entry = await makeEntry({ operation: 'wire', bytes: 'payload' });
    const put = await session.put({
      entries: [entry],
      generation: session.generation,
      durability: 'disposable',
    });
    const get = await session.get({
      digests: [entry.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: session.generation,
    });
    const control = await harness.control();
    const report = await control.inspect({});
    const wire = JSON.stringify([put, get, report], (_key, value: unknown) =>
      value instanceof Uint8Array ? [...value] : value,
    );
    expect(wire).not.toContain('.tau/cache');
    expect(wire).not.toContain(tmpdir());
    for (const forbidden of ['"path"', '"handle"', '"port"', '"url"', '"root"', '"workspace"', '"file"']) {
      expect(wire).not.toContain(forbidden);
    }
    await session.close();
  });

  it('U20: a planted record whose labels do not match its bytes never reaches a hit', async () => {
    const session = await openSession();
    const honest = await makeEntry({ operation: 'honest', bytes: 'real' });
    const truthful = await makeEntry({ operation: 'truthful', bytes: 'truthful-bytes' });

    // A falsely labelled action: the digest of one action over another's bytes.
    const forgedAction: ComputeStoreEntry = { ...truthful, actionDigest: honest.actionDigest };
    // A falsely labelled payload: the record claims a content identity it does not have.
    const forgedContent: ComputeStoreEntry = { ...truthful, contentDigest: honest.contentDigest };

    const put = await session.put({
      entries: [forgedAction, forgedContent],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status).toBe('committed');
    if (put.status !== 'committed') {
      return;
    }
    // The authority recomputes canonical identity, so neither record is published.
    expect(put.published).toStrictEqual([]);

    const get = await session.get({
      digests: [honest.actionDigest, truthful.actionDigest],
      maxEntries: 8,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(get.status === 'ok' && get.entries).toStrictEqual([]);
    await session.close();
  });

  it('U21: quota refusal is typed and reads maintained counters, and inspect keeps the byte classes distinct', async () => {
    const session = await openSession();
    const entry = await makeEntry({ operation: 'counted', bytes: 'twelve-bytes' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });

    const control = await harness.control();
    const report = await control.inspect({});
    expect(report.entries).toBe(1);
    expect(report.logicalBytes).toBe(entry.bytes.byteLength);
    // Logical, pinned, pending and physical are separate classes; an engine that
    // cannot measure physical bytes says so rather than reporting zero.
    expect(report.pinnedBytes).toBe(0);
    expect(report.pendingBytes).toBe(0);
    expect(['known', 'unsupported']).toContain(report.physicalBytes.status);
    expect(report.generation).toBe(session.generation);
    await session.close();
  });

  it('U19/U38/I12: required durability is acknowledged only by a backend that can honour it', async () => {
    const session = await openSession();
    const entry = await makeEntry({ operation: 'required', bytes: 'checkpoint' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });

    // A hit on previously disposable data still needs promotion (D8).
    const pinned = await session.pin({
      digests: [entry.actionDigest],
      retention: retention('job-1'),
      generation: session.generation,
    });
    expect(session.durable).toBe(engineCase.durable);
    if (!engineCase.durable) {
      expect(pinned).toStrictEqual({ status: 'no-durable-storage' });
      const required = await session.put({
        entries: [entry],
        generation: session.generation,
        durability: 'required',
        retention: retention('job-1'),
      });
      expect(required).toStrictEqual({ status: 'no-durable-storage' });
      await session.close();
      return;
    }
    expect(pinned).toStrictEqual({ status: 'pinned', pinned: [entry.actionDigest] });

    const control = await harness.control();
    expect((await control.inspect({})).pinnedBytes).toBe(entry.bytes.byteLength);
    await session.close();
  });

  it('U19: pinning an identity the store does not hold is `missing`, never a false acknowledgement', async () => {
    const session = await openSession();
    const absent = await makeEntry({ operation: 'absent', bytes: 'nothing' });
    const pinned = await session.pin({
      digests: [absent.actionDigest],
      retention: retention('job-1'),
      generation: session.generation,
    });
    expect(pinned.status).toBe(engineCase.durable ? 'missing' : 'no-durable-storage');
    await session.close();
  });

  it('U37/I7: clear bumps the generation, fences stale reuse, and a stale put cannot repopulate', async () => {
    const session = await openSession();
    const entry = await makeEntry({ operation: 'fenced', bytes: 'disposable' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });

    const control = await harness.control();
    const cleared = await control.clear({});
    expect(cleared.status).toBe('cleared');
    expect(cleared.generation).toBe(session.generation + 1);

    // Every operation still holding the captured generation is fenced.
    const staleGet = await session.get({
      digests: [entry.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(staleGet.status).toBe('stale-generation');
    const stalePut = await session.put({
      entries: [entry],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(stalePut.status).toBe('stale-generation');

    // A session opened after the clear sees an empty store, not the old data.
    const reopened = await harness.engine.open({ workspace });
    expect(reopened.generation).toBe(cleared.generation);
    const after = await reopened.get({
      digests: [entry.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: reopened.generation,
    });
    expect(after.status === 'ok' && after.entries).toStrictEqual([]);
    await reopened.close();
    await session.close();
  });

  it('U24/U34/D26: clear preserves required roots and their data stays reusable', async () => {
    if (!engineCase.durable) {
      const session = await openSession();
      // A non-durable engine holds no required roots, so a clear retains nothing.
      const control = await harness.control();
      expect((await control.clear({})).retained).toBe(0);
      await session.close();
      return;
    }
    const session = await openSession();
    const required = await makeEntry({ operation: 'required', bytes: 'checkpoint-bytes' });
    const disposable = await makeEntry({ operation: 'disposable', bytes: 'evictable' });
    await session.put({
      entries: [required, disposable],
      generation: session.generation,
      durability: 'disposable',
    });
    await session.pin({
      digests: [required.actionDigest],
      retention: retention('job-1'),
      generation: session.generation,
    });

    const control = await harness.control();
    const cleared = await control.clear({});
    expect(cleared.retained).toBe(required.bytes.byteLength);

    const reopened = await harness.engine.open({ workspace });
    const after = await reopened.get({
      digests: [required.actionDigest, disposable.actionDigest],
      maxEntries: 8,
      maxBytes: 4096,
      generation: reopened.generation,
    });
    expect(after.status).toBe('ok');
    if (after.status !== 'ok') {
      return;
    }
    // The required closure survived and is still a hit; the disposable data did not.
    expect(after.entries.map((entry) => entry.actionDigest)).toStrictEqual([required.actionDigest]);
    expect(after.omitted).toStrictEqual([{ digest: disposable.actionDigest, reason: 'missing' }]);
    await reopened.close();
    await session.close();
  });

  it('U37: a restart preserves durable data and its required roots', async () => {
    const session = await openSession();
    const entry = await makeEntry({ operation: 'survivor', bytes: 'persisted-bytes' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });
    if (engineCase.durable) {
      await session.pin({
        digests: [entry.actionDigest],
        retention: retention('job-1'),
        generation: session.generation,
      });
    }
    await session.close();
    await harness.restart();

    const reopened = await harness.engine.open({ workspace });
    const after = await reopened.get({
      digests: [entry.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: reopened.generation,
    });
    expect(after.status).toBe('ok');
    if (after.status !== 'ok') {
      return;
    }
    if (engineCase.durable) {
      // Restart remints capability identity but retains verified data (D11).
      expect(new TextDecoder().decode(after.entries[0]?.bytes)).toBe('persisted-bytes');
      const control = await harness.control();
      expect((await control.inspect({})).pinnedBytes).toBe(entry.bytes.byteLength);
    } else {
      expect(after.entries).toHaveLength(1);
    }
    await reopened.close();
  });

  it('U24: a recovered owner releases its roots, and released data becomes collectable', async () => {
    if (!engineCase.durable) {
      return;
    }
    const session = await openSession();
    const entry = await makeEntry({ operation: 'released', bytes: 'owned-bytes' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });
    await session.pin({
      digests: [entry.actionDigest],
      retention: retention('job-1'),
      generation: session.generation,
    });

    const control = await harness.control();
    expect((await control.inspect({})).pinnedBytes).toBe(entry.bytes.byteLength);
    await session.release({ retention: retention('job-1') });
    expect((await control.inspect({})).pinnedBytes).toBe(0);

    // With the root gone, a clear no longer retains it.
    expect((await control.clear({})).retained).toBe(0);
    await session.close();
  });

  it('U16: two sessions over one store both publish, and two owners of one digest keep both roots', async () => {
    const first = await harness.engine.open({ workspace });
    const second = await harness.engine.open({ workspace });
    const left = await makeEntry({ operation: 'left', bytes: 'left-bytes' });
    const right = await makeEntry({ operation: 'right', bytes: 'right-bytes' });
    const shared = await makeEntry({ operation: 'shared', bytes: 'shared-bytes' });

    const [leftPut, rightPut] = await Promise.all([
      first.put({ entries: [left, shared], generation: first.generation, durability: 'disposable' }),
      second.put({ entries: [right, shared], generation: second.generation, durability: 'disposable' }),
    ]);
    expect(leftPut.status).toBe('committed');
    expect(rightPut.status).toBe('committed');

    const get = await first.get({
      digests: [left.actionDigest, right.actionDigest, shared.actionDigest],
      maxEntries: 8,
      maxBytes: 8192,
      generation: first.generation,
    });
    expect(get.status).toBe('ok');
    if (get.status !== 'ok') {
      return;
    }
    // Both writers' bytes are right, and the shared identity is stored once.
    expect(get.entries).toHaveLength(3);
    expect(
      new TextDecoder().decode(get.entries.find((candidate) => candidate.actionDigest === left.actionDigest)?.bytes),
    ).toBe('left-bytes');
    expect(
      new TextDecoder().decode(get.entries.find((candidate) => candidate.actionDigest === right.actionDigest)?.bytes),
    ).toBe('right-bytes');

    if (engineCase.durable) {
      // Two tabs of one project: distinct owners of the same digest, both kept.
      await first.pin({ digests: [shared.actionDigest], retention: retention('tab-a'), generation: first.generation });
      await second.pin({
        digests: [shared.actionDigest],
        retention: retention('tab-b'),
        generation: second.generation,
      });
      await first.release({ retention: retention('tab-a') });
      const control = await harness.control();
      // Releasing one owner does not unroot the other's data.
      expect((await control.clear({})).retained).toBe(shared.bytes.byteLength);
    }
    await first.close();
    await second.close();
  });

  it('U34: a bounded collect makes progress under continuous writers and never deletes newly rooted data', async () => {
    if (!engineCase.durable) {
      return;
    }
    const session = await openSession();
    const stale = await Promise.all(
      Array.from({ length: 24 }, async (_unused, index) =>
        makeEntry({ operation: `stale-${index}`, bytes: `stale-payload-${index}` }),
      ),
    );
    const kept = await makeEntry({ operation: 'kept', bytes: 'kept-payload' });
    await session.put({ entries: [...stale, kept], generation: session.generation, durability: 'disposable' });
    await session.pin({ digests: [kept.actionDigest], retention: retention('job-1'), generation: session.generation });

    const control = await harness.control();
    const cleared = await control.clear({});
    const live = await harness.engine.open({ workspace });

    // Writers keep publishing while the sweep runs.
    let written = 0;
    const writer = (async () => {
      for (let index = 0; index < 8; index += 1) {
        const entry = await makeEntry({ operation: `concurrent-${index}`, bytes: `concurrent-payload-${index}` });
        const put = await live.put({ entries: [entry], generation: cleared.generation, durability: 'disposable' });
        if (put.status === 'committed') {
          written += 1;
          await live.pin({
            digests: [entry.actionDigest],
            retention: retention('job-2'),
            generation: cleared.generation,
          });
        }
      }
    })();

    let reclaimed = 0;
    let cursor: string | undefined;
    let slices = 0;
    do {
      const slice = await control.collect({ budget: 1, ...(cursor === undefined ? {} : { cursor }) });
      reclaimed += slice.reclaimed;
      cursor = slice.status === 'incomplete' ? slice.cursor : undefined;
      slices += 1;
      expect(slices).toBeLessThan(64);
    } while (cursor !== undefined);
    await writer;

    // Progress: the fenced generation's bytes are gone.
    expect(reclaimed).toBeGreaterThan(0);
    expect(written).toBe(8);
    // Safety: the root that survived the clear and every root added during the
    // sweep are still readable.
    const after = await live.get({
      digests: [kept.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: cleared.generation,
    });
    expect(after.status === 'ok' && after.entries).toHaveLength(1);
    const report = await control.inspect({});
    expect(report.entries).toBe(1 + written);
    await live.close();
    await session.close();
  });

  it('U39: after one seed barrier, 2/4/8/16 variant sessions all reuse the prefix with no republication', async () => {
    const seed = await openSession();
    const prefix = await Promise.all(
      Array.from({ length: 4 }, async (_unused, index) =>
        makeEntry({ operation: `prefix-${index}`, bytes: `expensive-prefix-${index}` }),
      ),
    );
    // The seed publication barrier: variants start only after this commits.
    const published = await seed.put({
      entries: prefix,
      generation: seed.generation,
      durability: 'disposable',
    });
    expect(published.status).toBe('committed');
    const digests = prefix.map((entry) => entry.actionDigest);

    for (const variants of [2, 4, 8, 16]) {
      const sessions = await Promise.all(
        Array.from({ length: variants }, async () => harness.engine.open({ workspace })),
      );
      const results = await Promise.all(
        sessions.map(async (session) =>
          session.get({ digests, maxEntries: 16, maxBytes: 1_048_576, generation: session.generation }),
        ),
      );
      for (const result of results) {
        expect(result.status).toBe('ok');
        // Every variant reused the whole eligible prefix; none had to solve it.
        expect(result.status === 'ok' && result.entries).toHaveLength(prefix.length);
        expect(result.status === 'ok' && result.omitted).toStrictEqual([]);
      }
      await Promise.all(sessions.map(async (session) => session.close()));
    }

    // Discovery did not become identity: the store still holds exactly the seed.
    const control = await harness.control();
    expect((await control.inspect({})).entries).toBe(prefix.length);
    await seed.close();
  });

  it('U40: two producers merge atomically, and a long-lived session observes later commits and poison', async () => {
    const longLived = await openSession();
    const left = await harness.engine.open({ workspace });
    const right = await harness.engine.open({ workspace });
    const leftEntries = await Promise.all(
      Array.from({ length: 4 }, async (_unused, index) =>
        makeEntry({ operation: `left-${index}`, bytes: `left-payload-${index}` }),
      ),
    );
    const rightEntries = await Promise.all(
      Array.from({ length: 4 }, async (_unused, index) =>
        makeEntry({ operation: `right-${index}`, bytes: `right-payload-${index}` }),
      ),
    );

    // Two producers publishing at once: neither loses the other's hints.
    await Promise.all([
      left.put({ entries: leftEntries, generation: left.generation, durability: 'disposable' }),
      right.put({ entries: rightEntries, generation: right.generation, durability: 'disposable' }),
    ]);

    // The long-lived session opened before either commit and sees both without
    // reopening or polling inside a native operation.
    const merged = await longLived.get({
      digests: [...leftEntries, ...rightEntries].map((entry) => entry.actionDigest),
      maxEntries: 16,
      maxBytes: 1_048_576,
      generation: longLived.generation,
    });
    expect(merged.status === 'ok' && merged.entries).toHaveLength(8);

    // A resident identity is omitted from the fetch rather than refetched.
    const withResident = await longLived.get({
      digests: [leftEntries[0]?.actionDigest ?? '', rightEntries[0]?.actionDigest ?? ''] as ActionDigest[],
      resident: [leftEntries[0]?.actionDigest ?? ''] as ActionDigest[],
      maxEntries: 16,
      maxBytes: 1_048_576,
      generation: longLived.generation,
    });
    expect(withResident.status === 'ok' && withResident.entries).toHaveLength(1);

    // A poison committed by another producer refreshes this session's negative.
    const contested = leftEntries[1];
    if (contested) {
      const divergentBytes = new TextEncoder().encode('divergent');
      await right.put({
        entries: [
          { ...contested, bytes: divergentBytes, contentDigest: await digestContent({ bytes: divergentBytes }) },
        ],
        generation: right.generation,
        durability: 'disposable',
      });
      const refreshed = await longLived.get({
        digests: [contested.actionDigest],
        maxEntries: 4,
        maxBytes: 4096,
        generation: longLived.generation,
      });
      expect(refreshed.status === 'ok' && refreshed.omitted).toStrictEqual([
        { digest: contested.actionDigest, reason: 'poisoned' },
      ]);
    }
    await longLived.close();
    await left.close();
    await right.close();
  });

  it('U25: control is not a member of a session, so GC and clear cannot sit on the render path', async () => {
    const session = await openSession();
    for (const member of ['inspect', 'clear', 'collect', 'maintenance']) {
      expect(member in session).toBe(false);
    }
    expect(Object.keys(session).toSorted()).toStrictEqual([
      'close',
      'durable',
      'generation',
      'get',
      'pin',
      'put',
      'release',
    ]);
    await session.close();
  });

  it('U44/D28/I21: a self-contained result stays a hit after its optional ancestor is gone', async () => {
    const session = await openSession();
    const ancestor = await makeEntry({ operation: 'cheap-ancestor', bytes: 'cheap' });
    // The costly result names the cheap operand as semantic ancestry only.
    const costly = await makeEntry({
      operation: 'costly',
      bytes: 'expensive-result',
      ancestors: [ancestor.actionDigest],
    });
    await session.put({ entries: [costly], generation: session.generation, durability: 'disposable' });

    const get = await session.get({
      digests: [costly.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(get.status).toBe('ok');
    if (get.status !== 'ok') {
      return;
    }
    // The ancestor was never stored, and the result hits anyway.
    expect(get.entries).toHaveLength(1);
    expect(get.entries[0]?.action.inputs.some((input) => input.kind === 'action')).toBe(true);
    await session.close();
  });

  it('D28/I21: publication requires a complete bounded payload closure', async () => {
    const session = await openSession();
    const leaf = await makeEntry({ operation: 'leaf', bytes: 'leaf' });
    const middle = await makeEntry({
      operation: 'middle',
      bytes: 'middle',
      requiredContent: [leaf.contentDigest],
    });
    const root = await makeEntry({
      operation: 'root',
      bytes: 'root',
      requiredContent: [middle.contentDigest],
    });
    const missing = await makeEntry({
      operation: 'missing',
      bytes: 'missing',
      requiredContent: [await digestContent({ bytes: new TextEncoder().encode('absent') })],
    });

    const put = await session.put({
      entries: [root, missing, middle, leaf],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([
      root.actionDigest,
      middle.actionDigest,
      leaf.actionDigest,
    ]);
    const fetched = await session.get({
      digests: [root.actionDigest, missing.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(fetched.status === 'ok' && fetched.entries.map(({ actionDigest }) => actionDigest)).toStrictEqual([
      root.actionDigest,
    ]);
    await session.close();
  });

  it('D28/I21: required retention preserves transitive unique payloads through clear', async () => {
    if (!engineCase.durable) {
      return;
    }
    const session = await openSession();
    const leaf = await makeEntry({ operation: 'retained-leaf', bytes: 'leaf' });
    const middle = await makeEntry({
      operation: 'retained-middle',
      bytes: 'middle',
      requiredContent: [leaf.contentDigest],
    });
    const root = await makeEntry({
      operation: 'retained-root',
      bytes: 'root',
      requiredContent: [middle.contentDigest],
    });
    await session.put({
      entries: [root, middle, leaf],
      generation: session.generation,
      durability: 'disposable',
    });
    await session.pin({
      digests: [root.actionDigest],
      retention: retention('closure'),
      generation: session.generation,
    });
    const control = await harness.control();
    expect((await control.inspect({})).pinnedBytes).toBe(
      root.bytes.byteLength + middle.bytes.byteLength + leaf.bytes.byteLength,
    );
    const cleared = await control.clear({});
    const reopened = await harness.engine.open({ workspace });
    const fetched = await reopened.get({
      digests: [root.actionDigest, middle.actionDigest, leaf.actionDigest],
      maxEntries: 4,
      maxBytes: 4096,
      generation: cleared.generation,
    });
    expect(fetched.status === 'ok' && fetched.entries).toHaveLength(3);
    await reopened.close();
    await session.close();
  });

  it('D28/I21: a rejected sibling cannot satisfy another entry closure', async () => {
    const session = await openSession();
    const contested = await makeEntry({ operation: 'contested-dependency', bytes: 'first' });
    await session.put({ entries: [contested], generation: session.generation, durability: 'disposable' });
    const divergentBytes = new TextEncoder().encode('second');
    const divergent = {
      ...contested,
      bytes: divergentBytes,
      contentDigest: await digestContent({ bytes: divergentBytes }),
    };
    const dependent = await makeEntry({
      operation: 'dependent-on-rejected',
      bytes: 'dependent',
      requiredContent: [divergent.contentDigest],
    });
    const honest = await makeEntry({ operation: 'honest-sibling', bytes: 'honest' });
    const put = await session.put({
      entries: [dependent, divergent, honest],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([honest.actionDigest]);
    expect(put.status === 'committed' && put.conflicts).toStrictEqual([
      { digest: contested.actionDigest, outcome: 'poisoned' },
    ]);
    await session.close();
  });

  it('D28/I21: divergent records for one fresh action poison it without supplying sibling closure', async () => {
    const session = await openSession();
    const first = await makeEntry({ operation: 'fresh-contested', bytes: 'first' });
    const secondBytes = new TextEncoder().encode('second');
    const second = { ...first, bytes: secondBytes, contentDigest: await digestContent({ bytes: secondBytes }) };
    const dependent = await makeEntry({
      operation: 'fresh-dependent',
      bytes: 'dependent',
      requiredContent: [first.contentDigest],
    });
    const honest = await makeEntry({ operation: 'fresh-honest', bytes: 'honest' });
    const put = await session.put({
      entries: [first, second, dependent, honest],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([honest.actionDigest]);
    expect(put.status === 'committed' && put.conflicts).toStrictEqual([
      { digest: first.actionDigest, outcome: 'poisoned' },
    ]);
    await session.close();
  });

  it('D28/I21: exact same-batch records publish once after required-content set normalization', async () => {
    const session = await openSession();
    const left = await makeEntry({ operation: 'duplicate-left', bytes: 'left' });
    const right = await makeEntry({ operation: 'duplicate-right', bytes: 'right' });
    const root = await makeEntry({
      operation: 'duplicate-root',
      bytes: 'root',
      requiredContent: [left.contentDigest, right.contentDigest],
    });
    const duplicate = { ...root, requiredContent: [right.contentDigest, left.contentDigest, right.contentDigest] };
    const put = await session.put({
      entries: [left, right, root, duplicate],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([
      left.actionDigest,
      right.actionDigest,
      root.actionDigest,
    ]);
    await session.close();
  });

  it('I6: same-batch equivalent metadata divergence retains the first complete record', async () => {
    const session = await openSession();
    const first = await makeEntry({ operation: 'equivalent-metadata', bytes: 'same', determinism: 'equivalent' });
    const put = await session.put({
      entries: [first, { ...first, mediaType: 'application/x-divergent' }],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([first.actionDigest]);
    expect(put.status === 'committed' && put.conflicts).toStrictEqual([
      { digest: first.actionDigest, outcome: 'first-writer-retained' },
    ]);
    const fetched = await session.get({
      digests: [first.actionDigest],
      maxEntries: 1,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(fetched.status === 'ok' && fetched.entries[0]?.mediaType).toBe(first.mediaType);
    await session.close();
  });

  it('D28/I21: repeat put, unpin, and collect leave no phantom closure', async () => {
    if (!engineCase.durable) {
      return;
    }
    const session = await openSession();
    const leaf = await makeEntry({ operation: 'repeat-leaf', bytes: 'repeat-leaf' });
    const root = await makeEntry({
      operation: 'repeat-root',
      bytes: 'repeat-root',
      requiredContent: [leaf.contentDigest],
    });
    for (let index = 0; index < 2; index += 1) {
      await session.put({ entries: [root, leaf], generation: session.generation, durability: 'disposable' });
    }
    await session.pin({
      digests: [root.actionDigest],
      retention: retention('repeat'),
      generation: session.generation,
    });
    await session.release({ retention: retention('repeat') });
    const control = await harness.control();
    const cleared = await control.clear({});
    let cursor: string | undefined;
    do {
      const result = await control.collect({ budget: 1000, ...(cursor === undefined ? {} : { cursor }) });
      cursor = result.status === 'incomplete' ? result.cursor : undefined;
    } while (cursor !== undefined);
    const reopened = await harness.engine.open({ workspace });
    const put = await reopened.put({
      entries: [root],
      generation: cleared.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([]);
    await reopened.close();
    await session.close();
  });

  it('D28/I21: an unanchored payload cycle is refused', async () => {
    const session = await openSession();
    const left = await makeEntry({ operation: 'cycle-left', bytes: 'cycle-left' });
    const right = await makeEntry({ operation: 'cycle-right', bytes: 'cycle-right' });
    const put = await session.put({
      entries: [
        { ...left, requiredContent: [right.contentDigest] },
        { ...right, requiredContent: [left.contentDigest] },
      ],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([]);
    await session.close();
  });

  it('I11/U21: many actual required roots keep incremental unique-byte accounting', async () => {
    if (!engineCase.durable) {
      return;
    }
    const session = await openSession();
    const entries = await Promise.all(
      Array.from({ length: 256 }, async (_unused, index) =>
        makeEntry({ operation: `required-root-${index}`, bytes: `required-payload-${index}` }),
      ),
    );
    const put = await session.put({
      entries,
      generation: session.generation,
      durability: 'required',
      retention: retention('many-roots'),
    });
    expect(put.status).toBe('committed');
    const expected = entries.reduce((bytes, entry) => bytes + entry.bytes.byteLength, 0);
    const control = await harness.control();
    expect((await control.inspect({})).pinnedBytes).toBe(expected);

    const shared = await makeEntry({ operation: 'shared-required-root', bytes: 'required-payload-0' });
    await session.put({ entries: [shared], generation: session.generation, durability: 'disposable' });
    await session.pin({
      digests: [shared.actionDigest],
      retention: retention('shared-root'),
      generation: session.generation,
    });
    expect((await control.inspect({})).pinnedBytes).toBe(expected);
    await session.close();
  });

  it('I11: fetch bounds are finite positive safe integers', async () => {
    const session = await openSession();
    for (const [maxEntries, maxBytes] of [
      [0, 1],
      [-1, 1],
      [1, 0],
      [1, Number.POSITIVE_INFINITY],
    ] satisfies Array<[number, number]>) {
      await expect(session.get({ digests: [], maxEntries, maxBytes, generation: session.generation })).rejects.toThrow(
        TypeError,
      );
    }
    await expect(
      session.put({
        entries: [],
        discovery: {
          namespace: 'conformance',
          producer: { id: 'engine-test', version: '1.0.0', implementationAssets: [] },
          environment: { platform: 'test' },
          hint: 'x'.repeat(65_537),
        },
        generation: session.generation,
        durability: 'disposable',
      }),
    ).rejects.toThrow(/64 KiB/);
    await session.close();
  });
});

describe('capacity-domain admission (lane 17 recipe)', () => {
  afterEach(() => {
    removeOriginQuota();
  });

  it('an unmeasurable capacity domain skips caching and lets the primary result stand', async () => {
    // No `navigator.storage`: the origin bounds nothing, so a cache write is refused.
    removeOriginQuota();
    const store = createIndexedDbComputeEngine({
      factory: new IDBFactory(),
      databasePrefix: `tau-compute-unmeasured-${Math.random().toString(36).slice(2)}-`,
      persisted: async () => true,
    });
    const session = await store.engine.open({ workspace });
    const entry = await makeEntry({ operation: 'unmeasured', bytes: 'payload' });
    const put = await session.put({
      entries: [entry],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status).toBe('unavailable');
    expect(put.status === 'unavailable' && put.reason).toContain('unmeasurable');
    await session.close();
    await store.dispose();
  });

  it('a cache put that would enter the revision reserve evicts unleased entries and retries once', async () => {
    // `admitCapacityWrite` clamps the reserve up to its 64 MiB hard floor, so a
    // meaningful domain here is one whose free space sits just above it: the
    // first entry fits, the second only after the first is reclaimed.
    const free = revisionReserveFloorBytes + 18;
    installOriginQuota(free, free + 64);
    const store = createIndexedDbComputeEngine({
      factory: new IDBFactory(),
      databasePrefix: `tau-compute-reserve-${Math.random().toString(36).slice(2)}-`,
      persisted: async () => true,
    });
    const session = await store.engine.open({ workspace });
    const first = await makeEntry({ operation: 'first', bytes: 'aaaaaaaaaaaa' });
    const second = await makeEntry({ operation: 'second', bytes: 'bbbbbbbbbbbb' });
    expect(
      (await session.put({ entries: [first], generation: session.generation, durability: 'disposable' })).status,
    ).toBe('committed');

    const put = await session.put({
      entries: [second],
      generation: session.generation,
      durability: 'disposable',
    });
    // Refused against the reserve, the unleased entry was evicted up to the
    // shortfall, and the single retry committed.
    expect(put.status).toBe('committed');
    const report = await (await store.control({ workspace })).inspect({});
    expect(report.entries).toBe(1);
    const get = await session.get({
      digests: [first.actionDigest, second.actionDigest],
      maxEntries: 8,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(get.status === 'ok' && get.entries.map((entry) => entry.actionDigest)).toStrictEqual([second.actionDigest]);
    await session.close();
    await store.dispose();
  });

  it('D26: eviction to admit a cache write never reclaims rooted data', async () => {
    const free = revisionReserveFloorBytes + 30;
    installOriginQuota(free, free + 64);
    const store = createIndexedDbComputeEngine({
      factory: new IDBFactory(),
      databasePrefix: `tau-compute-rooted-${Math.random().toString(36).slice(2)}-`,
      persisted: async () => true,
    });
    const session = await store.engine.open({ workspace });
    const rooted = await makeEntry({ operation: 'rooted', bytes: 'aaaaaaaaaaaa' });
    const unleased = await makeEntry({ operation: 'unleased', bytes: 'bbbbbbbbbbbb' });
    await session.put({
      entries: [rooted, unleased],
      generation: session.generation,
      durability: 'disposable',
    });
    await session.pin({
      digests: [rooted.actionDigest],
      retention: retention('job-1'),
      generation: session.generation,
    });

    const third = await makeEntry({ operation: 'third', bytes: 'cccccccccccc' });
    await session.put({ entries: [third], generation: session.generation, durability: 'disposable' });

    const get = await session.get({
      digests: [rooted.actionDigest, unleased.actionDigest],
      maxEntries: 8,
      maxBytes: 4096,
      generation: session.generation,
    });
    expect(get.status).toBe('ok');
    if (get.status !== 'ok') {
      return;
    }
    // Required data is not an eviction candidate; only the unleased entry is.
    expect(get.entries.map((entry) => entry.actionDigest)).toStrictEqual([rooted.actionDigest]);
    expect(get.omitted).toStrictEqual([{ digest: unleased.actionDigest, reason: 'missing' }]);
    const report = await (await store.control({ workspace })).inspect({});
    expect(report.pinnedBytes).toBe(rooted.bytes.byteLength);
    await session.close();
    await store.dispose();
  });
});

describe('independent durable authorities', () => {
  beforeEach(() => {
    installOriginQuota(64 * 1024 * 1024 * 1024);
  });
  afterEach(() => {
    removeOriginQuota();
  });

  it('M2: separate SQLite engines synchronize counters and generation through persisted metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-compute-peer-'));
    directories.push(directory);
    const first = createSqliteComputeEngine({ directory });
    const second = createSqliteComputeEngine({ directory });
    const left = await first.engine.open({ workspace });
    const right = await second.engine.open({ workspace });
    const entry = await makeEntry({ operation: 'sqlite-peer', bytes: 'peer' });
    expect((await left.put({ entries: [entry], generation: left.generation, durability: 'disposable' })).status).toBe(
      'committed',
    );
    await expect((await second.control({ workspace })).inspect({})).resolves.toMatchObject({ entries: 1 });
    const cleared = await (await second.control({ workspace })).clear({});
    expect(
      (await right.get({ digests: [entry.actionDigest], maxEntries: 1, maxBytes: 64, generation: right.generation }))
        .status,
    ).toBe('stale-generation');
    expect(cleared.generation).not.toBe(right.generation);
    await left.close();
    await right.close();
    await first.dispose();
    await second.dispose();
  });

  it('M2: separate IndexedDB authorities synchronize counters and generation through persisted metadata', async () => {
    const factory = new IDBFactory();
    const databasePrefix = `tau-compute-peer-${Math.random().toString(36).slice(2)}-`;
    const first = createIndexedDbComputeEngine({ factory, databasePrefix, persisted: async () => true });
    const second = createIndexedDbComputeEngine({ factory, databasePrefix, persisted: async () => true });
    const left = await first.engine.open({ workspace });
    const right = await second.engine.open({ workspace });
    const entry = await makeEntry({ operation: 'idb-peer', bytes: 'peer' });
    expect((await left.put({ entries: [entry], generation: left.generation, durability: 'disposable' })).status).toBe(
      'committed',
    );
    await expect((await second.control({ workspace })).inspect({})).resolves.toMatchObject({ entries: 1 });
    await (await second.control({ workspace })).clear({});
    expect(
      (await right.get({ digests: [entry.actionDigest], maxEntries: 1, maxBytes: 64, generation: right.generation }))
        .status,
    ).toBe('stale-generation');
    await left.close();
    await right.close();
    await first.dispose();
    await second.dispose();
  });
});

describe('incremental logical quota', () => {
  beforeEach(() => {
    installOriginQuota(64 * 1024 * 1024 * 1024);
  });
  afterEach(() => {
    removeOriginQuota();
  });

  it.each(['sqlite', 'indexeddb'] as const)(
    'S2: an idempotent %s put at quota commits without another charge',
    async (kind) => {
      const entry = await makeEntry({ operation: `idempotent-${kind}`, bytes: 'quota' });
      const directory = kind === 'sqlite' ? await mkdtemp(join(tmpdir(), 'tau-compute-quota-')) : undefined;
      if (directory) {
        directories.push(directory);
      }
      const store =
        kind === 'sqlite'
          ? createSqliteComputeEngine({ directory: directory ?? '', logicalQuota: entry.bytes.byteLength })
          : createIndexedDbComputeEngine({
              factory: new IDBFactory(),
              databasePrefix: `tau-compute-quota-${Math.random().toString(36).slice(2)}-`,
              logicalQuota: entry.bytes.byteLength,
              persisted: async () => true,
            });
      const session = await store.engine.open({ workspace });
      expect(
        (await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' })).status,
      ).toBe('committed');
      expect(
        (await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' })).status,
      ).toBe('committed');
      expect(await (await store.control({ workspace })).inspect({})).toMatchObject({
        entries: 1,
        logicalBytes: entry.bytes.byteLength,
      });
      await session.close();
      await store.dispose();
    },
  );

  it.each(['sqlite', 'indexeddb'] as const)('S2: an exact same-batch %s duplicate is charged once', async (kind) => {
    const entry = await makeEntry({ operation: `batch-idempotent-${kind}`, bytes: 'quota' });
    const directory = kind === 'sqlite' ? await mkdtemp(join(tmpdir(), 'tau-compute-quota-')) : undefined;
    if (directory) {
      directories.push(directory);
    }
    const store =
      kind === 'sqlite'
        ? createSqliteComputeEngine({ directory: directory ?? '', logicalQuota: entry.bytes.byteLength })
        : createIndexedDbComputeEngine({
            factory: new IDBFactory(),
            databasePrefix: `tau-compute-quota-${Math.random().toString(36).slice(2)}-`,
            logicalQuota: entry.bytes.byteLength,
            persisted: async () => true,
          });
    const session = await store.engine.open({ workspace });
    const put = await session.put({
      entries: [entry, entry],
      generation: session.generation,
      durability: 'disposable',
    });
    expect(put.status === 'committed' && put.published).toStrictEqual([entry.actionDigest]);
    expect(await (await store.control({ workspace })).inspect({})).toMatchObject({ entries: 1 });
    await session.close();
    await store.dispose();
  });
});

describe('sqlite store placement and index use', () => {
  it('D9/I4: the store refuses a directory inside a revision root', () => {
    expect(() => createSqliteComputeEngine({ directory: '/Users/me/project/.tau/cache/compute' })).toThrow(
      /outside every revision root/,
    );
    expect(() => createSqliteComputeEngine({ directory: 'relative/path' })).toThrow(/absolute host path/);
  });

  it('U13/I11: every hot-path statement is an index lookup, so publishing enumerates nothing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-compute-plan-'));
    directories.push(directory);
    const store = createSqliteComputeEngine({ directory });
    const session = await store.engine.open({ workspace });
    const entry = await makeEntry({ operation: 'planned', bytes: 'payload' });
    await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' });
    await session.close();
    await store.dispose();

    const sqlite = await import('node:sqlite');
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sqlite'));
    expect(files).toHaveLength(1);
    // The file name is an opaque digest: no project path, revision or agent id.
    expect(files[0]).toMatch(/^[\da-f]{32}\.sqlite$/);
    const db = new sqlite.DatabaseSync(join(directory, files[0] ?? ''));
    const { _hotPathSql } = await import('#cache/sqlite-compute-engine.js');
    for (const sql of Object.values(_hotPathSql)) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>;
      for (const step of plan) {
        expect(step.detail).not.toMatch(/^SCAN/);
      }
    }
    db.close();
  });

  it('U15: discovery remains index-bounded with 0 and 50k background rows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-compute-discovery-plan-'));
    directories.push(directory);
    const store = createSqliteComputeEngine({ directory });
    await (await store.engine.open({ workspace })).close();
    await store.dispose();
    const sqlite = await import('node:sqlite');
    const { readdir } = await import('node:fs/promises');
    const file = (await readdir(directory)).find((name) => name.endsWith('.sqlite')) ?? '';
    const db = new sqlite.DatabaseSync(join(directory, file));
    const { _hotPathSql } = await import('#cache/sqlite-compute-engine.js');
    const query = db.prepare(_hotPathSql.getDiscovery);
    expect(query.all('target', 1)).toStrictEqual([]);
    db.exec('BEGIN');
    const insert = db.prepare('INSERT INTO discovery (context, action_digest) VALUES (?, ?)');
    const retain = db.prepare('INSERT INTO retained_content (retention, root_action, content_digest) VALUES (?, ?, ?)');
    const content = db.prepare('INSERT INTO content (content_digest, bytes, byte_length, refs) VALUES (?, ?, 1, 1)');
    const record = db.prepare(
      'INSERT INTO record (action_digest, content_digest, media_type, determinism, action, generation, byte_length) VALUES (?, ?, ?, ?, ?, 1, 1)',
    );
    for (let index = 0; index < 50_000; index += 1) {
      insert.run(index === 49_999 ? 'target' : `background-${index}`, `digest-${index}`);
      retain.run(`owner-${index}`, `root-${index}`, `content-${index}`);
      content.run(`payload-${index}`, new Uint8Array([index % 256]));
      record.run(`action-${index}`, `payload-${index}`, 'application/octet-stream', 'byte-exact', '{}');
    }
    db.exec('COMMIT');
    expect(query.all('target', 1)).toHaveLength(1);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${_hotPathSql.getDiscovery}`).all('target', 1) as Array<{
      detail: string;
    }>;
    expect(plan.every(({ detail }) => !detail.startsWith('SCAN'))).toBe(true);
    expect(db.prepare(_hotPathSql.retainedContentProbe).all('content-49999')).toHaveLength(1);
    const retainedPlan = db
      .prepare(`EXPLAIN QUERY PLAN ${_hotPathSql.retainedContentProbe}`)
      .all('content-49999') as Array<{ detail: string }>;
    expect(retainedPlan.every(({ detail }) => !detail.startsWith('SCAN'))).toBe(true);
    const { _closureContentSql } = await import('#cache/sqlite-compute-engine.js');
    expect(db.prepare(_closureContentSql).all('action-49999')).toHaveLength(1);
    const closurePlan = db.prepare(`EXPLAIN QUERY PLAN ${_closureContentSql}`).all('action-49999') as Array<{
      detail: string;
    }>;
    expect(
      closurePlan.every(
        ({ detail }) => !/^SCAN (?:record|dependency|content|retained_content|root|discovery)\b/.test(detail),
      ),
    ).toBe(true);
    db.close();
  });
});
