// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFExporter } from 'three/addons';
import type { Geometry } from '@taucad/types';
import { loadGltfWithMaterial, sampleGltfSurface } from '#components/geometry/splash/gltf-loader.js';
import {
  gear12AssemblyOffsetX,
  gear8AssemblyOffsetX,
  pitchRadius12,
  pitchRadius8,
} from '#components/geometry/splash/auth-splashback.constants.js';

/** Serializes a 5 mm cube — expressed in the runtime's canonical metres — as binary glTF. */
const millimetreCubeGltf = async (millimetres: number): Promise<Geometry> => {
  const mesh = new Mesh(
    new BoxGeometry(millimetres / 1000, millimetres / 1000, millimetres / 1000),
    new MeshStandardMaterial(),
  );
  const binary = await new GLTFExporter().parseAsync(mesh, { binary: true });
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- GLTFExporter returns ArrayBuffer for binary output
  return { format: 'gltf', content: new Uint8Array(binary as ArrayBuffer), hash: 'test-cube' };
};

const spanOf = (positions: Float32Array): number => {
  const box = new Box3();
  const point = new Vector3();
  for (let index = 0; index < positions.length; index += 3) {
    box.expandByPoint(point.set(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0));
  }

  return box.max.x - box.min.x;
};

describe('splash world scale', () => {
  it('converts the runtime glTF from metres into the millimetres the layout constants use', async () => {
    const geometry = await millimetreCubeGltf(5);
    const loaded = await loadGltfWithMaterial({ geometry, color: '#14b8a6' });
    expect(loaded).toBeDefined();

    const bounds = new Box3().setFromObject(loaded?.scene ?? new Mesh());
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(5, 4);
  });

  it('samples surface points in the same millimetre space as the meshes', async () => {
    const points = await sampleGltfSurface(await millimetreCubeGltf(5), 512);
    expect(points).toBeDefined();
    expect(spanOf(points?.positions ?? new Float32Array())).toBeCloseTo(5, 1);
  });
});

describe('gear assembly layout', () => {
  it('separates the gears by exactly the meshing centre distance', () => {
    expect(gear8AssemblyOffsetX - gear12AssemblyOffsetX).toBeCloseTo(pitchRadius12 + pitchRadius8, 10);
  });

  it('balances the outer circles about the origin so neither gear overhangs the viewport', () => {
    const addendum = 5 / Math.PI;
    const left = gear12AssemblyOffsetX - (pitchRadius12 + addendum);
    const right = gear8AssemblyOffsetX + (pitchRadius8 + addendum);

    expect(-left).toBeCloseTo(right, 10);
  });
});
