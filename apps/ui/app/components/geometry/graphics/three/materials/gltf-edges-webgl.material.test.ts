// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons';
import {
  applyFatLineSegments,
  createGltfFatLineMaterial,
  createGltfFatLineSegmentsFromPositions,
  createWebGlGltfFatLineMaterial,
  setGltfFatLineMaterialColor,
  updateGltfEdgeColor,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';

/**
 * Build a minimal GLTF-like object with `lineSegmentsCount` `LineSegments` children attached
 * to the scene group. Mirrors the helper in `gltf-edges-webgpu.material.test.ts` — kept
 * inline here so both files stay independently runnable.
 */
function makeGltfWithLineSegments(lineSegmentsCount: number): GLTF {
  const scene = new Group();
  for (let i = 0; i < lineSegmentsCount; i++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    const lineSegments = new LineSegments(geometry, new LineBasicMaterial());
    scene.add(lineSegments);
  }
  return { scene } as unknown as GLTF;
}

/**
 * Collect every `LineSegments2` material across the scene, returned in traversal order.
 */
function collectFatLineMaterials(scene: Object3D): unknown[] {
  const materials: unknown[] = [];
  scene.traverse((object) => {
    if ('type' in object && object.type === 'LineSegments2') {
      const mesh = object as unknown as { material: unknown };
      materials.push(mesh.material);
    }
  });
  return materials;
}

describe('createWebGlGltfFatLineMaterial', () => {
  describe('geometric depth', () => {
    it('does not inject a camera-distance line pull', () => {
      const material = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));

      expect(material.userData).not.toHaveProperty('depthBiasUniform');
      expect(material.customProgramCacheKey()).not.toContain('tau-gltf-edge-logdepth-bias');
      expect(material.depthTest).toBe(true);
    });
  });

  describe('R1 — material allocation parity with WebGPU path', () => {
    /**
     * Mirrors the WebGPU allocation-count regression guard. `applyFatLineSegments` must
     * allocate exactly one `LineMaterial` per call regardless of how many source
     * `LineSegments` the scene contains. The middleware-side merge collapses production
     * scenes to a single source, but the UI must remain tolerant of multi-source fan-outs.
     */
    it('shares a single LineMaterial instance across many LineSegments sources', () => {
      const gltf = makeGltfWithLineSegments(4);
      applyFatLineSegments(gltf, { resolution: new Vector2(1024, 768), backend: 'webgl' });

      const materials = collectFatLineMaterials(gltf.scene);
      expect(materials).toHaveLength(4);
      const unique = new Set(materials);
      expect(unique.size).toBe(1);
      expect(materials[0]).toBeInstanceOf(LineMaterial);
    });
  });

  describe('raw endpoint fat-line helper', () => {
    it('should create WebGL LineSegments2 from raw endpoint positions with the shared material', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const fatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0]),
      });

      expect(fatLine).toBeDefined();
      expect(fatLine!.type).toBe('LineSegments2');
      expect(fatLine!.material).toBe(material);
      expect(material).toBeInstanceOf(LineMaterial);
    });

    it('should update the shared WebGL material color without rebuilding geometry', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const fatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      })!;
      const { geometry } = fatLine;

      setGltfFatLineMaterialColor(material, 0xaa_bb_cc);

      expect((material as LineMaterial).color.getHex()).toBe(0xaa_bb_cc);
      expect(fatLine.geometry).toBe(geometry);
    });

    it('should return deduped WebGL materials touched by a scene edge color update', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const firstFatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      })!;
      const secondFatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([1, 0, 0, 1, 1, 0]),
      })!;
      const scene = new Group();
      scene.add(firstFatLine, secondFatLine);
      const firstGeometry = firstFatLine.geometry;
      const secondGeometry = secondFatLine.geometry;

      const updatedMaterials = updateGltfEdgeColor(scene, 0xaa_bb_cc);

      expect(updatedMaterials.size).toBe(1);
      expect(updatedMaterials.has(material)).toBe(true);
      expect((material as LineMaterial).color.getHex()).toBe(0xaa_bb_cc);
      expect(firstFatLine.geometry).toBe(firstGeometry);
      expect(secondFatLine.geometry).toBe(secondGeometry);
    });
  });
});
