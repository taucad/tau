/**
 * OpenSCAD rendering / color tests.
 *
 * Locks in the linear-space `baseColorFactor` contract for the OpenSCAD
 * kernel. OpenSCAD emits per-face sRGB integer colours via OFF, then
 * `colorGroupToPrimitive` applies sRGB→linear before writing
 * `baseColorFactor`. See docs/policy/color-space-policy.md.
 */
import { describe, expect, it } from 'vitest';
import { openscad as openscadKernel } from '#openscad.kernel.js';
import {
  assertSuccess,
  colorParityCases,
  createGeometryFile,
  createTestWorker,
  expectLinearBaseColor,
  getAllMaterialBaseColors,
  getMaterialAlphaMode,
  getMaterialBaseColor,
} from '@taucad/runtime/testing';
import type { CreateGeometryResult } from '@taucad/runtime/types';

function hexToOscadVector(hex: string, opacity: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = (Number.parseInt(clean.slice(0, 2), 16) / 255).toFixed(6);
  const g = (Number.parseInt(clean.slice(2, 4), 16) / 255).toFixed(6);
  const b = (Number.parseInt(clean.slice(4, 6), 16) / 255).toFixed(6);
  return `[${r}, ${g}, ${b}, ${opacity.toFixed(6)}]`;
}

const buildSourceFor = (hex: string, opacity: number): string =>
  `color(${hexToOscadVector(hex, opacity)}) cube([10, 10, 10]);`;

async function renderColored(hex: string, opacity: number): Promise<CreateGeometryResult> {
  const file = 'colored.scad';
  const worker = await createTestWorker(openscadKernel, {
    [file]: buildSourceFor(hex, opacity),
  });
  const result = (await worker.createGeometry({
    file: createGeometryFile(file),
    parameters: {},
  })) as CreateGeometryResult;
  assertSuccess(result, `openscad createGeometry (${hex}, alpha=${opacity})`);
  return result;
}

describe('OpenSCAD — color rendering parity', { timeout: 120_000 }, () => {
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

  it('produces a separate material per unique colour', async () => {
    const file = 'multi.scad';
    const worker = await createTestWorker(openscadKernel, {
      [file]: `
        color([1, 0, 0]) cube([10, 10, 10]);
        translate([15, 0, 0]) color([0, 1, 0]) cube([10, 10, 10]);
        translate([30, 0, 0]) color([0, 0, 1]) cube([10, 10, 10]);
      `,
    });
    const result = (await worker.createGeometry({
      file: createGeometryFile(file),
      parameters: {},
    })) as CreateGeometryResult;
    assertSuccess(result, 'openscad multi-color createGeometry');

    const baseColors = await getAllMaterialBaseColors(result);
    expect(baseColors.length).toBeGreaterThanOrEqual(3);

    const hasRed = baseColors.some((c) => c[0] > 0.9 && c[1] < 0.05 && c[2] < 0.05);
    const hasGreen = baseColors.some((c) => c[1] > 0.9 && c[0] < 0.05 && c[2] < 0.05);
    const hasBlue = baseColors.some((c) => c[2] > 0.9 && c[0] < 0.05 && c[1] < 0.05);
    expect(hasRed, 'expected a red material').toBe(true);
    expect(hasGreen, 'expected a green material').toBe(true);
    expect(hasBlue, 'expected a blue material').toBe(true);
  });

  it('emits a default-coloured material for uncoloured geometry', async () => {
    const file = 'default.scad';
    const worker = await createTestWorker(openscadKernel, {
      [file]: 'cube([10, 10, 10]);',
    });
    const result = (await worker.createGeometry({
      file: createGeometryFile(file),
      parameters: {},
    })) as CreateGeometryResult;
    assertSuccess(result, 'openscad uncoloured createGeometry');

    const baseColor = await getMaterialBaseColor(result);
    expect(baseColor).toHaveLength(4);
    expect(baseColor[3]).toBeCloseTo(1, 2);
  });
});
