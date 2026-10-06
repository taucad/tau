/**
 * W1 contract acceptance: U1, U6, U7, U9, U11, U18, U23, U30, U35–U38.
 *
 * Every case here fails on the pre-change tree; the captured red run is
 * `execution/lanes/CR-W1-a1/red-run.log`.
 */
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentDigest, digestAction, digestContent } from '@taucad/cache-core';
import type { ActionDigest, CacheCodec, CacheRetention, ComputeAction } from '@taucad/cache-core';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import {
  createComputeCapabilityHost,
  _mintComputeRetention,
  _registerComputeStore,
} from '#cache/kernel-compute-runtime.js';
import type {
  ComputeGeneration,
  ComputeStore,
  ComputeStoreControl,
  ComputeStoreEngine,
  ComputeStoreEntry,
  KernelComputeCapability,
  ResidentCacheBinding,
  ResidentExportEntry,
} from '#types/runtime-compute.types.js';

const implementationDigest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const { signal } = new AbortController();

const action = (value: number): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'test.semantic',
  producer: { id: 'test-kernel', version: '1', implementationAssets: [implementationDigest] },
  operation: 'make-box',
  inputs: [],
  arguments: { value },
  environment: { tolerance: 0.001 },
  codec: { id: 'test.brep', version: '1' },
});

const textCodec: CacheCodec<string> = {
  id: 'test.brep',
  version: '1',
  mediaType: 'application/vnd.opencascade.brep',
  encode: ({ value }) => new TextEncoder().encode(value),
  decode: ({ bytes }) => new TextDecoder().decode(bytes),
};

type Resident = ResidentCacheBinding & {
  readonly native: Map<ActionDigest, Uint8Array<ArrayBuffer>>;
  readonly exports: { count: number };
  /** A kernel would populate residency while executing the user program. */
  readonly seed: (digest: ActionDigest, value: ComputeAction, bytes: Uint8Array<ArrayBuffer>) => void;
};

const createResident = (input?: { readonly throwOnExport?: boolean }): Resident => {
  const native = new Map<ActionDigest, Uint8Array<ArrayBuffer>>();
  const actions = new Map<ActionDigest, ComputeAction>();
  const exports = { count: 0 };
  return {
    native,
    exports,
    seed: (digest, value, bytes) => {
      native.set(digest, bytes);
      actions.set(digest, value);
    },
    contains: ({ digest }) => native.has(digest),
    importEntries: async ({ entries }) => {
      for (const entry of entries) {
        native.set(entry.actionDigest, new Uint8Array(entry.bytes));
        actions.set(entry.actionDigest, entry.action);
      }
      return { imported: entries.map((entry) => entry.actionDigest), omitted: [] };
    },
    exportEntries: async ({ digests }) => {
      exports.count += 1;
      if (input?.throwOnExport) {
        throw new Error('export blew up');
      }
      const entries = [];
      const omitted: ActionDigest[] = [];
      for (const digest of digests) {
        const bytes = native.get(digest);
        const value = actions.get(digest);
        if (!bytes || !value) {
          omitted.push(digest);
          continue;
        }
        const exported: ResidentExportEntry = {
          action: value,
          bytes,
          mediaType: textCodec.mediaType,
          determinism: 'byte-exact',
        };
        entries.push(exported);
      }
      return { entries, omitted };
    },
    stats: () => ({
      entries: native.size,
      logicalBytes: 0,
      encodedBytes: { status: 'unsupported' },
      evictions: 0,
      omissions: 0,
    }),
    clear: () => {
      native.clear();
      actions.clear();
    },
  };
};

const onCapability = (capability: KernelComputeCapability): Extract<KernelComputeCapability, { status: 'on' }> => {
  if (capability.status !== 'on') {
    throw new Error('Expected an on capability.');
  }
  return capability;
};

