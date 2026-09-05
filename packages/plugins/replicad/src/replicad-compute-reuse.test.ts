// @vitest-environment node
import { createHash } from 'node:crypto';

import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import type { KernelComputeSession } from '@taucad/runtime/kernel';
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

type CacheEntry = { readonly bytes: Uint8Array<ArrayBuffer>; readonly actionDigest: ActionDigest };

const digestFor = (value: string): ActionDigest =>
  actionDigest({ value: `sha256:${createHash('sha256').update(value).digest('hex')}` });

const createSession = (cache: Map<string, CacheEntry>, overrides: Partial<KernelComputeSession> = {}) => {
  const staged = new Map<string, CacheEntry>();
  const record = vi.fn<KernelComputeSession['record']>(({ action, bytes }) => {
    const key = canonicalizeComputeAction(action);
    const entry = { bytes: new Uint8Array(bytes), actionDigest: digestFor(key) };
    staged.set(key, entry);
    return { status: 'staged', actionDigest: entry.actionDigest };
  });
  const session: KernelComputeSession = {
    prepared: () => [],
    lookup: ({ action }) => {
      const key = canonicalizeComputeAction(action);
      const stagedEntry = staged.get(key);
      if (stagedEntry) {
        return {
          status: 'hit',
          source: 'session',
          bytes: new Uint8Array(stagedEntry.bytes),
          actionDigest: stagedEntry.actionDigest,
        };
      }
      const cachedEntry = cache.get(key);
      if (!cachedEntry) {
        return { status: 'miss' };
      }
      return {
        status: 'hit',
        source: 'cache',
        bytes: new Uint8Array(cachedEntry.bytes),
        actionDigest: cachedEntry.actionDigest,
        contentDigest: contentDigest({ value: `sha256:${'c'.repeat(64)}` }),
      };
    },
    record,
    flush: vi.fn(async () => {
      for (const entry of staged) {
        cache.set(entry[0], entry[1]);
      }
    }),
    ...overrides,
  };
  return { session, record, staged };
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
    const cache = new Map<string, CacheEntry>();
    const { adapter, calls } = createFixture();
    const { makeBox } = adapter.library as typeof adapter.library & {
      makeBox(first: readonly number[], second: readonly number[]): FakeShape;
    };
    const cold = createSession(cache);
    const first = await adapter.run(cold.session, async () => makeBox([0, 0, 0], [2, 3, 4]));
    await cold.session.flush();
    expect(first.serialize()).toBe('box(0,0,0;2,3,4)');
    expect(calls.box).toBe(1);

    const warm = createSession(cache);
    const second = await adapter.run(warm.session, async () => makeBox([-0, 0, 0], [2, 3, 4]));
    const third = await adapter.run(warm.session, async () => makeBox([0, 0, 0], [2, 3, 4]));
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
    const cache = new Map<string, CacheEntry>();
    const { adapter, calls } = createFixture();
    const library = adapter.library as typeof adapter.library & {
      makeBox(first: readonly number[], second: readonly number[]): FakeShape;
      makeCylinder(radius: number, height: number): FakeShape;
    };
    const build = async (session: KernelComputeSession) =>
      adapter.run(session, async () => {
        const box = library.makeBox([0, 0, 0], [10, 10, 10]);
        const cylinder = library.makeCylinder(2, 10);
        return box.cut(cylinder, { optimisation: 'commonFace' }).translateZ(5);
      });

    const cold = createSession(cache);
    const first = await build(cold.session);
    await cold.session.flush();
    const warm = createSession(cache);
    const second = await build(warm.session);
    expect(second.serialize()).toBe(first.serialize());
    expect(calls).toMatchObject({ box: 1, cylinder: 1, deserialize: 4 });
  });

  it('invalidates arguments, implementation versions, and environments independently', async () => {
    const cache = new Map<string, CacheEntry>();
    for (const fixture of [
      createFixture(),
      createFixture({ version: 'test@2' }),
      createFixture({ environment: 'multi' }),
    ]) {
      const session = createSession(cache);
      const library = fixture.adapter.library as typeof fixture.adapter.library & {
        makeSphere(radius: number): FakeShape;
      };
      // oxlint-disable-next-line no-await-in-loop -- each warm stage depends on the preceding publication.
      await fixture.adapter.run(session.session, async () => library.makeSphere(2));
      // oxlint-disable-next-line no-await-in-loop -- preserve deterministic cache publication order.
      await session.session.flush();
      expect(fixture.calls.sphere).toBe(1);
    }
    const base = createFixture();
    const changedArgument = createSession(cache);
    const library = base.adapter.library as typeof base.adapter.library & { makeSphere(radius: number): FakeShape };
    await base.adapter.run(changedArgument.session, async () => library.makeSphere(3));
    expect(base.calls.sphere).toBe(1);
  });

  it('bypasses unknown, incomplete, mutable, and unserializable calls without false hits', async () => {
    const cache = new Map<string, CacheEntry>();
    const { adapter, calls } = createFixture();
    const session = createSession(cache);
    const library = adapter.library as typeof adapter.library & {
      makeBox(first: unknown, second: unknown): FakeShape;
      makeCylinder(...values: unknown[]): FakeShape;
      makeSphere(radius: number): FakeShape;
    };
    await adapter.run(session.session, async () => {
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
    const cache = new Map<string, CacheEntry>();
    const { adapter, calls } = createFixture();
    const library = adapter.library as typeof adapter.library & { makeSphere(radius: number): FakeShape };
    const failed = createSession(cache);
    await expect(
      adapter.run(failed.session, async () => {
        library.makeSphere(4);
        throw new Error('model failed');
      }),
    ).rejects.toThrow('model failed');
    expect(cache).toHaveLength(0);

    const rejected = createSession(cache, { record: () => ({ status: 'rejected', reason: 'session-byte-limit' }) });
    await adapter.run(rejected.session, async () => library.makeSphere(5));
    expect(calls.sphere).toBe(2);

    const seed = createSession(cache);
    await adapter.run(seed.session, async () => library.makeSphere(6));
    await seed.session.flush();
    const key = [...cache.keys()].find((candidate) => candidate.includes('"radius":6'))!;
    cache.set(key, { ...cache.get(key)!, bytes: new TextEncoder().encode('invalid') });
    const corrupt = createSession(cache);
    const recomputed = await adapter.run(corrupt.session, async () => library.makeSphere(6));
    expect(recomputed.serialize()).toBe('sphere(6)');
    expect(calls.sphere).toBe(4);
  });

  it('disables interception without assets and unwraps shape arrays and render records', async () => {
    const cache = new Map<string, CacheEntry>();
    const { adapter, calls } = createFixture({ enabled: false });
    const session = createSession(cache);
    const library = adapter.library as typeof adapter.library & { makeSphere(radius: number): FakeShape };
    const raw = await adapter.run(session.session, async () => library.makeSphere(1));
    expect(calls.sphere).toBe(1);
    expect(session.record).not.toHaveBeenCalled();
    expect(adapter.unwrap(raw)).toBe(raw);

    const enabled = createFixture().adapter;
    const enabledSession = createSession(cache);
    const wrapped = await enabled.run(enabledSession.session, async () =>
      (enabled.library as typeof enabled.library & { makeSphere(radius: number): FakeShape }).makeSphere(9),
    );
    expect(enabled.unwrap([wrapped])).toEqual([expect.objectContaining({ value: 'sphere(9)' })]);
    expect(enabled.unwrap({ shape: wrapped, color: 'red' })).toMatchObject({
      shape: { value: 'sphere(9)' },
      color: 'red',
    });
  });
});
