// @vitest-environment node
import { contentDigest, digestAction, digestContent } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import type { ComputeGeneration, ComputeReuseScope, ComputeStoreEntry } from '@taucad/runtime/kernel';
import { describe, expect, it, vi } from 'vitest';

import { createReplicadComputeReuse } from '#replicad-compute-reuse.js';

type FakeBooleanOptions = { readonly [key: string]: unknown; readonly optimisation?: string };

class FakeShape {
  public deleted = false;
  public readonly value: string;

  public constructor(serialized: string) {
    this.value = serialized;
  }

  public serialize(): string {
    return this.value;
  }

  public delete(): void {
    this.deleted = true;
  }

  public fuse(other: FakeShape, options: FakeBooleanOptions = {}): FakeShape {
    return new FakeShape(`fuse(${this.value},${other.value},${options.optimisation ?? 'none'})`);
  }

  public fuseAll(others: readonly FakeShape[], options: { readonly optimisation?: string } = {}): FakeShape {
    return new FakeShape(
      `fuse(${this.value},${others.map(({ value }) => value).join('+')},${options.optimisation ?? 'none'})`,
    );
  }

  public cut(other: FakeShape, options: { readonly optimisation?: string } = {}): FakeShape {
    return new FakeShape(`cut(${this.value},${other.value},${options.optimisation ?? 'none'})`);
  }

  public cutAll(others: readonly FakeShape[], options: { readonly optimisation?: string } = {}): FakeShape {
    return new FakeShape(
      `cut(${this.value},${others.map(({ value }) => value).join('+')},${options.optimisation ?? 'none'})`,
    );
  }

  public intersect(other: FakeShape, options: { readonly optimisation?: string } = {}): FakeShape {
    return new FakeShape(`intersect(${this.value},${other.value},${options.optimisation ?? 'none'})`);
  }

  public intersectAll(others: readonly FakeShape[], options: { readonly optimisation?: string } = {}): FakeShape {
    return new FakeShape(
      `intersect(${this.value},${others.map(({ value }) => value).join('+')},${options.optimisation ?? 'none'})`,
    );
  }

  public translate(...values: readonly unknown[]): FakeShape {
    this.delete();
    return new FakeShape(`translate(${this.value},${JSON.stringify(values)})`);
  }

  public translateX(distance: number): FakeShape {
    this.delete();
    return new FakeShape(`translateX(${this.value},${String(distance)})`);
  }

  public translateY(distance: number): FakeShape {
    this.delete();
    return new FakeShape(`translateY(${this.value},${String(distance)})`);
  }

  public translateZ(distance: number): FakeShape {
    this.delete();
    return new FakeShape(`translateZ(${this.value},${String(distance)})`);
  }

  public rotate(...values: readonly unknown[]): FakeShape {
    this.delete();
    return new FakeShape(`rotate(${this.value},${JSON.stringify(values)})`);
  }

  public unknown(): FakeShape {
    return new FakeShape(`unknown(${this.value})`);
  }
}

type CacheEntry = ComputeStoreEntry;

type Adapter = ReturnType<typeof createReplicadComputeReuse>;

/**
 * A minimal stand-in for the runtime's scope: it records announcements and, on
 * a delivered close, exports the adapter's residency into the shared store.
 */
const createScope = (adapter: Adapter, cache: Map<ActionDigest, CacheEntry>) => {
  const announced: ActionDigest[] = [];
  const announce = vi.fn<ComputeReuseScope['announce']>(({ entries }) => {
    const admitted: ActionDigest[] = [];
    for (const entry of entries) {
      if (entry.kind === 'action') {
        announced.push(entry.digest);
        admitted.push(entry.digest);
      }
    }
    return { admitted, rejected: [] };
  });
  const scope: ComputeReuseScope = {
    generation: 1 as ComputeGeneration,
    warm: async () => ({ status: 'imported', imported: [], omitted: [], bytes: 0 }),
    announce,
    close: ({ outcome }) => ({
      settled: (async () => {
        if (outcome !== 'delivered') {
          return { status: 'abandoned', published: [], omitted: announced, conflicts: [] } as const;
        }
        const exported = await adapter.resident.exportEntries({
          digests: announced,
          signal: new AbortController().signal,
        });
        for (const entry of exported.entries) {
          // oxlint-disable-next-line no-await-in-loop -- each entry carries its own content identity.
          const digest = await digestAction({ action: entry.action });
          cache.set(digest, {
            action: entry.action,
            actionDigest: digest,
            // oxlint-disable-next-line no-await-in-loop -- content identity is per entry.
            contentDigest: await digestContent({ bytes: entry.bytes }),
            mediaType: entry.mediaType,
            bytes: new Uint8Array(entry.bytes),
            determinism: entry.determinism,
          });
        }
        return { status: 'published', published: [...cache.keys()], omitted: exported.omitted, conflicts: [] } as const;
      })(),
    }),
  };
  const publish = async (): Promise<void> => {
    await scope.close({ outcome: 'delivered' }).settled;
  };
  return { scope, announce, publish };
};

