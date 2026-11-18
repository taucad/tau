// @vitest-environment node
import * as replicad from 'replicad';
import { beforeAll, describe, expect, it } from 'vitest';
import { initOcct, wrapOcForExceptions } from '@taucad/occt-core';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';
import { bytesPerEdge, bytesPerFace, bytesPerValue, createEntryCost } from '#live-tier/entry-cost.js';

beforeAll(async () => {
  const raw = await initOcct(
    new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href,
    await loadReplicadSingleWasm(),
  );
  replicad.setOC(wrapOcForExceptions(raw));
}, 120_000);

describe('live-tier entry cost', () => {
  it('costs shapes by faces, face-less shapes by edges, and other values flat', () => {
    const cost = createEntryCost({ ...replicad });
    const box: replicad.Solid = replicad.makeBaseBox(10, 10, 10);
    const sketch = replicad.drawRectangle(10, 5).sketchOnPlane() as replicad.Sketch;
    const sketches = replicad.drawRectangle(10, 5).sketchOnPlane() as replicad.Sketch;
    const compound = new replicad.CompoundSketch([replicad.drawRectangle(4, 4).sketchOnPlane() as replicad.Sketch]);

    expect(cost(box)).toBe(bytesPerValue + 6 * bytesPerFace);
    expect(cost(sketch)).toBe(bytesPerValue + 4 * bytesPerEdge);
    expect(cost([box, sketch])).toBe(cost(box) + cost(sketch));
    expect(cost(new replicad.Sketches([sketches]))).toBe(cost(sketches));
    expect(cost(compound)).toBe(bytesPerValue + 4 * bytesPerEdge);
    expect(cost(replicad.drawRectangle(1, 1))).toBe(bytesPerValue);
    box.delete();
    sketch.delete();
    sketches.delete();
    compound.delete();
  });
});
