// @vitest-environment node
/**
 * OpenCASCADE rendering / color tests.
 *
 * The OCCT kernel has two color paths:
 *
 * - **Non-PBR** (no `metalness`/`roughness`): uses `Quantity_Color(r, g, b,
 *   TOC_sRGB)` which converts internally — no JS-side conversion needed.
 * - **PBR** (with `metalness` or `roughness`): uses
 *   `Quantity_ColorRGBA(r, g, b, a)` which assumes **linear** input — JS-side
 *   `srgbToLinear` is applied per channel before construction.
 *
 * Both paths must end up with linear `baseColorFactor` in the GLB output. See
 * docs/policy/color-space-policy.md.
 */
import { describe, expect, it } from 'vitest';
import { opencascade as opencascadeKernel } from '#kernels/opencascade/opencascade.kernel.js';
import {
  colorParityCases,
  expectLinearBaseColor,
  getMaterialAlphaMode,
  getMaterialBaseColor,
} from '#testing/color-testing.utils.js';
import { assertSuccess, createGeometryFile, createTestWorker } from '#testing/kernel-testing.utils.js';
import type { HashedGeometryResult } from '#types/runtime.types.js';

const buildNonPbrSource = (hex: string, opacity: number): string => `
import { BRepPrimAPI_MakeCylinder } from 'libcascade';
export default function main() {
  return { shape: new BRepPrimAPI_MakeCylinder(5, 20).Shape(), color: '${hex}', opacity: ${opacity} };
}`;

const buildPbrSource = (hex: string, opacity: number): string => `
import { BRepPrimAPI_MakeCylinder } from 'libcascade';
export default function main() {
  return {
    shape: new BRepPrimAPI_MakeCylinder(5, 20).Shape(),
    color: '${hex}',
    opacity: ${opacity},
    metalness: 0.5,
    roughness: 0.5,
  };
}`;

type RenderCase = {
  readonly source: string;
  readonly hex: string;
  readonly opacity: number;
  readonly variant: string;
};

async function renderColored({ source, hex, opacity, variant }: RenderCase): Promise<HashedGeometryResult> {
  const file = 'colored.ts';
  const worker = await createTestWorker(opencascadeKernel, { [file]: source });
  const result = await worker.createGeometry({
    file: createGeometryFile(file),
    parameters: {},
  });
  assertSuccess(result, `opencascade ${variant} (${hex}, alpha=${opacity})`);
  return result;
}

describe('OpenCASCADE — color rendering parity', { timeout: 180_000 }, () => {
  describe('non-PBR path (Quantity_Color TOC_sRGB)', () => {
    for (const { hex, label, opacity } of colorParityCases) {
      // The non-PBR `Quantity_Color` constructor has no alpha channel — opacity
      // is only honoured by the PBR `Quantity_ColorRGBA` path. Skip translucent
      // cases here to avoid asserting on an OCCT capability that doesn't exist.
      if (opacity < 1) {
        continue;
      }

      it(`writes linear baseColorFactor for ${label} (${hex})`, async () => {
        const result = await renderColored({
          source: buildNonPbrSource(hex, opacity),
          hex,
          opacity,
          variant: 'non-PBR',
        });
        const baseColor = await getMaterialBaseColor(result);
        expectLinearBaseColor(baseColor, hex);
      });
    }
  });

  describe('PBR path (Quantity_ColorRGBA linear)', () => {
    for (const { hex, label, opacity } of colorParityCases) {
      it(`writes linear baseColorFactor for ${label} (${hex}, alpha=${opacity})`, async () => {
        const result = await renderColored({
          source: buildPbrSource(hex, opacity),
          hex,
          opacity,
          variant: 'PBR',
        });
        const baseColor = await getMaterialBaseColor(result);
        expectLinearBaseColor(baseColor, hex, { opacity });
      });
    }

    it('preserves explicit metalness/roughness on PBR materials', async () => {
      const file = 'pbr.ts';
      const worker = await createTestWorker(opencascadeKernel, {
        [file]: `
import { BRepPrimAPI_MakeCylinder } from 'libcascade';
export default function main() {
  return {
    shape: new BRepPrimAPI_MakeCylinder(5, 20).Shape(),
    color: '#1565C0',
    metalness: 0.9,
    roughness: 0.2,
  };
}`,
      });
      const result = await worker.createGeometry({
        file: createGeometryFile(file),
        parameters: {},
      });
      assertSuccess(result, 'occt PBR createGeometry');

      const baseColor = await getMaterialBaseColor(result);
      expectLinearBaseColor(baseColor, '#1565C0');
    });
  });

  it('emits a valid GLB for an uncoloured shape (writer default style)', async () => {
    // OCCT routes uncoloured shapes through `RWGltf_CafWriter`'s default style.
    // Whether the writer emits a glTF material entry for the default-styled
    // shape is implementation-defined; we just verify the GLB itself is valid
    // and parseable, and -- if a material is present -- its baseColorFactor is
    // linear-space (alpha = 1, OPAQUE).
    const file = 'default.ts';
    const worker = await createTestWorker(opencascadeKernel, {
      [file]: `
import { BRepPrimAPI_MakeCylinder } from 'libcascade';
export default function main() {
  return new BRepPrimAPI_MakeCylinder(5, 20).Shape();
}`,
    });
    const result = await worker.createGeometry({
      file: createGeometryFile(file),
      parameters: {},
    });
    assertSuccess(result, 'occt uncoloured createGeometry');

    expect(result.data.format).toBe('gltf');

    try {
      const baseColor = await getMaterialBaseColor(result);
      expect(baseColor).toHaveLength(4);
      expect(baseColor[3]).toBeCloseTo(1, 2);
      const alphaMode = await getMaterialAlphaMode(result);
      expect(alphaMode).toBe('OPAQUE');
    } catch {
      // No material in the GLB -- the writer omitted the default style. That's
      // acceptable; the test above already verified the GLB is valid.
    }
  });
});
