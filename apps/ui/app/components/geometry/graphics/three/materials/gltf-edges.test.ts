// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector2,
  Matrix4,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LineSegments2 } from 'three/addons';
import {
  applyFatLineSegments,
  createGltfOccurrenceEdgeBatch,
  createGltfFatLineMaterial,
  getGltfFatLinePositions,
  getGltfOccurrenceEdgeBatch,
  cloneGltfFatLineOwnership,
  collectGltfFatLineMaterials,
  getFatLineSourceIndices,
  setGltfFatLineEmphasis,
  updateGltfEdgeColor,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';

describe('cloned definition edge ownership', () => {
  it('keeps reflected WebGPU edge quads uncullable through occurrence and emphasis materials', () => {
    const scene = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1]), 1));
    scene.add(new LineSegments(geometry, new LineBasicMaterial()));
    applyFatLineSegments({ ...mock<GLTF>(), scene }, { backend: 'webgpu', resolution: new Vector2(800, 600) });
    const source = scene.children[0] as LineSegments2;
    const occurrence = source.clone();
    cloneGltfFatLineOwnership(source, occurrence);
    occurrence.scale.x = -1;
    occurrence.updateMatrixWorld(true);
    expect(occurrence.matrixWorld.determinant()).toBeLessThan(0);
    try {
      expect(source.material.side).toBe(DoubleSide);
      expect(occurrence.material.side).toBe(DoubleSide);
      setGltfFatLineEmphasis(occurrence, 'selected');
      expect(occurrence.material.side).toBe(DoubleSide);
    } finally {
      for (const object of [source, occurrence]) {
        for (const material of collectGltfFatLineMaterials(object)) {
          material.dispose();
        }
      }
      source.geometry.dispose();
    }
  });

  it('shares immutable geometry and indices while isolating and releasing occurrence material state', () => {
    const scene = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1]), 1));
    scene.add(new LineSegments(geometry, new LineBasicMaterial()));
    applyFatLineSegments({ ...mock<GLTF>(), scene }, { backend: 'webgl', resolution: new Vector2(800, 600) });
    const source = scene.children[0] as LineSegments2;
    const first = source.clone();
    const second = source.clone();
    cloneGltfFatLineOwnership(source, first);
    cloneGltfFatLineOwnership(source, second);
    expect(first.geometry).toBe(source.geometry);
    expect(second.geometry).toBe(source.geometry);
    expect(getFatLineSourceIndices(first)).toBe(getFatLineSourceIndices(source));
    expect(getFatLineSourceIndices(second)).toBe(getFatLineSourceIndices(source));
    expect(first.material).not.toBe(second.material);
    expect(first.material).not.toBe(source.material);
    const sourceColor = source.material.color.getHex();
    const occurrence = new Group();
    occurrence.add(first);
    updateGltfEdgeColor(occurrence, 0x12_34_56);
    setGltfFatLineEmphasis(first, 'hover');
    expect(source.material.color.getHex()).toBe(sourceColor);
    expect(second.material.color.getHex()).toBe(sourceColor);
    const sourceDispose = vi.spyOn(source.material, 'dispose');
    const secondDispose = vi.spyOn(second.material, 'dispose');
    const firstOwned = collectGltfFatLineMaterials(first);
    const disposed = firstOwned.map((material) => vi.spyOn(material, 'dispose'));
    for (const material of firstOwned) {
      material.dispose();
    }
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(secondDispose).not.toHaveBeenCalled();
    for (const object of [source, second]) {
      for (const material of collectGltfFatLineMaterials(object)) {
        material.dispose();
      }
    }
    source.geometry.dispose();
  });
});

describe.each(['webgl', 'webgpu'] as const)('occurrence edge batches %s', (backend) => {
  it('shares real segment storage, updates selected colors without endpoint derivation, and releases only batch owners', () => {
    const material = createGltfFatLineMaterial({ backend, resolution: new Vector2(800, 600) });
    const sourcePositions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const batch = createGltfOccurrenceEdgeBatch({
      backend,
      material,
      occurrences: [
        { componentId: 'left', positions: sourcePositions, localToBatch: new Matrix4().makeTranslation(3, 0, 0) },
        { componentId: 'right', positions: sourcePositions, localToBatch: new Matrix4().makeTranslation(7, 0, 0) },
      ],
    });
    if (!batch) {
      throw new Error('Expected real fat-line occurrence batch');
    }
    const { geometry } = batch.object;
    const start = geometry.getAttribute('instanceStart');
    const end = geometry.getAttribute('instanceEnd');
    const positions = getGltfFatLinePositions(batch.object);
    const sourceDispose = vi.spyOn(material, 'dispose');
    const batchMaterialDispose = vi.spyOn(batch.object.material, 'dispose');
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    try {
      expect(start.array.buffer).toBe(end.array.buffer);
      expect(positions).toEqual(new Float32Array([3, 0, 0, 4, 0, 0, 7, 0, 0, 8, 0, 0]));
      expect(sourcePositions).toEqual(new Float32Array([0, 0, 0, 1, 0, 0]));
      expect(batch.positionBytes).toBe(48);
      expect(batch.colorBytes).toBe(48);
      expect(batch.segments).toEqual([
        { componentId: 'left', first: 0, count: 1 },
        { componentId: 'right', first: 1, count: 1 },
      ]);
      expect(getGltfOccurrenceEdgeBatch(batch.object)).toBe(batch);
      expect(batch.setColors(new Map([['right', 0xff_00_00]]), 0x00_00_ff)).toBe(true);
      const colors = geometry.getAttribute('instanceColorStart');
      expect(colors.getX(0)).toBe(0);
      expect(colors.getZ(0)).toBe(1);
      expect(colors.getX(1)).toBe(1);
      expect(colors.getZ(1)).toBe(0);
      expect(batch.setColors(new Map([['right', 0xff_00_00]]), 0x00_00_ff)).toBe(false);
      const beforePose = positions ? new Float32Array(positions) : undefined;
      batch.object.matrix.makeTranslation(2, 0, 0);
      batch.object.matrixAutoUpdate = false;
      batch.object.updateMatrixWorld(true);
      expect(getGltfFatLinePositions(batch.object)).toBe(positions);
      expect(positions).toEqual(beforePose);
      const scene = new Group();
      scene.add(batch.object);
      updateGltfEdgeColor(scene, 0x00_ff_00);
      expect(colors.getY(0)).toBe(1);
      expect(colors.getX(1)).toBe(1);
      expect(batch.object.material.color.getHex()).toBe(0xff_ff_ff);
      batch.dispose();
      batch.dispose();
      expect(geometryDispose).toHaveBeenCalledTimes(1);
      expect(batchMaterialDispose).toHaveBeenCalledTimes(1);
      expect(sourceDispose).not.toHaveBeenCalled();
      expect(getGltfOccurrenceEdgeBatch(batch.object)).toBeUndefined();
      expect(batch.setColors(new Map(), 0xff_ff_ff)).toBe(false);
    } finally {
      batch.dispose();
      material.dispose();
    }
  });

  it('rejects Float32 overflow rather than rendering non-finite edge endpoints', () => {
    const material = createGltfFatLineMaterial({ backend, resolution: new Vector2(800, 600) });
    try {
      expect(() =>
        createGltfOccurrenceEdgeBatch({
          backend,
          material,
          occurrences: [
            {
              componentId: 'bad',
              positions: new Float32Array([0, 0, 0, 1, 0, 0]),
              localToBatch: new Matrix4().makeTranslation(1e40, 0, 0),
            },
          ],
        }),
      ).toThrow(RangeError);
    } finally {
      material.dispose();
    }
  });
});
