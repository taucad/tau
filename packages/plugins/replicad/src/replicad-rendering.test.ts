// @vitest-environment node
/**
 * Replicad rendering / color tests.
 *
 * Locks in the linear-space `baseColorFactor` contract for the Replicad kernel
 * across the shared color matrix. See docs/policy/color-space-policy.md.
 */
import { describe, expect, it } from 'vitest';
import { cadMaterialDefaults } from '@taucad/runtime/types';
import { replicadKernel } from '#replicad.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import {
  assertSuccess,
  colorParityCases,
  createTestGeometry,
  expectLinearBaseColor,
  getAllMaterialBaseColors,
  getMaterialAlphaMode,
  getMaterialBaseColor,
} from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

import type { HashedGeometryResult } from '@taucad/runtime/types';

const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

const buildSourceFor = (hex: string, opacity: number): string => `
import { makeCylinder } from 'replicad';
export default function main() {
  return { shape: makeCylinder(5, 20), color: '${hex}', opacity: ${opacity} };
}`;

async function renderColored(hex: string, opacity: number): Promise<HashedGeometryResult> {
  const file = 'colored.ts';
  const result = await createTestGeometry({
    runtime,
    files: { [file]: buildSourceFor(hex, opacity) },
    mainFile: file,
    parameters: {},
  });
  assertSuccess(result, `replicad createGeometry (${hex}, alpha=${opacity})`);
  return result;
}

describe('Replicad — color rendering parity', { timeout: 120_000 }, () => {
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

  it('produces N distinct materials for an array of N differently-coloured shapes', async () => {
    const file = 'multi.ts';
    const result = await createTestGeometry({
      runtime,
      files: {
        [file]: `
import { makeCylinder } from 'replicad';
export default function main() {
  return [
    { shape: makeCylinder(5, 20), color: '#FF0000' },
    { shape: makeCylinder(5, 20), color: '#00FF00' },
    { shape: makeCylinder(5, 20), color: '#0000FF' },
  ];
}`,
      },
      mainFile: file,
      parameters: {},
    });
    assertSuccess(result, 'replicad multi-color createGeometry');

    const baseColors = await getAllMaterialBaseColors(result);
    expect(baseColors.length).toBeGreaterThanOrEqual(3);
    expectLinearBaseColor(baseColors[0]!, '#FF0000');
    expectLinearBaseColor(baseColors[1]!, '#00FF00');
    expectLinearBaseColor(baseColors[2]!, '#0000FF');
  });

  it('emits the canonical default material for an uncoloured shape', async () => {
    const file = 'default.ts';
    const result = await createTestGeometry({
      runtime,
      files: {
        [file]: `
import { makeCylinder } from 'replicad';
export default function main() {
  return makeCylinder(5, 20);
}`,
      },
      mainFile: file,
      parameters: {},
    });
    assertSuccess(result, 'replicad uncoloured createGeometry');

    const baseColor = await getMaterialBaseColor(result);
    const expected = cadMaterialDefaults.baseColorFactor;
    for (let i = 0; i < 4; i++) {
      expect(baseColor[i]).toBeCloseTo(expected[i]!, 2);
    }
  });
});
