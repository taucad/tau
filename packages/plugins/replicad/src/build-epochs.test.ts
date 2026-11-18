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
  it('deletes what a released handle alone delivers, once, and keeps what a live handle still delivers', () => {
    const epochs = createHandleEpochs(library);
    const shared = replicad.makeBaseBox(1, 1, 1);
    const own = replicad.makeCylinder(1, 2);
    const drawing = replicad.drawRectangle(2, 1);
    const first = epochs.adopt({ shapes: [{ shape: shared }, { shape: own }, { shape: own }, { shape: drawing }] });
    const second = epochs.adopt({ shapes: [{ shape: shared }, { shape: 'not a shape' }, { shape: { plain: true } }] });
    expect(epochs.adopt(first)).toBe(first);
    expect(epochs.stats()).toStrictEqual({ epochs: 2, liveHandles: 2, liveValues: 4, deleted: 0 });

    epochs.release(first);
    expect(isDeleted(own)).toBe(true);
    expect(isDeleted(shared)).toBe(false);
    expect(drawing.toSVGPaths).toThrow();

    epochs.release(first);
    epochs.release({ shapes: [{ shape: shared }] });
    expect(isDeleted(shared)).toBe(false);

    epochs.release(second);
    expect(isDeleted(shared)).toBe(true);
    expect(epochs.stats()).toStrictEqual({ epochs: 2, liveHandles: 0, liveValues: 0, deleted: 3 });
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
    expect(isDeleted(nested!)).toBe(false);
    nested!.delete();
  });
});
