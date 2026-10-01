import { describe, expect, it } from 'vitest';
import {
  awaitGeometryPresentation,
  holdGeometryPresentation,
} from '#components/geometry/graphics/three/utils/geometry-presentation-admission.js';

describe('geometry presentation admission', () => {
  it('should wait for a viewer, admit headless capture, and release the last abandoned viewer', async () => {
    const content = new Uint8Array([1]);
    const { signal } = new AbortController();
    await awaitGeometryPresentation(new Uint8Array(), signal);
    const first = holdGeometryPresentation(content);
    const second = holdGeometryPresentation(content);
    let admitted = false;
    // async-iife: observe admission while controlling its foreground owner.
    const wait = (async () => {
      await awaitGeometryPresentation(content, signal);
      admitted = true;
    })();
    await Promise.resolve();
    expect(admitted).toBe(false);
    first.release();
    await Promise.resolve();
    expect(admitted).toBe(false);
    second.presented();
    await wait;
    expect(admitted).toBe(true);
    second.release();
    second.release();
    const abandoned = new Uint8Array([2]);
    const owner = holdGeometryPresentation(abandoned);
    const abandonedWait = awaitGeometryPresentation(abandoned, signal);
    owner.release();
    await abandonedWait;
  });

  it('should abort pending admission without waiting for an abandoned presentation', async () => {
    const content = new Uint8Array([1]);
    const owner = holdGeometryPresentation(content);
    const controller = new AbortController();
    const wait = awaitGeometryPresentation(content, controller.signal);
    controller.abort();
    await expect(wait).rejects.toMatchObject({ name: 'AbortError' });
    owner.release();
  });
});
