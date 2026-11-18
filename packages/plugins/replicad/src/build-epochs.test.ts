// @vitest-environment node
/**
 * Build and module epochs (memory R5, A3) against the real Replicad library: a released handle deletes what it alone
 * delivers, once; values built while a module executes are never deleted by a build.
 */
import * as replicad from 'replicad';
import { beforeAll, describe, expect, it } from 'vitest';
import { initOcct, wrapOcForExceptions } from '@taucad/occt-core';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';
import { createHandleEpochs } from '#build-epochs.js';

const library = { ...replicad };

beforeAll(async () => {
  const raw = await initOcct(
    new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href,
    await loadReplicadSingleWasm(),
  );
  replicad.setOC(wrapOcForExceptions(raw));
}, 120_000);

const isDeleted = (shape: { readonly wrapped: unknown }): boolean => {
  try {
    void shape.wrapped;
    return false;
  } catch {
    return true;
  }
};

describe('handle epochs', () => {
  it('parks what a released handle alone delivers, and deletes it at the next delivery unless delivered again', () => {
    const epochs = createHandleEpochs(library);
    const shared = replicad.makeBaseBox(1, 1, 1);
    const kept = replicad.makeCylinder(1, 2);
    const own = replicad.makeCylinder(2, 2);
    const drawing = replicad.drawRectangle(2, 1);
    const first = epochs.adopt({
      shapes: [{ shape: shared }, { shape: kept }, { shape: own }, { shape: own }, { shape: drawing }],
    });
    const second = epochs.adopt({ shapes: [{ shape: shared }, { shape: 'not a shape' }, { shape: { plain: true } }] });
    expect(epochs.adopt(first)).toBe(first);
    expect(epochs.stats()).toStrictEqual({ epochs: 2, liveHandles: 2, liveValues: 5, parked: 0, deleted: 0 });

    // Released, nothing is deleted yet: user code may return a shape again from state it keeps.
    epochs.release(first);
    epochs.release(first);
    epochs.release({ shapes: [{ shape: shared }] });
    expect([shared, kept, own].map((shape) => isDeleted(shape))).toStrictEqual([false, false, false]);
    expect(epochs.stats()).toMatchObject({ liveHandles: 1, parked: 3, deleted: 0 });

    // The next delivery takes back what it delivers again and deletes the rest of the parked values once.
    const third = epochs.adopt({ shapes: [{ shape: kept }] });
    expect(isDeleted(kept)).toBe(false);
    expect(isDeleted(own)).toBe(true);
    expect(drawing.toSVGPaths).toThrow();
    expect(epochs.stats()).toMatchObject({ epochs: 3, liveHandles: 2, parked: 0, deleted: 2 });

    epochs.release(second);
    epochs.release(third);
    expect(epochs.stats()).toMatchObject({ liveHandles: 0, liveValues: 0, parked: 3 });
    epochs.dispose();
    expect([shared, kept].map((shape) => isDeleted(shape))).toStrictEqual([true, true]);
    expect(epochs.stats()).toStrictEqual({ epochs: 3, liveHandles: 0, liveValues: 0, parked: 0, deleted: 4 });
  });

  it('keeps what a module builds at its top level, and marks nothing outside module execution', async () => {
    const epochs = createHandleEpochs(library);
    const [moduleShape, moduleDrawing] = await epochs.inModuleEpoch(async () => [
      replicad.makeBaseBox(2, 2, 2),
      replicad.drawCircle(3),
    ]);
    expect(Object.hasOwn(replicad.WrappingObj.prototype, 'oc')).toBe(false);
    expect(Object.hasOwn(replicad.Drawing.prototype, 'innerShape')).toBe(false);
    const built = replicad.makeBaseBox(3, 3, 3);

    const handle = epochs.adopt({ shapes: [{ shape: moduleShape }, { shape: moduleDrawing }, { shape: built }] });
    epochs.release(handle);
    epochs.adopt({ shapes: [] });

    expect(isDeleted(moduleShape)).toBe(false);
    expect(moduleDrawing.boundingBox.width).toBeCloseTo(6);
    expect(isDeleted(built)).toBe(true);
    // Marking defines the properties a plain assignment would have made.
    expect(Object.getOwnPropertyDescriptor(moduleShape, 'oc')).toMatchObject({ writable: true, enumerable: true });
    moduleShape.delete();
  });

  it('runs a nested module execution in the epoch already open and closes it when execution throws', async () => {
    const epochs = createHandleEpochs(library);
    let nested: replicad.Shape3D | undefined;
    await expect(
      epochs.inModuleEpoch(async () => {
        nested = await epochs.inModuleEpoch(async () => replicad.makeBaseBox(1, 2, 3));
        throw new Error('module failed');
      }),
    ).rejects.toThrow('module failed');
    expect(Object.hasOwn(replicad.WrappingObj.prototype, 'oc')).toBe(false);

    epochs.release(epochs.adopt({ shapes: [{ shape: nested }] }));
    epochs.dispose();
    expect(isDeleted(nested!)).toBe(false);
    nested!.delete();
  });
});
