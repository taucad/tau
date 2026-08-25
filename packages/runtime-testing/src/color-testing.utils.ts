/**
 * Color testing utilities — shared color matrix + glTF material extraction
 * helpers used by per-kernel rendering tests and cross-kernel parity tests.
 */

import { Primitive } from '@gltf-transform/core';
import { createNodeIo } from '@taucad/geometry-core';
import { expect } from 'vitest';

const primitiveModeTriangles = Primitive.Mode['TRIANGLES']!;

type GeometryResult = {
  readonly success: boolean;
  readonly data?: unknown;
  readonly issues: readonly unknown[];
};

const srgbHexToLinearTuple = (hex: string, alpha: number): [number, number, number, number] => {
  const value = hex.replace(/^#/, '');
  const linear = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.040_45 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return [
    linear(Number.parseInt(value.slice(0, 2), 16)),
    linear(Number.parseInt(value.slice(2, 4), 16)),
    linear(Number.parseInt(value.slice(4, 6), 16)),
    alpha,
  ];
};

function listAllGlbBuffers(result: GeometryResult): Array<Uint8Array<ArrayBuffer>> {
  if (!result.success) {
    return [];
  }

  const { data } = result;
  if (typeof data !== 'object' || data === null || !('format' in data) || !('content' in data)) {
    return [];
  }
  return data.format === 'gltf' && data.content instanceof Uint8Array ? [data.content as Uint8Array<ArrayBuffer>] : [];
}

/**
 * A single color parity test case.
 *
 * @public
 */
export type ColorParityCase = {
  /** Human-readable label for test naming */
  readonly label: string;
  /** CSS hex color string (sRGB) */
  readonly hex: string;
  /** Alpha in `[0..1]` */
  readonly opacity: number;
};

/**
 * Canonical color matrix shared by every kernel rendering test and the
 * cross-kernel parity test. Includes:
 * - Pure primaries (sRGB endpoints — degenerate, pass even with the bug)
 * - Mid-gray `#808080` (the discriminating case — sRGB → 0.5024 linear vs
 *   correct 0.2159)
 * - Reported washed-out colors from the original bug report
 * - One translucent case for `alphaMode = 'BLEND'` coverage
 *
 * @public
 */
export const colorParityCases: readonly ColorParityCase[] = [
  { hex: '#FF0000', label: 'pure red', opacity: 1 },
  { hex: '#00FF00', label: 'pure green', opacity: 1 },
  { hex: '#0000FF', label: 'pure blue', opacity: 1 },
  { hex: '#808080', label: 'mid gray (discriminator)', opacity: 1 },
  { hex: '#D94F4F', label: 'reported red', opacity: 1 },
  { hex: '#4F7FD9', label: 'reported blue', opacity: 1 },
  { hex: '#1565C0', label: 'occt parity blue', opacity: 1 },
  { hex: '#FF0000', label: 'translucent red', opacity: 0.5 },
] as const;

/**
 * Read the `baseColorFactor` of a material from a `HashedGeometryResult`'s
 * embedded GLB.
 *
 * @param result - kernel `createGeometry` result with at least one GLB response
 * @param materialIndex - which material to read (defaults to 0)
 * @returns the linear RGBA tuple as stored in the GLB
 * @throws if the result has no GLB or the material does not exist
 * @public
 */
export async function getMaterialBaseColor(
  result: GeometryResult,
  materialIndex = 0,
): Promise<[number, number, number, number]> {
  const [glb] = listAllGlbBuffers(result);
  if (!glb) {
    throw new Error('No GLB data found in result');
  }
  const io = await createNodeIo();
  const document = await io.readBinary(glb);
  const materials = document.getRoot().listMaterials();
  const material = materials[materialIndex];
  if (!material) {
    throw new Error(`Material index ${materialIndex} out of range (found ${materials.length})`);
  }
  return material.getBaseColorFactor() as [number, number, number, number];
}

/**
 * List every material's `baseColorFactor` in writer order, **across all GLB
 * responses** in the result. Kernels may emit aggregate multi-node GLBs or
 * several GLB responses depending on their native assembly/export model.
 *
 * @param result - kernel `createGeometry` result with one or more GLB responses
 * @returns an array of linear RGBA tuples (one per material across all GLBs)
 * @public
 */
export async function getAllMaterialBaseColors(
  result: GeometryResult,
): Promise<Array<[number, number, number, number]>> {
  const buffers = listAllGlbBuffers(result);
  if (buffers.length === 0) {
    throw new Error('No GLB data found in result');
  }
  const io = await createNodeIo();
  const documents = await Promise.all(buffers.map(async (glb) => io.readBinary(glb)));
  const baseColors: Array<[number, number, number, number]> = [];
  for (const document of documents) {
    for (const material of document.getRoot().listMaterials()) {
      baseColors.push(material.getBaseColorFactor() as [number, number, number, number]);
    }
  }
  return baseColors;
}

/**
 * List `baseColorFactor` values referenced by TRIANGLES primitives in writer
 * order. Kernels may emit owner-local LINES primitives with their own edge
 * material; surface color parity tests should assert the materials actually
 * used by surface primitives.
 *
 * @param result - kernel `createGeometry` result with one or more GLB responses
 * @returns an array of linear RGBA tuples used by surface triangle primitives
 * @public
 */
export async function getTrianglePrimitiveBaseColors(
  result: GeometryResult,
): Promise<Array<[number, number, number, number]>> {
  const buffers = listAllGlbBuffers(result);
  if (buffers.length === 0) {
    throw new Error('No GLB data found in result');
  }
  const io = await createNodeIo();
  const documents = await Promise.all(buffers.map(async (glb) => io.readBinary(glb)));
  const baseColors: Array<[number, number, number, number]> = [];
  for (const document of documents) {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== primitiveModeTriangles) {
          continue;
        }
        const material = primitive.getMaterial();
        if (!material) {
          continue;
        }
        baseColors.push(material.getBaseColorFactor() as [number, number, number, number]);
      }
    }
  }
  return baseColors;
}

