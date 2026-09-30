// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime/worker';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { offersFor, replicadKernel } from '#replicad.kernel.js';
import { normalizeRenderShapes } from '#utils/render-output.js';

const client = createTestRuntimeClient({
  runtime: defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] }),
  files: { 'offers-bootstrap.ts': "import { makeCylinder } from 'replicad'; export default () => makeCylinder(1, 1);" },
});

beforeAll(async () => {
  const document = client.open({ source: { path: 'offers-bootstrap.ts' } });
  try {
    const outcome = await document.view('model').rendering();
    expect(outcome.superseded).toBe(false);
    if (outcome.superseded) {
      throw new Error('Replicad bootstrap was superseded');
    }
    expect(outcome.rendering.success).toBe(true);
  } finally {
    document.close();
  }
});

afterAll(async () => client.shutdown());

describe('Replicad view offers', () => {
  it('offers a drawing-only model with its authored instance as the default view', async () => {
    const { draw } = await import('replicad');
    const drawing = draw().hLine(5).vLine(5).close();
    const offers = offersFor({ shapes: normalizeRenderShapes({ shape: drawing, name: 'Front' }) });
    expect(offers.views).toEqual(['drawing']);
    expect(offers.views[0]).toBe('drawing');
    expect(offers.exports).toEqual([]);
    expect(offers.instances?.drawing).toEqual([{ id: 'Front', title: 'Front' }]);
  });

  it('offers instances only when a drawing view exists', async () => {
    const { draw, makeCylinder } = await import('replicad');
    const empty = offersFor({ shapes: [] });
    expect(empty.views).toEqual(['model']);
    expect(empty.exports).toEqual(['glb', 'gltf']);
    expect(empty.instances).toBeUndefined();

    const solid = { shape: makeCylinder(5, 20), name: 'Body' };
    const model = offersFor({ shapes: normalizeRenderShapes(solid) });
    expect(model.views).toEqual(['model']);
    expect(model.exports).toBeUndefined();
    expect(model.instances).toBeUndefined();

    const drawing = { shape: draw().hLine(5).vLine(5).close(), name: 'Front' };
    const mixed = offersFor({ shapes: normalizeRenderShapes([solid, drawing]) });
    expect(mixed.views).toEqual(['model', 'drawing']);
    expect(mixed.instances?.drawing).toEqual([{ id: 'Front', title: 'Front' }]);
  });
});
