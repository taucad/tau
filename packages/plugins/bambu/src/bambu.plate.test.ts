import { readFile } from 'node:fs/promises';

import { fffProcessOf } from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The staleness check shares the render script's own source hash.
import { hashRenderInputs, renderHashPath } from '../scripts/render-plates.mjs';
import {
  bambuA1MiniHotend,
  bambuA1MiniPlates,
  bambuPlateForBedType,
  bambuX1cHotend,
  bambuX1cPlates,
} from '#bambu.plate.js';
import type { BambuModelAsset } from '#bambu.plate.js';
import { bambuA1MiniManifest, bambuX1cManifest } from '#bambu.manifest.js';

type Gltf = {
  asset: { version: string };
  nodes: Array<{
    name: string;
    mesh: number;
    matrix?: number[];
    rotation?: number[];
    scale?: number[];
    translation?: number[];
  }>;
  meshes: Array<{
    name: string;
    primitives: Array<{ attributes: { POSITION: number }; material: number; indices: number }>;
  }>;
  accessors: Array<{
    min: number[];
    max: number[];
    bufferView: number;
    byteOffset?: number;
    count: number;
    componentType: number;
  }>;
  bufferViews: Array<{ byteOffset: number }>;
  materials: Array<{ pbrMetallicRoughness: { baseColorFactor: number[] } }>;
};

/** Reads a GLB's header and JSON chunk, rejecting anything but glTF 2.0. */
const readGlb = async (url: URL): Promise<Gltf> => {
  const bytes = await readFile(url);
  expect(bytes.toString('latin1', 0, 4)).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  expect(bytes.toString('latin1', 16, 20)).toBe('JSON');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) as Gltf;
  expect(gltf.asset.version).toBe('2.0');
  return gltf;
};

/** POSITION bounds of every mesh, mapped by the documented transform into source-frame millimetres. */
const sourceFrameBounds = (gltf: Gltf, asset: BambuModelAsset) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION]!;
      // Rotate +90° about X: glTF (x, y, z) is source (x, -z, y).
      const lower = [accessor.min[0]!, -accessor.max[2]!, accessor.min[1]!];
      const upper = [accessor.max[0]!, -accessor.min[2]!, accessor.max[1]!];
      for (const axis of [0, 1, 2]) {
        min[axis] = Math.min(min[axis]!, lower[axis]! * asset.modelUnitScale);
        max[axis] = Math.max(max[axis]!, upper[axis]! * asset.modelUnitScale);
      }
    }
  }

  return { min, max };
};

const toSrgbHex = (linear: number): string => {
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
};