/**
 * Read the `alphaMode` of a material from a `HashedGeometryResult`'s GLB.
 *
 * @param result - kernel `createGeometry` result with at least one GLB response
 * @param materialIndex - which material to read (defaults to 0)
 * @returns one of `'OPAQUE'`, `'MASK'`, `'BLEND'`
 * @public
 */
export async function getMaterialAlphaMode(result: GeometryResult, materialIndex = 0): Promise<string> {
  const [glb] = listAllGlbBuffers(result);
  if (!glb) {
    throw new Error('No GLB data found in result');
  }
  const io = await createNodeIo();
  const document = await io.readBinary(glb);
  const materials = document.getRoot().listMaterials();
  const material = materials[materialIndex];
  if (!material) {
    throw new Error(`Material index ${materialIndex} out of range (found ${materials.length})`);
  }
  return material.getAlphaMode();
}

/**
 * Options bundle for {@link expectLinearBaseColor}. Bundled into a single
 * object so the helper signature stays at three parameters (per the project's
 * function-parameter limit).
 *
 * @public
 */
export type ExpectLinearBaseColorOptions = {
  /** Expected alpha channel (default `1`). */
  readonly opacity?: number;
  /** Per-channel absolute tolerance (default `0.01`). */
  readonly tolerance?: number;
};

/**
 * Assert that an actual `baseColorFactor` matches the linear-space conversion
 * of a sRGB hex color.
 *
 * Uses a per-channel absolute-difference tolerance (default 0.01) wide enough
 * to absorb rounding from the OCCT internal sRGB→linear path while still
 * catching the sRGB-as-linear bug (where the gap is `>= 0.15` for any non-zero,
 * non-saturated channel).
 *
 * @param actual - the RGBA tuple read from the GLB
 * @param hex - CSS hex color (sRGB) the kernel was instructed to render
 * @param options - {@link ExpectLinearBaseColorOptions}
 * @public
 */
export function expectLinearBaseColor(
  actual: readonly number[],
  hex: string,
  options: ExpectLinearBaseColorOptions = {},
): void {
  const opacity = options.opacity ?? 1;
  const tolerance = options.tolerance ?? 0.01;
  const expected = srgbHexToLinearTuple(hex, opacity);
  for (let i = 0; i < 4; i++) {
    expect(
      Math.abs(actual[i]! - expected[i]!),
      `Channel ${i}: expected ~${expected[i]!.toFixed(4)}, got ${actual[i]!.toFixed(4)} (hex=${hex}, alpha=${opacity})`,
    ).toBeLessThan(tolerance);
  }
}
