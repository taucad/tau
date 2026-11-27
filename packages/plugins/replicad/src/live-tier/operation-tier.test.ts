// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one's cache history is the next one's input. */
/**
 * Live operation tier (audit R6, R7) against the real Replicad library and OpenCASCADE: keying, occurrence,
 * alias hits, reusable failures, generation decay and the entry cap, finder closures, and the off path (I2).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as replicad from 'replicad';
import type { OperationRequest, Shape3D } from 'replicad';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initOcct, wrapOcForExceptions } from '@taucad/occt-core';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';
import { createOperationTier } from '#live-tier/operation-tier.js';
import type { OperationTier, OperationTierOptions } from '#live-tier/operation-tier.js';
import { installOperationTier } from '#live-tier/live-tier.js';

vi.setConfig({ testTimeout: 60_000 });

const library = { ...replicad };

beforeAll(async () => {
  const raw = await initOcct(
    new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href,
    await loadReplicadSingleWasm(),
  );
  replicad.setOC(wrapOcForExceptions(raw));
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs one build of `model` with `tier` installed and returns what it returned. */
const buildWith = (tier: OperationTier, model: () => unknown, outcome: 'delivered' | 'failed'): unknown => {
  const endBuild = installOperationTier(library, tier);
  let ended: 'delivered' | 'failed' = 'failed';
  try {
    const result = model();
    ended = outcome;
    return result;
  } finally {
    endBuild(ended);
  }
};
const build = async <T>(tier: OperationTier, model: () => T): Promise<T> => buildWith(tier, model, 'delivered') as T;

const brep = (shape: { serialize(): string }): string => shape.serialize();

/**
 * What a render delivers from a shape: its triangles, normals, face ranges and edge lines. Under eviction a kept
 * operand can carry pcurves an earlier destructive boolean added in place (catalogue N7), so its B-rep text may
 * differ from reuse off while the delivered geometry does not.
 */
const delivered = (shape: Shape3D): string => {
  const mesh = shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
  const edges = shape.meshEdges({ tolerance: 0.01, angularTolerance: 0.1 });
  return JSON.stringify([
    [...mesh.vertices],
    [...mesh.triangles],
    [...mesh.normals],
    mesh.faceGroups.map(({ start, count }) => [start, count]),
    [...edges.lines],
  ]);
};

const tierWith = (options: Partial<Omit<OperationTierOptions, 'library'>> = {}): OperationTier =>
  createOperationTier({ library, ...options });

/** A bracket: a sketched plate, a fused boss, a cut hole and a fillet chosen by a declarative finder. */
const bracket = (size: number): Shape3D => {
  const plate = replicad
    .drawRoundedRectangle(size * 4, size * 2, 2)
    .sketchOnPlane()
    .extrude(size / 2);
  const boss = replicad.makeCylinder(size / 2, size, [0, 0, 0], [0, 0, 1]);
  const hole = replicad.makeCylinder(size / 5, size * 3, [size, 0, -size], [0, 0, 1]);
  return plate
    .fuse(boss)
    .cut(hole)
    .fillet(0.5, (edges) => edges.inPlane('XY', 0));
};