describe('compute capability contract', () => {
  it('emits one settlement against the immutable scope operation identity', async () => {
    const summaries: Array<{ operationId: string; status: string }> = [];
    const admitted: Array<{ owner: string; operationId: string; status: string }> = [];
    let currentOwner = 'old-document';
    const admission = () => {
      const owner = currentOwner;
      return {
        onScopeSettled: ({
          operationId,
          settlement,
        }: Parameters<NonNullable<Parameters<typeof createComputeCapabilityHost>[0]['onScopeSettled']>>[0]) => {
          admitted.push({ owner, operationId, status: settlement.status });
        },
      };
    };
    const host = createComputeCapabilityHost({
      binding: { mode: 'memory' },
      workspace: 'w',
      onScopeSettled: ({ operationId, settlement }) => summaries.push({ operationId, status: settlement.status }),
    });
    const oldResident = createResident({ throwOnExport: true });
    const oldAdmission = admission();
    const oldCapability = onCapability(host.capability(signal, 'render-old', oldAdmission));
    const replacedObserver = vi.fn();
    oldAdmission.onScopeSettled = replacedObserver;
    const oldScope = oldCapability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: oldResident,
    });
    const digest = await digestAction({ action: action(99) });
    oldResident.seed(digest, action(99), new TextEncoder().encode('old'));
    oldScope.announce({
      entries: [{ kind: 'action', action: action(99), digest, computeDuration: 20, estimatedBytes: 3 }],
    });
    const oldReceipt = oldScope.close({ outcome: 'delivered' });

    currentOwner = 'new-document';
    const newScope = onCapability(host.capability(signal, 'render-new', admission())).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: createResident(),
    });
    const newReceipt = newScope.close({ outcome: 'cancelled' });
    currentOwner = 'unrelated-current-document';
    expect(oldScope.close({ outcome: 'failed' })).toBe(oldReceipt);
    expect(newScope.close({ outcome: 'delivered' })).toBe(newReceipt);
    host.permitPublication();

    await expect(oldReceipt.settled).resolves.toMatchObject({ status: 'failed', reason: 'export blew up' });
    await expect(newReceipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'cancelled' });
    expect(summaries).toStrictEqual([
      { operationId: 'render-new', status: 'abandoned' },
      { operationId: 'render-old', status: 'failed' },
    ]);
    expect(admitted).toStrictEqual([
      { owner: 'new-document', operationId: 'render-new', status: 'abandoned' },
      { owner: 'old-document', operationId: 'render-old', status: 'failed' },
    ]);
    await host.dispose();
    expect(summaries).toHaveLength(2);
    expect(admitted).toHaveLength(2);
    expect(replacedObserver).not.toHaveBeenCalled();
  });

  it.each(['delivered', 'cancelled', 'failed'] as const)(
    'keeps %s receipts and the host observer exactly once when capability telemetry throws',
    async (outcome) => {
      const observed = vi.fn();
      const telemetry = vi.fn(() => {
        throw new Error('Telemetry sink failed');
      });
      const host = createComputeCapabilityHost({
        binding: { mode: 'memory' },
        workspace: 'w',
        onScopeSettled: observed,
      });
      const scope = onCapability(host.capability(signal, 'actual-capability', { onScopeSettled: telemetry })).openScope(
        {
          namespace: 'test.semantic',
          producer: action(1).producer,
          environment: {},
          resident: createResident(),
        },
      );
      const receipt = scope.close({ outcome });
      expect(scope.close({ outcome })).toBe(receipt);
      host.permitPublication();
      await expect(receipt.settled).resolves.toMatchObject({
        status: outcome === 'delivered' ? 'published' : 'abandoned',
      });
      await host.dispose();
      expect(telemetry).toHaveBeenCalledTimes(1);
      expect(observed).toHaveBeenCalledTimes(1);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'actual-capability' }));
    },
  );

  it('U1: an off binding constructs nothing and carries no operations', () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'off' }, workspace: 'w' });
    const capability = host.capability(signal);
    expect(capability).toStrictEqual({ status: 'off' });
    expect('evaluate' in capability).toBe(false);
    expect('openScope' in capability).toBe(false);
    expect(host.control).toBeUndefined();
  });

  it('U9/U35: publication runs only after the runtime permits it, and close is idempotent', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const resident = createResident();
    const scope = onCapability(host.capability(signal)).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    const digest = await digestAction({ action: action(1) });
    resident.seed(digest, action(1), new TextEncoder().encode('brep-1'));
    scope.announce({
      entries: [{ kind: 'action', action: action(1), digest, computeDuration: 20, estimatedBytes: 6 }],
    });

    const receipt = scope.close({ outcome: 'delivered' });
    expect(scope.close({ outcome: 'delivered' })).toBe(receipt);
    await Promise.resolve();
    await Promise.resolve();
    expect(resident.exports.count, 'no encode before the delivery permit').toBe(0);

    host.permitPublication();
    await expect(receipt.settled).resolves.toMatchObject({ status: 'published', published: [digest] });
    expect(resident.exports.count, 'a repeated close does not export twice').toBe(1);
  });

  it('U36: pending publication bytes are bounded in aggregate across scopes', () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const open = () =>
      capability.openScope({
        namespace: 'test.semantic',
        producer: action(1).producer,
        environment: {},
        resident: createResident(),
      });
    const huge = 48 * 1024 * 1024;
    const first = open().announce({
      entries: [
        {
          kind: 'action',
          action: action(2),
          digest: '2'.repeat(64) as unknown as ActionDigest,
          computeDuration: 20,
          estimatedBytes: huge,
        },
      ],
    });
    const second = open().announce({
      entries: [
        {
          kind: 'action',
          action: action(3),
          digest: '3'.repeat(64) as unknown as ActionDigest,
          computeDuration: 20,
          estimatedBytes: huge,
        },
      ],
    });
    expect(first.admitted).toHaveLength(1);
    expect(second.rejected, 'the aggregate budget is shared, not per scope').toMatchObject([
      { reason: 'pending-budget' },
    ]);
  });

  it('U6/U37: a scope opened before a clear cannot refill the new generation', async () => {
    const digest = await digestAction({ action: action(4) });
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const resident = createResident();
    const capability = onCapability(host.capability(signal));
    const scope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    resident.seed(digest, action(4), new TextEncoder().encode('brep-4'));
    scope.announce({
      entries: [{ kind: 'action', action: action(4), digest, computeDuration: 20, estimatedBytes: 6 }],
    });

    await host.control!.clear({});
    const receipt = scope.close({ outcome: 'delivered' });
    host.permitPublication();
    await expect(receipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'stale-generation' });

    const stale = await scope.warm({ digests: [digest] });
    expect(stale).toStrictEqual({ status: 'stale-generation' });
  });

  it('U7: a throwing export settles failed and never leaves an unhandled rejection', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const resident = createResident({ throwOnExport: true });
    const scope = onCapability(host.capability(signal)).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    const digest = await digestAction({ action: action(5) });
    resident.seed(digest, action(5), new TextEncoder().encode('brep-5'));
    scope.announce({
      entries: [{ kind: 'action', action: action(5), digest, computeDuration: 20, estimatedBytes: 6 }],
    });
    const receipt = scope.close({ outcome: 'delivered' });
    host.permitPublication();
    await expect(receipt.settled).resolves.toMatchObject({ status: 'failed', reason: 'export blew up' });
  });

  it('U11: a cancelled operation publishes nothing and teardown settles within its budget', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const resident = createResident();
    const scope = onCapability(host.capability(signal)).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    const digest = await digestAction({ action: action(6) });
    resident.seed(digest, action(6), new TextEncoder().encode('brep-6'));
    scope.announce({
      entries: [{ kind: 'action', action: action(6), digest, computeDuration: 20, estimatedBytes: 6 }],
    });
    const receipt = scope.close({ outcome: 'cancelled' });
    await host.dispose();
    expect(resident.exports.count).toBe(0);
    await expect(receipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'cancelled' });
  });

  it('U23: a byte-exact conflict poisons its digest while the honest entries commit', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const honest = await digestAction({ action: action(7) });
    const contested = await digestAction({ action: action(8) });

    const publishOnce = async (contestedBytes: string): Promise<void> => {
      const resident = createResident();
      const scope = capability.openScope({
        namespace: 'test.semantic',
        producer: action(1).producer,
        environment: {},
        resident,
      });
      resident.seed(honest, action(7), new TextEncoder().encode('honest'));
      resident.seed(contested, action(8), new TextEncoder().encode(contestedBytes));
      scope.announce({
        entries: [
          { kind: 'action', action: action(7), digest: honest, computeDuration: 20, estimatedBytes: 6 },
          { kind: 'action', action: action(8), digest: contested, computeDuration: 20, estimatedBytes: 6 },
        ],
      });
      const receipt = scope.close({ outcome: 'delivered' });
      host.permitPublication();
      const settlement = await receipt.settled;
      expect(settlement.status).toBe('published');
    };

    await publishOnce('first');
    const resident = createResident();
    const scope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    resident.seed(honest, action(7), new TextEncoder().encode('honest'));
    resident.seed(contested, action(8), new TextEncoder().encode('second'));
    scope.announce({
      entries: [
        { kind: 'action', action: action(7), digest: honest, computeDuration: 20, estimatedBytes: 6 },
        { kind: 'action', action: action(8), digest: contested, computeDuration: 20, estimatedBytes: 6 },
      ],
    });
    const receipt = scope.close({ outcome: 'delivered' });
    host.permitPublication();
    const settlement = await receipt.settled;
    expect(settlement.published, 'the honest entry still commits').toContain(honest);
    expect(settlement.conflicts).toMatchObject([{ outcome: 'poisoned' }]);
  });

  it('U18: no path, handle or port crosses the contract', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const resident = createResident();
    const scope = onCapability(host.capability(signal)).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident,
    });
    const digest = await digestAction({ action: action(9) });
    resident.seed(digest, action(9), new TextEncoder().encode('brep-9'));
    scope.announce({
      entries: [{ kind: 'action', action: action(9), digest, computeDuration: 20, estimatedBytes: 6 }],
    });
    const receipt = scope.close({ outcome: 'delivered' });
    host.permitPublication();
    const settlement = await receipt.settled;
    const wire = JSON.stringify({ settlement, warm: await scope.warm({ digests: [digest] }) });
    expect(wire).not.toContain('.tau/cache');
    expect(wire).not.toContain('/Users/');
    // No path, handle or port key anywhere in the contract's observable values.
    expect(wire).not.toMatch(/"(path|handle|port|url|root|workspace)"\s*:/u);
  });

  it('U30/U38: required durability over memory is refused, and policies do not share a flight', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const retention: CacheRetention = _mintComputeRetention({ name: 'job-1' });
    const compute = vi.fn(async () => 'value');

    await expect(
      capability.evaluate({ action: action(10), codec: textCodec, policy: 'required', retention, compute }),
    ).rejects.toThrow(/durab/iu);

    const best = await capability.evaluate({
      action: action(10),
      codec: textCodec,
      policy: 'best-effort',
      compute,
    });
    expect(best.value).toBe('value');
    // A weaker-policy success never satisfies a required caller: it still refuses.
    await expect(
      capability.evaluate({ action: action(10), codec: textCodec, policy: 'required', retention, compute }),
    ).rejects.toThrow(/durab/iu);
  });

  it('U8: a second scope imports a published prefix in one bounded request', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const producerResident = createResident();
    const producerScope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: producerResident,
    });
    const digest = await digestAction({ action: action(11) });
    producerResident.seed(digest, action(11), new TextEncoder().encode('prefix'));
    producerScope.announce({
      entries: [{ kind: 'action', action: action(11), digest, computeDuration: 40, estimatedBytes: 6 }],
    });
    const receipt = producerScope.close({ outcome: 'delivered' });
    host.permitPublication();
    await receipt.settled;

    const consumerResident = createResident();
    const consumerScope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: consumerResident,
    });
    await expect(consumerScope.warm({ digests: [digest] })).resolves.toMatchObject({
      status: 'imported',
      imported: [digest],
    });
    expect(consumerResident.native.get(digest)).toStrictEqual(new TextEncoder().encode('prefix'));
  });

  it('admits only results above the measured floor and deduplicates before charging', () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const scope = onCapability(host.capability(signal)).openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: createResident(),
      admissionFloor: 5,
    });
    const digest = '4'.repeat(64) as unknown as ActionDigest;
    expect(
      scope.announce({
        entries: [{ kind: 'action', action: action(12), digest, computeDuration: 1, estimatedBytes: 6 }],
      }).rejected,
    ).toMatchObject([{ reason: 'below-floor' }]);
    scope.announce({
      entries: [{ kind: 'action', action: action(12), digest, computeDuration: 9, estimatedBytes: 6 }],
    });
    expect(
      scope.announce({
        entries: [{ kind: 'action', action: action(12), digest, computeDuration: 9, estimatedBytes: 6 }],
      }).rejected,
    ).toMatchObject([{ reason: 'duplicate' }]);
  });

  it('degrades an unresolvable durable spec to memory with one diagnostic', () => {
    const diagnostics: string[] = [];
    // A spec no host authority minted: unresolvable and therefore rejected.
    const forged: ComputeStore = Object.freeze({}) as ComputeStore;
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: forged },
      workspace: 'w',
      onDiagnostic: (message) => diagnostics.push(message),
    });
    expect(onCapability(host.capability(signal)).mode).toBe('memory');
    expect(diagnostics).toHaveLength(1);
  });

  it('M1: the delivery permit is per operation, not a one-shot latch', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const stage = async (value: number, resident: Resident) => {
      const scope = capability.openScope({
        namespace: 'test.semantic',
        producer: action(1).producer,
        environment: {},
        resident,
      });
      const digest = await digestAction({ action: action(value) });
      resident.seed(digest, action(value), new TextEncoder().encode(`brep-${String(value)}`));
      scope.announce({
        entries: [{ kind: 'action', action: action(value), digest, computeDuration: 20, estimatedBytes: 6 }],
      });
      return scope;
    };

    const firstResident = createResident();
    const first = await stage(20, firstResident);
    const firstReceipt = first.close({ outcome: 'delivered' });
    host.permitPublication();
    await firstReceipt.settled;

    const secondResident = createResident();
    const second = await stage(21, secondResident);
    const secondReceipt = second.close({ outcome: 'delivered' });
    // One macrotask drains every microtask the publication tail could be waiting on.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(secondResident.exports.count, 'a permitted first operation does not permit the second').toBe(0);

    host.permitPublication();
    await expect(secondReceipt.settled).resolves.toMatchObject({ status: 'published' });
  });

  it('U9/I2: repeated permits cannot start one publication twice', async () => {
    const exportGate = Promise.withResolvers<void>();
    const baseResident = createResident();
    const resident: Resident = {
      ...baseResident,
      async exportEntries(request) {
        await exportGate.promise;
        return baseResident.exportEntries(request);
      },
    };
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const value = action(22);
    const digest = await digestAction({ action: value });
    resident.seed(digest, value, new TextEncoder().encode('brep-22'));
    const scope = capability.openScope({
      namespace: 'test.semantic',
      producer: value.producer,
      environment: {},
      resident,
    });
    scope.announce({ entries: [{ kind: 'action', action: value, digest, computeDuration: 20, estimatedBytes: 7 }] });
    const receipt = scope.close({ outcome: 'delivered' });

    host.permitPublication();
    host.permitPublication();
    exportGate.resolve();

    await expect(receipt.settled).resolves.toMatchObject({ status: 'published' });
    expect(resident.exports.count).toBe(1);
  });

  it('M2: a durable engine pins what evaluate published, because publish writes through the session', async () => {
    const puts: ActionDigest[] = [];
    const pins: CacheRetention[] = [];
    const stored = new Map<ActionDigest, ComputeStoreEntry>();
    let generation = 1 as ComputeGeneration;
    const engine: ComputeStoreEngine = {
      open: async () => ({
        generation,
        durable: true,
        get: async ({ digests, generation: requested }) =>
          requested === generation
            ? {
                status: 'ok',
                entries: digests.flatMap((digest) => {
                  const entry = stored.get(digest);
                  return entry ? [entry] : [];
                }),
                omitted: digests
                  .filter((digest) => !stored.has(digest))
                  .map((digest) => ({ digest, reason: 'missing' })),
              }
            : { status: 'stale-generation', generation },
        put: async ({ entries, generation: requested }) => {
          if (requested === generation) {
            for (const entry of entries) {
              stored.set(entry.actionDigest, entry);
              puts.push(entry.actionDigest);
            }
            return { status: 'committed', published: entries.map((entry) => entry.actionDigest), conflicts: [] };
          }
          return { status: 'stale-generation', generation };
        },
        // A durable backend can only pin bytes it actually received.
        pin: async ({ digests, retention, generation: requested }) => {
          if (requested !== generation) {
            return { status: 'stale-generation', generation };
          }
          if (!digests.every((digest) => stored.has(digest))) {
            return { status: 'missing', digests };
          }
          pins.push(retention);
          return { status: 'pinned', pinned: digests };
        },
        release: async () => ({ status: 'released' }),
        close: async () => {
          // The fake engine holds no resources.
        },
      }),
    };
    const control: ComputeStoreControl = {
      inspect: async () => ({
        entries: stored.size,
        logicalBytes: 0,
        pinnedBytes: 0,
        pendingBytes: 0,
        generation,
        physicalBytes: { status: 'unsupported' },
      }),
      clear: async () => {
        stored.clear();
        generation = (generation + 1) as ComputeGeneration;
        return { status: 'cleared', generation, retained: 0 };
      },
      collect: async () => ({ status: 'complete', reclaimed: 0 }),
    };
    const store = _registerComputeStore({ spec: Object.freeze({}) as ComputeStore, engine, workspace: 'w', control });
    const host = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    expect(capability.mode).toBe('durable');

    const digest = await digestAction({ action: action(13) });
    const result = await capability.evaluate({
      action: action(13),
      codec: textCodec,
      policy: 'required',
      retention: _mintComputeRetention({ name: 'job-2' }),
      compute: async () => 'durable-value',
    });
    expect(result.value).toBe('durable-value');
    expect(puts, 'evaluate publishes through the one store session').toContain(digest);

    const canceledOwner = _mintComputeRetention({ name: 'canceled' });
    const survivingOwner = _mintComputeRetention({ name: 'surviving' });
    const controller = new AbortController();
    let markStarted!: () => void;
    let release!: (value: string) => void;
    let markAttached!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const attached = new Promise<void>((resolve) => {
      markAttached = resolve;
    });
    const work = new Promise<string>((resolve) => {
      release = resolve;
    });
    const sharedCompute = vi.fn(async () => {
      markStarted();
      return work;
    });
    const canceled = capability.evaluate({
      action: action(14),
      codec: textCodec,
      policy: 'required',
      retention: canceledOwner,
      signal: controller.signal,
      compute: sharedCompute,
    });
    await started;
    const surviving = capability.evaluate({
      action: action(14),
      codec: textCodec,
      policy: 'required',
      retention: survivingOwner,
      get signal() {
        markAttached();
        return signal;
      },
      compute: sharedCompute,
    });
    await attached;
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    release('shared');
    const survivingResult = await surviving;
    expect(survivingResult.value).toBe('shared');
    expect(
      survivingResult.source === 'computed' && survivingResult.publication.status === 'stored'
        ? survivingResult.publication.retention
        : undefined,
    ).toBe(survivingOwner);
    expect(sharedCompute).toHaveBeenCalledOnce();
    const sharedDigest = await digestAction({ action: action(14) });
    expect(puts.filter((value) => value === sharedDigest)).toHaveLength(1);
    expect(pins).toContain(survivingOwner);
    expect(pins).not.toContain(canceledOwner);

    await control.clear({});
    let recomputes = 0;
    const evaluateAfterClear = async () =>
      capability.evaluate({
        action: action(15),
        codec: textCodec,
        policy: 'required',
        retention: _mintComputeRetention({ name: 'job-after-clear' }),
        compute: async () => {
          recomputes += 1;
          return 'after-clear';
        },
      });
    await expect(evaluateAfterClear()).resolves.toMatchObject({ value: 'after-clear' });
    await expect(evaluateAfterClear()).resolves.toMatchObject({ value: 'after-clear' });
    expect(recomputes).toBe(1);
  });

  it('S5: a clear landing during the import fences the warm instead of importing stale entries', async () => {
    const durable = createMemoryComputeEngine();
    const control = durable.control({ workspace: 'w' });
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      engine: durable.engine,
      workspace: 'w',
      control,
    });
    const host = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'w' });
    const capability = onCapability(host.capability(signal));
    const producerResident = createResident();
    const producerScope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: producerResident,
    });
    const digest = await digestAction({ action: action(14) });
    producerResident.seed(digest, action(14), new TextEncoder().encode('warm-14'));
    producerScope.announce({
      entries: [{ kind: 'action', action: action(14), digest, computeDuration: 20, estimatedBytes: 6 }],
    });
    const receipt = producerScope.close({ outcome: 'delivered' });
    host.permitPublication();
    await receipt.settled;

    const consumerResident = createResident();
    const consumerScope = capability.openScope({
      namespace: 'test.semantic',
      producer: action(1).producer,
      environment: {},
      resident: {
        ...consumerResident,
        // The clear lands after `get` resolved and before `importEntries` does.
        importEntries: async (input) => {
          await host.control!.clear({});
          return consumerResident.importEntries(input);
        },
      },
    });
    await expect(consumerScope.warm({ digests: [digest] })).resolves.toStrictEqual({ status: 'stale-generation' });
  });

  it('reports maintained counters and a discriminated unknown physical size', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'w' });
    const report = await host.control!.inspect({});
    expect(report).toMatchObject({
      entries: 0,
      pinnedBytes: 0,
      physicalBytes: { status: 'unsupported' },
      generation: 1 as ComputeGeneration,
    });
  });
});

