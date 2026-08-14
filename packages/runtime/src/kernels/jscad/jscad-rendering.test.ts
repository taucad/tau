// @vitest-environment node
/**
 * JSCAD rendering / color tests.
 *
 * Locks in the linear-space `baseColorFactor` contract for the JSCAD kernel.
 * `colorize()` emits sRGB-encoded `[0..1]` tuples; the JSCAD GLB adapter
 * applies sRGB→linear before writing `baseColorFactor`. See
 * docs/policy/color-space-policy.md.
 */
import { describe, expect, it } from 'vitest';
import { jscad as jscadKernel } from '#kernels/jscad/jscad.kernel.js';
import {
  colorParityCases,
  expectLinearBaseColor,
  getMaterialAlphaMode,
  getMaterialBaseColor,
  getTrianglePrimitiveBaseColors,
} from '#testing/color-testing.utils.js';
import { assertSuccess, createGeometryFile, createTestWorker } from '#testing/kernel-testing.utils.js';
import type { HashedGeometryResult } from '#types/runtime.types.js';

function hexToJscadTuple(hex: string, opacity: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = (Number.parseInt(clean.slice(0, 2), 16) / 255).toFixed(6);
  const g = (Number.parseInt(clean.slice(2, 4), 16) / 255).toFixed(6);
  const b = (Number.parseInt(clean.slice(4, 6), 16) / 255).toFixed(6);
  return `[${r}, ${g}, ${b}, ${opacity.toFixed(6)}]`;
}

const buildSourceFor = (hex: string, opacity: number): string => `
import { colors, primitives } from '@jscad/modeling';
export default function main() {
  return colors.colorize(${hexToJscadTuple(hex, opacity)}, primitives.cube({ size: 10 }));
}`;

async function renderColored(hex: string, opacity: number): Promise<HashedGeometryResult> {
  const file = 'colored.ts';
  const worker = await createTestWorker(jscadKernel, {
    [file]: buildSourceFor(hex, opacity),
  });
  const result = await worker.createGeometry({
    file: createGeometryFile(file),
    parameters: {},
  });
  assertSuccess(result, `jscad createGeometry (${hex}, alpha=${opacity})`);
  return result;
}

describe('JSCAD — color rendering parity', { timeout: 120_000 }, () => {
  for (const { hex, label, opacity } of colorParityCases) {
    it(`writes linear baseColorFactor for ${label} (${hex}, alpha=${opacity})`, async () => {
      const result = await renderColored(hex, opacity);
      const baseColor = await getMaterialBaseColor(result);
      expectLinearBaseColor(baseColor, hex, { opacity });

      const expectedAlphaMode = opacity < 1 ? 'BLEND' : 'OPAQUE';
      const alphaMode = await getMaterialAlphaMode(result);
      expect(alphaMode).toBe(expectedAlphaMode);
    });
  }

  it('produces N distinct materials for N differently-coloured shapes', async () => {
    const file = 'multi.ts';
    const worker = await createTestWorker(jscadKernel, {
      [file]: `
import { colors, primitives } from '@jscad/modeling';
export default function main() {
  return [
    colors.colorize([1, 0, 0, 1], primitives.cube({ size: 10 })),
    colors.colorize([0, 1, 0, 1], primitives.cube({ size: 10 })),
    colors.colorize([0, 0, 1, 1], primitives.cube({ size: 10 })),
  ];
}`,
    });
    const result = await worker.createGeometry({
      file: createGeometryFile(file),
      parameters: {},
    });
    assertSuccess(result, 'jscad multi-color createGeometry');

    const baseColors = await getTrianglePrimitiveBaseColors(result);
    expect(baseColors.length).toBeGreaterThanOrEqual(3);
    expectLinearBaseColor(baseColors[0]!, '#FF0000');
    expectLinearBaseColor(baseColors[1]!, '#00FF00');
    expectLinearBaseColor(baseColors[2]!, '#0000FF');
  });

  it('emits the JSCAD default light gray for an uncoloured shape', async () => {
    const file = 'default.ts';
    const worker = await createTestWorker(jscadKernel, {
      [file]: `
import { primitives } from '@jscad/modeling';
export default function main() {
  return primitives.cube({ size: 10 });
}`,
    });
    const result = await worker.createGeometry({
      file: createGeometryFile(file),
      parameters: {},
    });
    assertSuccess(result, 'jscad uncoloured createGeometry');

    const baseColor = await getMaterialBaseColor(result);
    // JSCAD default is sRGB [0.8, 0.8, 0.8, 1] → linear ≈ 0.6038
    expect(baseColor[0]).toBeCloseTo(0.603_827, 2);
    expect(baseColor[1]).toBeCloseTo(0.603_827, 2);
    expect(baseColor[2]).toBeCloseTo(0.603_827, 2);
    expect(baseColor[3]).toBeCloseTo(1, 2);
  });
});