const producer = (version = 'test@1'): ComputeAction['producer'] => ({
  id: '@taucad/replicad-test',
  version,
  implementationAssets: [contentDigest({ value: `sha256:${'a'.repeat(64)}` })],
});

const createFixture = (
  input: { readonly enabled?: boolean; readonly version?: string; readonly environment?: string } = {},
) => {
  const calls = { box: 0, cylinder: 0, sphere: 0, deserialize: 0 };
  const library = {
    makeBox(first: readonly number[], second: readonly number[]) {
      calls.box += 1;
      return new FakeShape(`box(${first.join(',')};${second.join(',')})`);
    },
    // oxlint-disable-next-line max-params -- mirrors Replicad's public four-argument API exactly.
    makeCylinder(radius: number, height: number, location = [0, 0, 0], direction = [0, 0, 1]) {
      calls.cylinder += 1;
      return new FakeShape(`cylinder(${radius},${height};${location.join(',')};${direction.join(',')})`);
    },
    makeSphere(radius: number) {
      calls.sphere += 1;
      return new FakeShape(`sphere(${String(radius)})`);
    },
    deserializeShape(serialized: string) {
      calls.deserialize += 1;
      if (serialized === 'invalid') {
        throw new Error('invalid BRep');
      }
      return new FakeShape(serialized);
    },
    untouched: { exact: true },
  };
  return {
    calls,
    adapter: createReplicadComputeReuse({
      library,
      enabled: input.enabled ?? true,
      producer: producer(input.version),
      environment: { variant: input.environment ?? 'single' },
    }),
  };
};