describe('opaque shared content closure', () => {
  const partsCodec: CacheCodec<Uint8Array<ArrayBuffer>> = {
    id: 'test.brep',
    version: '1',
    mediaType: 'application/json',
    encode: async ({ value }) => ({
      bytes: new TextEncoder().encode(await digestContent({ bytes: value })),
      content: [value, value],
    }),
    decode: async ({ bytes, readContent }) => {
      const digest = contentDigest({ value: new TextDecoder().decode(bytes) });
      const value = await readContent?.({ digest });
      if (!value) {
        throw new Error('Missing leaf.');
      }
      return value;
    },
  };

  it('should store two metadata actions with one actual byte leaf and restores both after host restart', async () => {
    const memory = createMemoryComputeEngine();
    const control = memory.control({ workspace: 'parts' });
    const leafReadBudgets: number[] = [];
    const engine: ComputeStoreEngine = {
      open: async (input) => {
        const session = await memory.engine.open(input);
        return {
          ...session,
          get: async (request) => {
            const result = await session.get(request);
            if (
              result.status === 'ok' &&
              result.entries.some((entry) => entry.action.namespace === 'tau.compute.content')
            ) {
              leafReadBudgets.push(request.maxBytes);
            }
            return result;
          },
        };
      },
    };
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      engine,
      workspace: 'parts',
      control,
    });
    const value = new Uint8Array(1024).fill(42);
    const host = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts' });
    onTestFinished(async () => host.dispose());
    const capability = onCapability(host.capability(signal));
    for (const id of [81, 82]) {
      // oxlint-disable-next-line no-await-in-loop -- prove separate ordered actions share the same immutable content entry.
      await capability.evaluate({
        action: action(id),
        codec: partsCodec,
        policy: 'best-effort',
        compute: async () => value,
      });
    }
    const metadata = new TextEncoder().encode(await digestContent({ bytes: value }));
    expect(await control.inspect({})).toMatchObject({
      entries: 3,
      logicalBytes: value.byteLength + 2 * metadata.byteLength,
    });
    await host.dispose();
    const restarted = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts' });
    onTestFinished(async () => restarted.dispose());
    const compute = vi.fn(async () => new Uint8Array([99]));
    for (const id of [81, 82]) {
      // oxlint-disable-next-line no-await-in-loop -- cold host hydration must recover both roots through the same leaf action.
      const result = await onCapability(restarted.capability(signal)).evaluate({
        action: action(id),
        codec: partsCodec,
        policy: 'best-effort',
        compute,
      });
      expect(result).toMatchObject({ source: 'cache', value });
      result.value[0] = 0;
    }
    expect(compute).not.toHaveBeenCalled();
    expect(value[0]).toBe(42);
    expect(leafReadBudgets).toEqual([64 * 1024 * 1024 - metadata.byteLength]);
  });

  it.each(['missing', 'corrupt', 'identity', 'generation', 'over-budget'] as const)(
    'should recompute instead of admitting a %s leaf closure',
    async (fault) => {
      const memory = createMemoryComputeEngine();
      const control = memory.control({ workspace: 'parts-fault' });
      let inject = false;
      const hash = vi.spyOn(crypto.subtle, 'digest');
      onTestFinished(() => {
        hash.mockRestore();
      });
      const engine: ComputeStoreEngine = {
        open: async (input) => {
          const session = await memory.engine.open(input);
          return {
            ...session,
            get: async (request) => {
              const result = await session.get(request);
              if (
                inject &&
                result.status === 'ok' &&
                result.entries.some((entry) => entry.action.namespace === 'tau.compute.content')
              ) {
                if (fault === 'generation') {
                  await control.clear({});
                }
                if (fault === 'missing') {
                  return { status: 'ok', entries: [], omitted: [] };
                }
                if (fault === 'identity') {
                  return {
                    ...result,
                    entries: result.entries.map((entry) => ({
                      ...entry,
                      action: { ...entry.action, operation: 'wrong' },
                    })),
                  };
                }
                if (fault === 'corrupt') {
                  return {
                    ...result,
                    entries: result.entries.map((entry) => ({ ...entry, bytes: new Uint8Array([0]) })),
                  };
                }
                if (fault === 'over-budget') {
                  return {
                    ...result,
                    entries: result.entries.map((entry) => ({
                      ...entry,
                      bytes: new Uint8Array(request.maxBytes + 1),
                    })),
                  };
                }
              }
              return result;
            },
          };
        },
      };
      const store = _registerComputeStore({
        spec: Object.freeze({}) as ComputeStore,
        engine,
        workspace: 'parts-fault',
        control,
      });
      const first = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts-fault' });
      await onCapability(first.capability(signal)).evaluate({
        action: action(83),
        codec: partsCodec,
        policy: 'best-effort',
        compute: async () => new Uint8Array([42]),
      });
      await first.dispose();
      inject = true;
      const restarted = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts-fault' });
      onTestFinished(async () => restarted.dispose());
      const compute = vi.fn(async () => new Uint8Array([99]));
      expect(
        await onCapability(restarted.capability(signal)).evaluate({
          action: action(83),
          codec: partsCodec,
          policy: 'best-effort',
          compute,
        }),
      ).toMatchObject({ source: 'computed', value: new Uint8Array([99]) });
      expect(compute).toHaveBeenCalledOnce();
      if (fault === 'over-budget') {
        expect(hash.mock.calls.every(([, bytes]) => bytes.byteLength < 64 * 1024 * 1024 - 128)).toBe(true);
      }
    },
  );

  it('should refuse publication of a computation captured before clear', async () => {
    const memory = createMemoryComputeEngine();
    const control = memory.control({ workspace: 'parts-clear' });
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      engine: memory.engine,
      workspace: 'parts-clear',
      control,
    });
    const host = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts-clear' });
    onTestFinished(async () => host.dispose());
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const running = onCapability(host.capability(signal)).evaluate({
      action: action(84),
      codec: partsCodec,
      policy: 'best-effort',
      compute: async () => {
        started.resolve();
        return finish.promise;
      },
    });
    await started.promise;
    await control.clear({});
    finish.resolve(new Uint8Array([42]));
    expect(await running).toMatchObject({ source: 'computed', publication: { status: 'skipped' } });
    expect(await control.inspect({})).toMatchObject({ entries: 0, logicalBytes: 0 });
  });

  it('should recompute when clear occurs during asynchronous decoding', async () => {
    const host = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'parts-decode' });
    onTestFinished(async () => host.dispose());
    const capability = onCapability(host.capability(signal));
    await capability.evaluate({
      action: action(85),
      codec: partsCodec,
      policy: 'best-effort',
      compute: async () => new Uint8Array([42]),
    });
    const codec: CacheCodec<Uint8Array<ArrayBuffer>> = {
      ...partsCodec,
      decode: async (input) => {
        const value = await partsCodec.decode(input);
        await host.control?.clear({});
        return value;
      },
    };
    const compute = vi.fn(async () => new Uint8Array([99]));
    expect(await capability.evaluate({ action: action(85), codec, policy: 'best-effort', compute })).toMatchObject({
      source: 'computed',
      value: new Uint8Array([99]),
    });
    expect(compute).toHaveBeenCalledOnce();
  });

  it('should promote the complete shared closure and restore it from a restarted SQLite engine', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-runtime-parts-'));
    onTestFinished(async () => rm(directory, { recursive: true, force: true }));
    const value = new Uint8Array(1024).fill(42);
    const retention = _mintComputeRetention({ name: 'shared-parts-job' });
    const openHost = async () => {
      const sqlite = createSqliteComputeEngine({ directory });
      const control = await sqlite.control({ workspace: 'parts-durable' });
      const store = _registerComputeStore({
        spec: Object.freeze({}) as ComputeStore,
        engine: sqlite.engine,
        workspace: 'parts-durable',
        control,
      });
      const host = createComputeCapabilityHost({ binding: { mode: 'durable', store }, workspace: 'parts-durable' });
      return { sqlite, host, control };
    };
    const first = await openHost();
    try {
      const result = await onCapability(first.host.capability(signal)).evaluate({
        action: action(86),
        codec: partsCodec,
        policy: 'required',
        retention,
        compute: async () => value,
      });
      expect(result).toMatchObject({ source: 'computed', publication: { status: 'stored', retention } });
      expect(await first.control.inspect({})).toMatchObject({ entries: 2, pinnedBytes: 1024 + 71 });
    } finally {
      await first.host.dispose();
      await first.sqlite.dispose();
    }
    const restarted = await openHost();
    try {
      const compute = vi.fn(async () => new Uint8Array([99]));
      expect(
        await onCapability(restarted.host.capability(signal)).evaluate({
          action: action(86),
          codec: partsCodec,
          policy: 'required',
          retention,
          compute,
        }),
      ).toMatchObject({ source: 'cache', value, retention });
      expect(compute).not.toHaveBeenCalled();
    } finally {
      await restarted.host.dispose();
      await restarted.sqlite.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
