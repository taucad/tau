import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';

export const nodeChildrenTestMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
};

/**
 * The OpenRSCAD shape: node 0 is a module holding only its feature-edge LINES, placed at x = 10, and node 1, its child,
 * is the solid's triangles.
 *
 * @returns The GLB bytes.
 */
export function buildModuleAboveSolidGlb(): Uint8Array<ArrayBuffer> {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const glb = writeGlb({
    nodes: [
      {
        name: 'Module',
        primitives: [
          { mode: 1, positions, indices: Uint32Array.from([0, 1, 1, 2]), material: nodeChildrenTestMaterial },
        ],
      },
      {
        name: 'Solid',
        primitives: [
          {
            mode: 4,
            positions,
            normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            indices: Uint32Array.from([0, 1, 2]),
            material: nodeChildrenTestMaterial,
          },
        ],
      },
    ],
  });
  const view = new DataView(glb.buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    nodes: Array<{ children?: number[]; translation?: number[] }>;
    scenes: Array<{ nodes: number[] }>;
  };
  json.nodes[0]!.children = [1];
  json.nodes[0]!.translation = [10, 0, 0];
  json.scenes[0]!.nodes = [0];
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const rest = glb.subarray(20 + jsonLength);
  const output = new Uint8Array(20 + paddedLength + rest.byteLength).fill(0x20, 20, 20 + paddedLength);
  output.set(glb.subarray(0, 20));
  output.set(encoded, 20);
  output.set(rest, 20 + paddedLength);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(8, output.byteLength, true);
  outputView.setUint32(12, paddedLength, true);
  return output;
}