describe('live operation tier', () => {
  describe('keys and hits', () => {
    it('should hand a repeated build the geometry a build without the tier computes', async () => {
      const reference = brep(bracket(10));
      const tier = tierWith();

      const first = await build(tier, () => bracket(10));
      const missed = tier.stats();
      const second = await build(tier, () => bracket(10));
      const hit = tier.stats();

      expect(brep(first)).toBe(reference);
      expect(brep(second)).toBe(reference);
      expect(missed).toMatchObject({ hits: 0, opaque: 0 });
      expect(missed.misses).toBeGreaterThan(0);
      expect(hit).toMatchObject({ misses: 0, opaque: 0, hits: missed.misses });
      tier.dispose();
    });

    it('should recompute only the calls a changed value reaches', async () => {
      const tier = tierWith();
      const placed = (offset: number) => () =>
        replicad.drawRoundedRectangle(40, 20, 2).sketchOnPlane().extrude(5).translate([offset, 0, 0]);
      await build(tier, placed(10));
      const reference = brep(placed(20)());

      const changed = await build(tier, placed(20));

      expect(brep(changed)).toBe(reference);
      // The drawing, its sketch and the extrusion hit; only the translation the edit reaches recomputes.
      expect(tier.stats()).toMatchObject({ hits: 3, misses: 1 });
      tier.dispose();
    });

    // Characterization of a known residual (catalogue N7, Finding 5). Replicad's booleans run destructively: a
    // boolean on a hit (an alias of a retained operand) adds parametric curves to the operand's shared edges in
    // place, so a later, different boolean on the same retained operand holds more curves in memory than reuse off.
    // Delivered GLB and STEP are equal (replicad-live-tier.test.ts); this test fails when that in-memory difference
    // disappears or grows, so a change that makes it reach delivered output is seen.
    it('should record the extra parametric curves a destructive boolean leaves on a retained operand (N7)', async () => {
      const tier = tierWith();
      const fused = () =>
        replicad
          .drawRoundedRectangle(40, 20, 2)
          .sketchOnPlane()
          .extrude(5)
          .fuse(replicad.makeCylinder(5, 12, [0, 0, 0], [0, 0, 1]));
      const curves = (shape: { serialize(): string }): string | undefined => /Curve2ds (\d+)/u.exec(brep(shape))?.[1];
      const reference = curves(fused());
      // `bracket(10)` builds the same plate, fuses, cuts and fillets it.
      await build(tier, () => bracket(10));

      const changed = await build(tier, fused);

      expect({ reference, changed: curves(changed) }).toStrictEqual({ reference: '46', changed: '54' });
      tier.dispose();
    });

    it('should key the n-th call of one lineage as its own entry', async () => {
      const tier = tierWith();
      const twice = () => [replicad.makeBaseBox(10, 10, 10), replicad.makeBaseBox(10, 10, 10)] as const;
      await build(tier, twice);
      expect(tier.stats()).toMatchObject({ misses: 2, stored: 2, hits: 0 });

      const [first, second] = await build(tier, twice);

      expect(tier.stats()).toMatchObject({ hits: 2, misses: 0 });
      // Two occurrences stay two native shapes, as they are without the tier.
      // oxlint-disable-next-line new-cap -- OCCT exposes callable C++ PascalCase methods.
      expect(first.wrapped.IsSame(second.wrapped)).toBe(false);
      tier.dispose();
    });

    it('should hand each hit a fresh alias the caller may delete', async () => {
      const tier = tierWith();
      const box = () => replicad.makeBaseBox(10, 20, 30);
      const volume = replicad.measureVolume(box());
      await build(tier, box);

      const hit = await build(tier, box);
      hit.delete();
      const again = await build(tier, box);

      expect(tier.stats()).toMatchObject({ hits: 1 });
      expect(replicad.measureVolume(again)).toBeCloseTo(volume, 9);
      tier.dispose();
    });

    it('should key a declarative finder by the clauses its closure records', async () => {
      const filleted = (top: boolean) =>
        replicad.makeBaseBox(40, 30, 20).fillet(2, (edges) => edges.inPlane('XY', top ? 20 : 0));
      const reference = { top: brep(filleted(true)), bottom: brep(filleted(false)) };
      const tier = tierWith();

      const results: string[] = [];
      for (const top of [true, false, true, false]) {
        results.push(brep(await build(tier, () => filleted(top))));
      }

      expect(results).toStrictEqual([reference.top, reference.bottom, reference.top, reference.bottom]);
      expect(reference.top).not.toBe(reference.bottom);
      tier.dispose();
    });

    it('should key a predicate finder by the selection it made', async () => {
      const filleted = (high: number) =>
        replicad
          .makeBaseBox(40, 30, 20)
          .fillet(2, (edges) => edges.when(({ element }) => element.boundingBox.center[2] > high));
      const reference = { upper: brep(filleted(15)), lower: brep(filleted(-1)) };
      const tier = tierWith();

      const results: string[] = [];
      for (const high of [15, -1, 15]) {
        results.push(brep(await build(tier, () => filleted(high))));
      }

      expect(results).toStrictEqual([reference.upper, reference.lower, reference.upper]);
      expect(tier.stats().hits).toBeGreaterThan(0);
      tier.dispose();
    });
  });

  describe('failures', () => {
    const impossibleFillet = () => replicad.makeBaseBox(10, 10, 10).fillet(20);

    it('should reuse a deterministic failure without running the operation again', async () => {
      const tier = tierWith();
      const fresh = await build(tier, impossibleFillet).catch((error: unknown) => error);
      const reused = await build(tier, impossibleFillet).catch((error: unknown) => error);

      expect(fresh).toBeInstanceOf(Error);
      expect(reused).toBeInstanceOf((fresh as Error).constructor);
      expect((reused as Error).message).toBe((fresh as Error).message);
      expect(reused).not.toBe(fresh);
      expect(tier.stats()).toMatchObject({ failureHits: 1, misses: 0 });
      tier.dispose();
    });

    const request = (compute: () => unknown, deterministicErrors: boolean): OperationRequest<unknown> => ({
      op: 'Shape.fillet',
      effect: 'pure',
      receiver: undefined,
      args: [1],
      deterministicErrors,
      compute,
    });
    const twice = async (error: unknown, deterministicErrors: boolean): Promise<number> => {
      const tier = tierWith();
      const compute = vi.fn(() => {
        throw error;
      });
      for (let round = 0; round < 2; round++) {
        await build(tier, () => tier.cache.operation(request(compute, deterministicErrors))).catch(() => undefined);
      }
      tier.dispose();
      return compute.mock.calls.length;
    };

    class Aborted extends Error {
      public override readonly name = 'RenderAbortedError';
    }

    it.each([
      ['an operation without deterministic errors', new Error('failed'), false],
      ['a cancellation', new Aborted('superseded'), true],
      ['a resource error', new RangeError('Maximum call stack size exceeded'), true],
      ['a trap', new WebAssembly.RuntimeError('unreachable'), true],
      ['a use of a deleted value', new Error('This object has been deleted'), true],
    ])('should run the operation again after %s', async (_case, error, deterministicErrors) => {
      expect(await twice(error, deterministicErrors)).toBe(2);
    });

    it('should hold its own reference to a native exception until it evicts the failure', async () => {
      const oc = library.getOC() as unknown as Record<string, (error: unknown) => void>;
      const increment = vi.spyOn(oc, 'incrementExceptionRefcount').mockImplementation(() => undefined);
      const decrement = vi.spyOn(oc, 'decrementExceptionRefcount').mockImplementation(() => undefined);
      const exception = new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []);
      const tier = tierWith();
      const compute = vi.fn(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- OpenCASCADE throws native exceptions, not errors.
        throw exception;
      });

      for (let round = 0; round < 3; round++) {
        await build(tier, () => tier.cache.operation(request(compute, true))).catch(() => undefined);
      }
      expect(compute).toHaveBeenCalledTimes(1);
      expect(increment.mock.calls).toStrictEqual([[exception]]);
      expect(decrement).not.toHaveBeenCalled();

      tier.dispose();
      expect(decrement.mock.calls).toStrictEqual([[exception]]);
    });
  });

  describe('retention', () => {
    const deletions = () => vi.spyOn(replicad.WrappingObj.prototype, 'delete');

    it('should evict entries unused for the decay window and delete what each owned once', async () => {
      const tier = tierWith({ decayGenerations: 2 });
      await build(tier, () => bracket(10));
      const { entries } = tier.stats();
      const deleted = deletions();

      await build(tier, () => bracket(11));
      expect(tier.stats().evicted).toBe(0);
      await build(tier, () => bracket(12));
      const { evicted } = tier.stats();
      const owned = deleted.mock.contexts as Array<{ readonly wrapped: unknown }>;

      expect(evicted).toBe(entries);
      // Each evicted entry deleted its alias (more than one wrapper for a sketch), and no wrapper twice.
      expect(owned.length).toBeGreaterThanOrEqual(evicted);
      expect(new Set(owned).size).toBe(owned.length);
      for (const wrapper of owned) {
        expect(() => wrapper.wrapped).toThrow('This object has been deleted');
      }
      tier.dispose();
    });

    it('should keep what the last builds used', async () => {
      const tier = tierWith({ decayGenerations: 3 });
      for (const size of [10, 11, 12]) {
        await build(tier, () => bracket(size));
      }
      await build(tier, () => bracket(10));

      expect(tier.stats()).toMatchObject({ misses: 0, evicted: 0 });
      tier.dispose();
    });

    it('should keep no more entries than its cap and still build correctly', async () => {
      const reference = brep(bracket(10));
      const tier = tierWith({ entryCap: 3 });

      const first = await build(tier, () => bracket(10));
      const second = await build(tier, () => bracket(10));

      expect(tier.stats().entries).toBeLessThanOrEqual(3);
      expect(tier.stats().evicted).toBeGreaterThan(0);
      expect([brep(first), brep(second)]).toStrictEqual([reference, reference]);
      tier.dispose();
    });

    it('should evict nothing but the cap after a failed build', async () => {
      const tier = tierWith({ decayGenerations: 1 });
      await build(tier, () => bracket(10));
      const { entries } = tier.stats();

      buildWith(tier, () => bracket(11), 'failed');
      buildWith(tier, () => bracket(12), 'failed');

      expect(tier.stats().evicted).toBe(0);
      await build(tier, () => bracket(10));
      expect(tier.stats()).toMatchObject({ misses: 0, hits: entries });
      tier.dispose();
    });

    it('should estimate each entry, keep the shared byte budget, and evict what it no longer fits', async () => {
      const reference = delivered(bracket(10));
      const budget = { limit: Number.POSITIVE_INFINITY, used: 0 };
      const unbounded = tierWith({ byteBudget: budget });
      await build(unbounded, () => bracket(10));
      const full = unbounded.stats();
      expect(full.bytes).toBeGreaterThan(0);
      expect(budget.used).toBe(full.bytes);
      unbounded.dispose();
      expect(budget.used).toBe(0);

      // Half of what one build keeps: pressure evicts least recently used entries without live dependents.
      const tight = { limit: full.bytes / 2, used: 0 };
      const tier = tierWith({ byteBudget: tight });
      const deleted = deletions();
      const first = await build(tier, () => bracket(10));
      const second = await build(tier, () => bracket(10));

      expect(tier.stats().bytes).toBe(tight.used);
      expect(tight.used).toBeLessThanOrEqual(tight.limit);
      expect(tier.stats().evicted).toBeGreaterThan(0);
      expect(deleted).toHaveBeenCalled();
      expect([delivered(first), delivered(second)]).toStrictEqual([reference, reference]);
      tier.dispose();
      expect(tight.used).toBe(0);
    });

    it('should relieve the shared budget from another tier on demand', async () => {
      const budget = { limit: Number.POSITIVE_INFINITY, used: 0 };
      const older = tierWith({ byteBudget: budget });
      await build(older, () => bracket(10));
      const kept = budget.used;

      Object.assign(budget, { limit: kept / 4 });
      older.relieve();

      expect(budget.used).toBeLessThanOrEqual(kept / 4);
      expect(older.stats().evicted).toBeGreaterThan(0);
      older.dispose();
    });

    it('should cost a retained value with the estimator it is given', async () => {
      const estimateBytes = vi.fn(() => 100);
      const tier = tierWith({ estimateBytes });
      await build(tier, () => bracket(10));

      expect(tier.stats().bytes).toBe(100 * tier.stats().entries);
      expect(estimateBytes).toHaveBeenCalledTimes(tier.stats().entries);
      tier.dispose();
    });

    it('should delete every alias it owns, once, when disposed', async () => {
      const tier = tierWith();
      await build(tier, () => bracket(10));
      const { entries: stored } = tier.stats();
      const deleted = deletions();

      tier.dispose();
      tier.dispose();

      expect(deleted.mock.contexts.length).toBeGreaterThanOrEqual(stored);
      expect(new Set(deleted.mock.contexts).size).toBe(deleted.mock.contexts.length);
    });
  });

  describe('canonical arguments', () => {
    it('should key imported bytes by their content', async () => {
      const tier = tierWith();
      const compute = vi.fn(() => replicad.makeBaseBox(1, 1, 1));
      const importing = (bytes: Uint8Array<ArrayBuffer>) => () =>
        tier.cache.operation({ op: 'importSTEP', effect: 'pure', receiver: undefined, args: [bytes], compute });

      await build(tier, importing(new Uint8Array([1, 2, 3])));
      await build(tier, importing(new Uint8Array([1, 2, 3])));
      await build(tier, importing(new Uint8Array([1, 2, 4])));

      expect(compute).toHaveBeenCalledTimes(2);
      tier.dispose();
    });

    it('should compute an argument it cannot describe and count why', async () => {
      const tier = tierWith();
      class Opaque {
        public get label(): string {
          return 'opaque';
        }
      }
      const compute = vi.fn(() => replicad.makeBaseBox(1, 1, 1));
      const opaque = () =>
        tier.cache.operation({ op: 'makeOpaque', effect: 'pure', receiver: undefined, args: [new Opaque()], compute });

      await build(tier, opaque);
      await build(tier, opaque);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(tier.stats()).toMatchObject({ opaque: 1, opaqueReasons: { 'makeOpaque: untracked Opaque': 1 } });
      tier.dispose();
    });
  });

  describe('review fixes', () => {
    it('should delete the receiver of a consuming operation on a hit, as the operation does', async () => {
      const tier = tierWith();
      const extruded = () => {
        const sketch = replicad.drawRectangle(10, 20).sketchOnPlane() as InstanceType<typeof replicad.Sketch>;
        return { sketch, solid: sketch.extrude(5) };
      };
      const deleted = (sketch: InstanceType<typeof replicad.Sketch>): boolean => {
        try {
          // oxlint-disable-next-line new-cap -- OCCT exposes callable C++ PascalCase methods.
          return sketch.wire.wrapped.IsNull();
        } catch {
          return true;
        }
      };
      const reference = extruded();
      await build(tier, extruded);

      const hit = await build(tier, extruded);

      expect(tier.stats().hits).toBeGreaterThan(0);
      expect(deleted(hit.sketch)).toBe(deleted(reference.sketch));
      expect(deleted(hit.sketch)).toBe(true);
      tier.dispose();
    });

    it('should key a text operation by the font object the family names when it runs', async () => {
      const fonts = fileURLToPath(new URL('../../node_modules/geist/dist/fonts', import.meta.url));
      const bytes = (path: string): ArrayBuffer => {
        const buffer = readFileSync(join(fonts, path));
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      };
      const titled = async (bold: boolean) => {
        // What user code does: a parameter chooses which font one family name holds.
        await replicad.loadFont(
          bytes(bold ? 'geist-mono/GeistMono-Bold.ttf' : 'geist-sans/Geist-Regular.ttf'),
          'title',
          true,
        );
        return replicad
          .sketchText('Tau', { fontFamily: 'title', fontSize: 10 } as unknown as Parameters<
            typeof replicad.sketchText
          >[1])
          .extrude(2);
      };
      const reference = { regular: brep(await titled(false)), bold: brep(await titled(true)) };
      const tier = tierWith();

      const results: string[] = [];
      for (const bold of [false, true, false]) {
        const end = installOperationTier(library, tier);
        try {
          results.push(brep(await titled(bold)));
        } finally {
          end('delivered');
        }
      }

      expect(reference.regular).not.toBe(reference.bold);
      expect(results).toStrictEqual([reference.regular, reference.bold, reference.regular]);
      tier.dispose();
    });

    it('should build with the tier an element whose owner user code consumed first', async () => {
      const model = () => {
        const box = replicad.makeBaseBox(10, 10, 10);
        const face = box.faces[5]!;
        // `translate` consumes `box` before the face is first used as an argument.
        const placed = box.translate([20, 0, 0]);
        const peg = replicad.drawCircle(2).sketchOnFace(face, 'original').extrude(3);
        return [brep(placed), brep(peg)];
      };
      const reference = model();
      const tier = tierWith();

      expect(await build(tier, model)).toStrictEqual(reference);
      expect(await build(tier, model)).toStrictEqual(reference);
      tier.dispose();
    });

    it('should not record a finder callback that reads the shape it is given', async () => {
      const tier = tierWith();
      const bottom = () => replicad.makeBaseBox(40, 30, 20).fillet(2, (edges) => edges.inPlane('XY', 0));
      const shapeReading = () =>
        replicad
          .makeBaseBox(40, 30, 20)
          .fillet(2, (edges, shape: unknown) => edges.inPlane('XY', shape === undefined ? 0 : 20));
      const reference = brep(shapeReading());
      await build(tier, bottom);

      const result = await build(tier, shapeReading);

      expect(reference).not.toBe(brep(bottom()));
      expect(brep(result)).toBe(reference);
      tier.dispose();
    });

    it('should never evict, at its cap, an entry a kept entry was made from', async () => {
      const model = () => {
        const base = replicad.makeBaseBox(10, 10, 10);
        const moved = base.clone().translate([20, 0, 0]);
        // oxlint-disable-next-line new-cap -- OCCT exposes callable C++ PascalCase methods.
        return { base, moved, shared: moved.wrapped.IsPartner(base.wrapped) };
      };
      const reference = model().shared;
      const tier = tierWith({ entryCap: 1 });
      await build(tier, model);

      const rebuilt = await build(tier, model);

      // At a cap of one the tier keeps the box, which the translated alias was made from, and drops the alias.
      expect(tier.stats()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
      expect(reference).toBe(true);
      expect(rebuilt.shared).toBe(reference);
      tier.dispose();
    });

    it('should key plain-object arguments with keys that cannot collide', async () => {
      const tier = tierWith();
      const compute = vi.fn(() => replicad.makeBaseBox(1, 1, 1));
      const call = (options: Record<string, unknown>) => () =>
        tier.cache.operation({ op: 'makeOptions', effect: 'pure', receiver: undefined, args: [options], compute });

      await build(tier, call({ 'a:1,b': 2 }));
      await build(tier, call({ a: 1, b: 2 }));

      expect(compute).toHaveBeenCalledTimes(2);
      tier.dispose();
    });
  });

  describe('installation', () => {
    it('should leave every routed member original once a build ends', async () => {
      const members = Object.fromEntries(
        ['fuse', 'cut'].map((name) => [
          name,
          Object.getOwnPropertyDescriptor(replicad._3DShape.prototype, name)?.value,
        ]),
      );
      const tier = tierWith();
      let installed: unknown;

      await build(tier, () => {
        installed = replicad.getOperationCache();
        return bracket(10);
      });

      expect(installed).toBe(tier.cache);
      expect(replicad.getOperationCache()).toBeUndefined();
      expect(
        Object.fromEntries(
          ['fuse', 'cut'].map((name) => [
            name,
            Object.getOwnPropertyDescriptor(replicad._3DShape.prototype, name)?.value,
          ]),
        ),
      ).toStrictEqual(members);
      tier.dispose();
    });

    it('should remove the cache when user code throws', async () => {
      const tier = tierWith();
      const failed = build(tier, () => {
        throw new Error('user code failed');
      });

      await expect(failed).rejects.toThrow('user code failed');
      expect(replicad.getOperationCache()).toBeUndefined();
      tier.dispose();
    });
  });
});
