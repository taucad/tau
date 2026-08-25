// @vitest-environment node
/**
 * Manifold rendering / color **observation** tests.
 *
 * Manifold's glTF assembly is owned upstream
 * (`repos/manifold/bindings/wasm/lib/scene-builder.ts` `GLTFNodesToGLTFDoc`).
 * Tau does not modify this pipeline; instead, these tests **lock down** the
 * current observable behaviour so any regression upstream will be caught.
 *
 * See docs/policy/color-space-policy.md for sRGB↔linear handling.
 */
import { describe, expect, it } from 'vitest';
import { manifoldKernel } from '#manifold.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import {
  assertSuccess,
  createTestGeometry,
  expectLinearBaseColor,
  getAllMaterialBaseColors,
  getMaterialBaseColor,
} from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

import type { HashedGeometryResult } from '@taucad/runtime/types';

const runtime = defineRuntime({ kernels: [manifoldKernel()], bundlers: [esbuildBundler()] });

async function renderSource(file: string, source: string): Promise<HashedGeometryResult> {
  const result = await createTestGeometry({
    runtime,
    files: { [file]: source },
    mainFile: file,
    parameters: {},
  });
  assertSuccess(result, `manifold ${file}`);
  return result;
}

describe('Manifold — color rendering observation', { timeout: 120_000 }, () => {
  it('emits at least one material for an uncoloured cube (default behaviour)', async () => {
    const result = await renderSource(
      'cube.ts',
      `
import { Manifold } from 'manifold-3d/manifoldCAD';
export default function main() {
  return Manifold.cube([10, 10, 10], true);
}`,
    );
    const baseColors = await getAllMaterialBaseColors(result);
    expect(baseColors.length).toBeGreaterThan(0);
    for (const color of baseColors) {
      expect(color).toHaveLength(4);
      for (const channel of color) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('preserves an explicitly-set GLTFNode baseColorFactor in the GLB output', async () => {
    // Author supplies linear-space `baseColorFactor` directly via the upstream
    // `GLTFNode.material` API. The output GLB should round-trip those values
    // verbatim (the upstream pipeline does NO color-space conversion of its
    // own — caller-supplied values are treated as already-linear, per glTF
    // 2.0).
    const result = await renderSource(
      'colored.ts',
      `
import { GLTFNode, getGLTFNodes, Manifold } from 'manifold-3d/manifoldCAD';
export default function main() {
  const node = new GLTFNode();
  node.manifold = Manifold.cube([10, 10, 10], true);
  node.material = { baseColorFactor: [0.7, 0.1, 0.1] };
  return getGLTFNodes();
}
`,
    );
    const baseColor = await getMaterialBaseColor(result);
    expect(baseColor[0]).toBeCloseTo(0.7, 2);
    expect(baseColor[1]).toBeCloseTo(0.1, 2);
    expect(baseColor[2]).toBeCloseTo(0.1, 2);
  });

  it('matches a known linear value when the author pre-converts sRGB → linear', async () => {
    // For parity with kernels that take sRGB hex strings, callers who want
    // `#1565C0` (Material Design blue) supply the linear values explicitly.
    // The exact linear triple for #1565C0 is approximately (0.0089, 0.1329,
    // 0.5271).
    const result = await renderSource(
      'parity.ts',
      `
import { GLTFNode, getGLTFNodes, Manifold } from 'manifold-3d/manifoldCAD';
export default function main() {
  const node = new GLTFNode();
  node.manifold = Manifold.cube([10, 10, 10], true);
  node.material = { baseColorFactor: [0.0089, 0.1329, 0.5271] };
  return getGLTFNodes();
}
`,
    );
    const baseColor = await getMaterialBaseColor(result);
    expectLinearBaseColor(baseColor, '#1565C0');
  });
});