describe('Replicad semantic compute reuse', () => {
  it('preserves destructured synchronous syntax, hits exact actions, and restores fresh shapes', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    const { adapter, calls } = createFixture();
    const { makeBox } = adapter.library as typeof adapter.library & {
      makeBox(first: readonly number[], second: readonly number[]): FakeShape;
    };
    const cold = createScope(adapter, cache);
    const first = await adapter.run(cold.scope, async () => makeBox([0, 0, 0], [2, 3, 4]));
    await cold.publish();
    expect(first.serialize()).toBe('box(0,0,0;2,3,4)');
    expect(calls.box).toBe(1);

    const warm = createScope(adapter, cache);
    const second = await adapter.run(warm.scope, async () => makeBox([-0, 0, 0], [2, 3, 4]));
    const third = await adapter.run(warm.scope, async () => makeBox([0, 0, 0], [2, 3, 4]));
    expect(calls.box).toBe(1);
    expect(calls.deserialize).toBe(2);
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
    second.delete();
    expect(second.deleted).toBe(true);
    expect(third.deleted).toBe(false);
    expect(second.serialize()).toBe(first.serialize());
  });

  it('reuses boolean and consuming transform descendants while preserving exact output', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    const { adapter, calls } = createFixture();
    const library = adapter.library as typeof adapter.library & {
      makeBox(first: readonly number[], second: readonly number[]): FakeShape;
      makeCylinder(radius: number, height: number): FakeShape;
    };
    const build = async (scope: ComputeReuseScope) =>
      adapter.run(scope, async () => {
        const box = library.makeBox([0, 0, 0], [10, 10, 10]);
        const cylinder = library.makeCylinder(2, 10);
        return box.cut(cylinder, { optimisation: 'commonFace' }).translateZ(5);
      });

    const cold = createScope(adapter, cache);
    const first = await build(cold.scope);
    await cold.publish();
    const warm = createScope(adapter, cache);
    const second = await build(warm.scope);
    expect(second.serialize()).toBe(first.serialize());
    expect(calls).toMatchObject({ box: 1, cylinder: 1, deserialize: 4 });
  });

  it('invalidates arguments, implementation versions, and environments independently', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    for (const fixture of [
      createFixture(),
      createFixture({ version: 'test@2' }),
      createFixture({ environment: 'multi' }),
    ]) {
      const session = createScope(fixture.adapter, cache);
      const library = fixture.adapter.library as typeof fixture.adapter.library & {
        makeSphere(radius: number): FakeShape;
      };
      // oxlint-disable-next-line no-await-in-loop -- each warm stage depends on the preceding publication.
      await fixture.adapter.run(session.scope, async () => library.makeSphere(2));
      // oxlint-disable-next-line no-await-in-loop -- preserve deterministic cache publication order.
      await session.publish();
      expect(fixture.calls.sphere).toBe(1);
    }
    const base = createFixture();
    const changedArgument = createScope(base.adapter, cache);
    const library = base.adapter.library as typeof base.adapter.library & { makeSphere(radius: number): FakeShape };
    await base.adapter.run(changedArgument.scope, async () => library.makeSphere(3));
    expect(base.calls.sphere).toBe(1);
  });

  it('bypasses unknown, incomplete, mutable, and unserializable calls without false hits', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    const { adapter, calls } = createFixture();
    const session = createScope(adapter, cache);
    const library = adapter.library as typeof adapter.library & {
      makeBox(first: unknown, second: unknown): FakeShape;
      makeCylinder(...values: unknown[]): FakeShape;
      makeSphere(radius: number): FakeShape;
    };
    await adapter.run(session.scope, async () => {
      expect((adapter.library as unknown as { untouched: unknown }).untouched).toEqual({ exact: true });
      const invalid = library.makeSphere(Number.NaN);
      expect(invalid.serialize()).toBe('sphere(NaN)');
      library.makeBox([0, 0], [1, 1, 1]);
      library.makeCylinder(1);
      const rawOperand = new FakeShape('raw');
      const supported = library.makeSphere(1);
      expect(supported.fuse(rawOperand).serialize()).toContain('raw');
      expect(supported.fuse(library.makeSphere(2), { extra: true }).serialize()).toContain('fuse');
      expect(supported.unknown().serialize()).toContain('unknown');
    });
    expect(calls).toMatchObject({ box: 1, cylinder: 1, sphere: 3 });
  });

  it('does not publish failed executions and safely recomputes rejected or invalid hits', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    const { adapter, calls } = createFixture();
    const library = adapter.library as typeof adapter.library & { makeSphere(radius: number): FakeShape };
    const failed = createScope(adapter, cache);
    await expect(
      adapter.run(failed.scope, async () => {
        library.makeSphere(4);
        throw new Error('model failed');
      }),
    ).rejects.toThrow('model failed');
    expect(cache).toHaveLength(0);

    const rejected = createScope(adapter, cache);
    await adapter.run(rejected.scope, async () => library.makeSphere(5));
    expect(calls.sphere).toBe(2);

    const seed = createScope(adapter, cache);
    await adapter.run(seed.scope, async () => library.makeSphere(6));
    await seed.publish();
    const key = [...cache.keys()].find(
      (candidate) => JSON.stringify(cache.get(candidate)!.action.arguments) === '{"radius":6}',
    )!;
    const corrupted: CacheEntry = { ...cache.get(key)!, bytes: new TextEncoder().encode('invalid') };
    cache.set(key, corrupted);
    // A warm import replaces residency with the store's (now corrupt) bytes.
    adapter.resident.clear({ generation: 1 as ComputeGeneration });
    await adapter.resident.importEntries({ entries: [corrupted], signal: new AbortController().signal });
    const corrupt = createScope(adapter, cache);
    const recomputed = await adapter.run(corrupt.scope, async () => library.makeSphere(6));
    expect(recomputed.serialize()).toBe('sphere(6)');
    expect(calls.sphere).toBe(4);
  });

  it('disables interception without assets and unwraps shape arrays and render records', async () => {
    const cache = new Map<ActionDigest, CacheEntry>();
    const { adapter, calls } = createFixture({ enabled: false });
    const session = createScope(adapter, cache);
    const library = adapter.library as typeof adapter.library & { makeSphere(radius: number): FakeShape };
    const raw = await adapter.run(session.scope, async () => library.makeSphere(1));
    expect(calls.sphere).toBe(1);
    expect(session.announce).not.toHaveBeenCalled();
    expect(adapter.unwrap(raw)).toBe(raw);

    const enabled = createFixture().adapter;
    const enabledSession = createScope(enabled, cache);
    const wrapped = await enabled.run(enabledSession.scope, async () =>
      (enabled.library as typeof enabled.library & { makeSphere(radius: number): FakeShape }).makeSphere(9),
    );
    expect(enabled.unwrap([wrapped])).toEqual([expect.objectContaining({ value: 'sphere(9)' })]);
    expect(enabled.unwrap({ shape: wrapped, color: 'red' })).toMatchObject({
      shape: { value: 'sphere(9)' },
      color: 'red',
    });
  });
});
