import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import type { Mechanism, Pose } from '@taucad/kinematics';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { prepareCapturePresentation } from '#services/headless-capture-presentation.js';

const preservedExtension = 'VENDOR_preserved';

const sourceGlb = (): Uint8Array<ArrayBuffer> => {
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { translation: [10, 0, 0], children: [1, 2] },
        { mesh: 0, translation: [2, 0, 0] },
        { mesh: 0, translation: [5, 0, 0] },
      ],
      meshes: [
        {
          primitives: [
            { mode: 4, material: 0 },
            { mode: 1, material: 0 },
          ],
        },
      ],
      materials: [
        {
          pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 0.8] },
          alphaMode: 'BLEND',
        },
      ],
      buffers: [{ byteLength: 4 }],
      extensions: { [preservedExtension]: { value: 42 } },
    }),
  );
  const padded = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + padded + 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.fill(0x20, 20, 20 + padded);
  bytes.set(json, 20);
  header.setUint32(20 + padded, 4, true);
  header.setUint32(24 + padded, 0x00_4e_49_42, true);
  bytes.set([1, 2, 3, 4], 28 + padded);
  return bytes;
};

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: {
    base: { components: ['component:node-2'] },
    arm: { components: ['component:node-1'] },
  },
  joints: {
    hinge: {
      type: 'revolute',
      parent: 'base',
      child: 'arm',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    },
  },
};
const input = { sourceFile: 'main.ts', geometryHash: 'original' };

describe('prepareCapturePresentation', () => {
  it('keeps unchanged content and cache identity without parsing', async () => {
    const source = new Uint8Array();
    const result = await prepareCapturePresentation(source, {
      ...input,
      opacityByComponentId: {},
    });
    expect(result.content).toBe(source);
    expect(result.geometryHash).toBe(input.geometryHash);
  });

  it.each([Number.NaN, -0.1, 1.1])('rejects invalid opacity %s', async (opacity) => {
    await expect(
      prepareCapturePresentation(sourceGlb(), {
        ...input,
        opacityByComponentId: { 'component:node-1': opacity },
      }),
    ).rejects.toThrow('opacity must be in [0, 1]');
  });
  it('poses placed components in GLB space without mutating source or sibling instances', async () => {
    const source = sourceGlb();
    const original = new Uint8Array(source);
    const delta = new Matrix4().makeRotationZ(Math.PI / 2);
    const pose: Pose = {
      coordinates: { hinge: Math.PI / 2 },
      linkTransforms: { arm: delta.toArray() },
    };
    const result = await prepareCapturePresentation(source, {
      ...input,
      mechanism,
      pose,
      opacityByComponentId: {},
    });
    const parsed = parseGltfBytes(result.content);
    const local = new Matrix4().fromArray(parsed.json.nodes![1]!.matrix!);
    const placed = new Matrix4().makeTranslation(10, 0, 0).multiply(local);
    const expected = delta.clone().multiply(new Matrix4().makeTranslation(12, 0, 0));
    for (const [index, value] of placed.elements.entries()) {
      expect(value).toBeCloseTo(expected.elements[index]!, 12);
    }
    expect(parsed.json.nodes![1]!.translation).toBeUndefined();
    expect(parsed.json.nodes![2]!.translation).toEqual([5, 0, 0]);
    expect(parsed.bin).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(parsed.json.extensions).toEqual({ [preservedExtension]: { value: 42 } });
    expect(source).toEqual(original);
    expect(result.geometryHash).not.toBe(input.geometryHash);
    const repeat = await prepareCapturePresentation(source, {
      ...input,
      mechanism,
      pose,
      opacityByComponentId: {},
    });
    expect(repeat.geometryHash).toBe(result.geometryHash);
  });

  it('inherits opacity and isolates shared meshes/materials, preserving edge opacity and visibility refs', async () => {
    const source = sourceGlb();
    const original = new Uint8Array(source);
    const result = await prepareCapturePresentation(source, {
      ...input,
      opacityByComponentId: { 'component:node-0': 0.25, 'component:node-2': 1 },
    });
    const { json } = parseGltfBytes(result.content);
    const armMesh = json.nodes![1]!.mesh!;
    expect(armMesh).not.toBe(0);
    const surface = json.meshes![armMesh]!.primitives![0]!;
    expect(json.materials![surface.material!]!.pbrMetallicRoughness!.baseColorFactor).toEqual([0.2, 0.4, 0.6, 0.25]);
    expect(json.meshes![armMesh]!.primitives![1]!.material).toBe(0);
    expect(json.nodes![2]!.mesh).toBe(0);
    expect(json.materials![0]!.pbrMetallicRoughness!.baseColorFactor).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(result.remapPrimitives([{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 1 }])).toEqual([
      { nodeIndex: 1, meshIndex: armMesh, primitiveIndex: 1 },
    ]);
    expect(source).toEqual(original);
    const otherOpacity = await prepareCapturePresentation(source, {
      ...input,
      opacityByComponentId: { 'component:node-1': 0.5 },
    });
    expect(result.geometryHash).not.toBe(otherOpacity.geometryHash);
  });
});