describe('bambuX1cPlates', () => {
  it('should describe exactly the plates the X1C manifest advertises', () => {
    expect(bambuX1cPlates.map((plate) => plate.id)).toEqual(
      fffProcessOf(bambuX1cManifest)?.bed.plates.map((plate) => plate.id),
    );
  });

  it.each([
    ['Cool Plate', 'cool'],
    ['cool_plate', 'cool'],
    ['Engineering Plate', 'engineering'],
    ['eng_plate', 'engineering'],
    ['High Temp Plate', 'high-temperature'],
    ['hot_plate', 'high-temperature'],
    ['Textured PEI Plate', 'textured-pei'],
    ['textured_plate', 'textured-pei'],
    ['textured-pei', 'textured-pei'],
    [' Textured PEI Plate ', 'textured-pei'],
  ])('should resolve the bed type %j to the %s plate', (name, id) => {
    expect(bambuPlateForBedType(name)?.id).toBe(id);
  });

  it('should return undefined for a plate it does not model', () => {
    expect(bambuPlateForBedType('Supertack Plate')).toBeUndefined();
  });

  it('should resolve a name both printers share within the family asked for', () => {
    expect(bambuPlateForBedType('hot_plate', 'a1-mini')).toMatchObject({ id: 'high-temperature', printer: 'a1-mini' });
    expect(bambuPlateForBedType('hot_plate', 'x1c')).toMatchObject({ id: 'high-temperature', printer: 'x1c' });
    expect(bambuPlateForBedType('cool_plate', 'a1-mini')).toBeUndefined();
  });

  it('should give every bed-type name to one plate only', () => {
    const names = bambuX1cPlates.flatMap((plate) => plate.bedTypeNames);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe.each([
  ...bambuX1cPlates.map((plate) => [plate.model.pathname.split('/').at(-1), plate] as const),
  ['x1c-hotend.glb', bambuX1cHotend] as const,
  ...bambuA1MiniPlates.map((plate) => [plate.model.pathname.split('/').at(-1), plate] as const),
  ['a1-mini-hotend.glb', bambuA1MiniHotend] as const,
])('committed model %s', (_name, asset) => {
  it('should place its geometry at the documented bounds within 0.05 mm', async () => {
    const gltf = await readGlb(asset.model);
    expect(gltf.nodes.every((node) => !node.matrix && !node.rotation && !node.scale && !node.translation)).toBe(true);
    const bounds = sourceFrameBounds(gltf, asset);
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(bounds.min[axis]! - asset.bounds.min[axis]!)).toBeLessThan(0.05);
      expect(Math.abs(bounds.max[axis]! - asset.bounds.max[axis]!)).toBeLessThan(0.05);
    }
  });
});

describe.each([...bambuX1cPlates, ...bambuA1MiniPlates].map((plate) => [plate.id, plate] as const))(
  'the %s plate model',
  (_id, plate) => {
    it('should colour its surface mesh as the descriptor says', async () => {
      const gltf = await readGlb(plate.model);
      const surface = gltf.meshes.find((mesh) => mesh.name === 'surface')!;
      const [red, green, blue] = gltf.materials[surface.primitives[0]!.material]!.pbrMetallicRoughness.baseColorFactor;
      expect(`#${toSrgbHex(red!)}${toSrgbHex(green!)}${toSrgbHex(blue!)}`).toBe(plate.surface.color);
    });
  },
);

describe('pre-rendered models', () => {
  it('should be rendered from the current Replicad sources (run `pnpm nx run bambu:render-plates`)', async () => {
    const recorded = await readFile(renderHashPath, 'utf8');
    expect(recorded.trim()).toBe(await hashRenderInputs());
  });
});

describe('A1 mini plate catalogue', () => {
  it('should match the Mini manifest and keep the physical thin-sheet bounds', () => {
    expect(bambuA1MiniPlates.map(({ id }) => id)).toEqual(
      fffProcessOf(bambuA1MiniManifest)?.bed.plates.map(({ id }) => id),
    );
    expect(bambuA1MiniPlates[1]?.bounds).toEqual({ min: [-2, -9.132, -0.55], max: [182, 187.999, 0.04] });
    expect(bambuA1MiniPlates.every(({ printer }) => printer === 'a1-mini')).toBe(true);
  });
});

// Inspect the actual surface triangles: bounds alone would accept a plain rectangle.
it.each([...bambuX1cPlates, ...bambuA1MiniPlates])('should pierce and shape the $printer $id sheet', async (plate) => {
  const gltf = await readGlb(plate.model);
  const bytes = await readFile(plate.model);
  const binary = 20 + bytes.readUInt32LE(12) + 8;
  const primitive = gltf.meshes.find(({ name }) => name === 'steel')!.primitives[0]!;
  const positions = gltf.accessors[primitive.attributes.POSITION]!;
  const indices = gltf.accessors[primitive.indices]!;
  expect(positions.componentType).toBe(5126);
  expect(indices.componentType).toBe(5125);
  const vertex = (index: number): readonly [number, number, number] => {
    const offset =
      binary + gltf.bufferViews[positions.bufferView]!.byteOffset + (positions.byteOffset ?? 0) + index * 12;
    return [
      bytes.readFloatLE(offset) * 1000,
      -bytes.readFloatLE(offset + 8) * 1000,
      bytes.readFloatLE(offset + 4) * 1000,
    ];
  };
  const covers = (x: number, y: number): boolean => {
    for (let index = 0; index < indices.count; index += 3) {
      const offset = binary + gltf.bufferViews[indices.bufferView]!.byteOffset + (indices.byteOffset ?? 0) + index * 4;
      const [a, b, c] = [0, 4, 8].map((step) => vertex(bytes.readUInt32LE(offset + step)));
      if ([a!, b!, c!].some((point) => Math.abs(point[2] - positions.max[1]! * 1000) > 0.001)) {
        continue;
      }
      const cross = (p: readonly number[], q: readonly number[]): number =>
        (q[0]! - p[0]!) * (y - p[1]!) - (q[1]! - p[1]!) * (x - p[0]!);
      const signs = [cross(a!, b!), cross(b!, c!), cross(c!, a!)];
      if (signs.every((sign) => sign >= 0) || signs.every((sign) => sign <= 0)) {
        return true;
      }
    }
    return false;
  };
  expect(covers(90, 90)).toBe(true);
  if (plate.printer === 'x1c') {
    expect(covers(128, 263)).toBe(true);
    expect(covers(128, 257.7)).toBe(false);
    expect(covers(230, -4)).toBe(false);
    expect(covers(247, -4)).toBe(false);
    expect(covers(20, -5)).toBe(false);
    expect(covers(100, -5)).toBe(true);
    return;
  }
  expect(covers(49, 186)).toBe(true);
  expect(covers(131, 186)).toBe(true);
  expect(covers(90, 186)).toBe(false);
  expect(covers(20, -5)).toBe(false);
  expect(covers(100, -5)).toBe(true);
  for (const [x, y] of [
    [57.958, -5.566],
    [165, -5],
    [177, -5],
  ]) {
    expect(covers(x!, y!)).toBe(false);
  }
});
